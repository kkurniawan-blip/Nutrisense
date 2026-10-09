"""Ibu hamil: pregnancy profile, antenatal care (K6), LiLA/Hb checks, TTD/PMT, danger signs, birth plan, birth and nifas."""
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import serializers as S
from ..ai import growth, maternal as M
from ..ai.assistant import _PREG_LABELS  # the pregnancy danger-sign labels Nuri already uses
from ..database import get_db
from ..deps import OVERSIGHT, STAFF, get_current_user, lang_of, require_roles
from ..models import (AncExam, AncVisit, Child, Consent, HealthFacility, MaternalMeasurement, Pregnancy, PregnancyDailyLog, PregnancyDangerReport,
                      Region, User, utcnow)
from ..schemas import MeasurementIn, MotherRegisterIn
from ..security import hash_password
from ..services.assessment import run_assessment
from ..services.common import audit, find_by_phone, human_date, has_consent, normalize_phone, notify, notify_roles
from ..services.facility_sync import exam_view
from ..services.local import facility
from .family import ROLE_LABEL

router = APIRouter(prefix="/api", tags=["ibu hamil"])
HPHT_MAX_DAYS = 44 * 7  # an HPHT older than this is a typo, not a pregnancy still going on
# A danger report stays open until staff record an outcome. The cap stops a report nobody closed from keeping
# the mother red for the rest of her pregnancy.
DANGER_OPEN_DAYS = 14


# ---------- input ----------
class PregnancyIn(BaseModel):
    hpht: date | None = None
    gestational_weeks: float | None = Field(default=None, ge=1, le=42, description="If HPHT is not known")
    mother_height_cm: float | None = Field(default=None, gt=120, lt=200)
    education: str | None = Field(default=None, pattern="^(none|sd|smp|sma|higher)$")
    gravida: int | None = Field(default=None, ge=1, le=15)


class PregnancyUpdateIn(BaseModel):
    hpht: date | None = None
    mother_height_cm: float | None = Field(default=None, gt=120, lt=200)
    education: str | None = Field(default=None, pattern="^(none|sd|smp|sma|higher)$")
    gravida: int | None = Field(default=None, ge=1, le=15)
    birth_plan: dict | None = None


class MotherMeasurementIn(BaseModel):
    measured_at: date | None = None
    muac_cm: float | None = Field(default=None, gt=12, lt=50)
    hb_g_dl: float | None = Field(default=None, gt=3, lt=20)
    weight_kg: float | None = Field(default=None, gt=25, lt=150)
    client_uuid: str | None = Field(default=None, max_length=64)


class AncIn(BaseModel):
    number: int = Field(ge=1, le=6)
    visit_date: date | None = None
    place: str | None = Field(default=None, max_length=40)


class DailyIn(BaseModel):
    day: date | None = None
    ttd: bool | None = None
    pmt: bool | None = None


class DangerIn(BaseModel):
    signs: list[str] = []
    client_uuid: str | None = Field(default=None, max_length=64)


class DangerFollowUpIn(BaseModel):
    action: Literal["contacted"] | None = None
    outcome: Literal["went_to_facility", "advised_home", "not_reached"] | None = None
    client_uuid: str | None = Field(default=None, max_length=64)


class BirthIn(BaseModel):
    birth_date: date | None = None
    name: str = Field(min_length=1, max_length=160)
    sex: str = Field(pattern="^(male|female)$")
    birth_weight_kg: float = Field(gt=0.5, lt=7)
    birth_length_cm: float = Field(gt=30, lt=65)
    birth_place: str | None = Field(default=None, pattern="^(puskesmas|rs|bidan|polindes|home|on_the_way)$")
    birth_attendant: str | None = Field(default=None, pattern="^(bidan|dokter|dukun|family|none)$")
    gestational_weeks: float | None = Field(default=None, ge=20, le=44, description="At birth; from HPHT if not given")


class NifasIn(BaseModel):
    code: str = Field(pattern="^(KF[1-4]|KN[1-3])$")


# ---------- access ----------
def can_access(user: User, p: Pregnancy) -> bool:
    if user.role in OVERSIGHT:
        return True
    if user.role == "caregiver":
        return p.mother_id == user.id
    if user.role == "kader":
        return p.kader_id == user.id or p.region_id in user.coverage()
    return False


def get_pregnancy(pid: int, db: Session, user: User) -> Pregnancy:
    p = db.get(Pregnancy, pid)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pregnancy not found")
    if not can_access(user, p):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to this pregnancy")
    return p


def _region_kader(db: Session, region_id: int | None) -> User | None:
    if region_id is None:
        return None
    kaders = db.scalars(select(User).where(User.role == "kader", User.is_active.is_(True)).order_by(User.id)).all()
    return next((k for k in kaders if k.region_id == region_id), None) or next((k for k in kaders if region_id in k.coverage()), None)


# ---------- danger follow-up ----------
def _danger_cutoff():
    return utcnow() - timedelta(days=DANGER_OPEN_DAYS)


def _is_open(r: PregnancyDangerReport) -> bool:
    return bool(r.danger and r.outcome is None and r.created_at >= _danger_cutoff())


def _latest_danger(db: Session, pid: int) -> PregnancyDangerReport | None:
    """The latest report with a danger sign: a later common complaint (only "Mual") must not hide it."""
    return db.scalar(select(PregnancyDangerReport).where(PregnancyDangerReport.pregnancy_id == pid, PregnancyDangerReport.danger.is_(True))
                     .order_by(PregnancyDangerReport.id.desc()))


def _sign_label(key: str, L: str) -> str:
    text = _PREG_LABELS.get(key, (key, key))[0 if L == "id" else 1]
    return text[:1].upper() + text[1:]  # the labels are written to sit inside Nuri's sentences


def _danger_signs(r: PregnancyDangerReport, L: str) -> tuple[list[str], list[str]]:
    """Only the danger signs: they are what the alert is about (common complaints in the same report are advice only)."""
    keys = [s for s in r.signs or [] if s in M.DANGER_SIGNS]
    return keys, [_sign_label(k, L) for k in keys]


def _danger_view(r: PregnancyDangerReport, L: str) -> dict:
    keys, labels = _danger_signs(r, L)
    return {"id": r.id, "signs": keys, "sign_labels": labels, "created_at": r.created_at.isoformat(),
            "contacted_at": r.contacted_at.isoformat() if r.contacted_at else None,
            "contacted_by_name": r.contacted_by.full_name if r.contacted_by else None}


# ---------- view ----------
def _measurement(m: MaternalMeasurement) -> dict:
    return {"id": m.id, "measured_at": m.measured_at.isoformat(), "gestational_weeks": m.gestational_weeks, "muac_cm": m.muac_cm,
            "hb_g_dl": m.hb_g_dl, "weight_kg": m.weight_kg}


def view(db: Session, p: Pregnancy, lang: str, today: date | None = None) -> dict:
    today = today or date.today()
    L = "id" if lang == "id" else "en"
    days = M.gestational_days(p.hpht, min(today, p.delivered_at or today))
    weeks = days // 7
    ms = db.scalars(select(MaternalMeasurement).where(MaternalMeasurement.pregnancy_id == p.id)
                    .order_by(MaternalMeasurement.measured_at, MaternalMeasurement.id)).all()
    last_muac = next((m.muac_cm for m in reversed(ms) if m.muac_cm is not None), None)
    last_hb = next((m.hb_g_dl for m in reversed(ms) if m.hb_g_dl is not None), None)
    # The latest check-up from the Puskesmas/hospital adds blood pressure and the baby's heartbeat to the screening.
    # After the birth they no longer describe her or the baby, so they only count while the pregnancy is ongoing.
    exam = db.scalar(select(AncExam).where(AncExam.pregnancy_id == p.id).order_by(AncExam.exam_date.desc(), AncExam.id.desc()))
    current = exam if exam and p.status == "active" else None
    flags = M.mother_flags(last_muac, last_hb, p.mother_height_cm, (current.bp_systolic, current.bp_diastolic) if current else None,
                           current.fetal_heart_rate if current else None)
    visits = {v.number: {"visit_date": v.visit_date.isoformat(), "place": v.place}
              for v in db.scalars(select(AncVisit).where(AncVisit.pregnancy_id == p.id)).all()}
    schedule = M.anc_schedule(p.hpht, visits, today)
    logs = {g.day: g for g in db.scalars(select(PregnancyDailyLog).where(PregnancyDailyLog.pregnancy_id == p.id)).all()}
    week = [{"day": (today - timedelta(days=i)).isoformat(), "ttd": bool(logs.get(today - timedelta(days=i)) and logs[today - timedelta(days=i)].ttd),
             "pmt": bool(logs.get(today - timedelta(days=i)) and logs[today - timedelta(days=i)].pmt)} for i in range(6, -1, -1)]
    ttd_total = sum(1 for g in logs.values() if g.ttd)
    last_danger = _latest_danger(db, p.id)
    open_danger = last_danger if last_danger and _is_open(last_danger) else None
    kek = any(f["code"] == "kek" for f in flags)
    missed = sum(1 for v in schedule if v["status"] == "overdue") if p.status == "active" else 0
    risk = M.mother_risk(flags, last_muac is not None or last_hb is not None, missed, open_danger is not None and p.status == "active", L)

    team = [{"role": "mother", "emoji": "🤰", "name": p.mother.full_name, "label": {"id": "Ibu hamil", "en": "Mother"}[L], "phone": p.mother.phone}]
    if p.kader:
        team.append({"role": "kader", "emoji": "👩‍⚕️", "name": p.kader.full_name, "label": ROLE_LABEL["kader"][L], "phone": p.kader.phone})
    fac = facility(p.region)
    if fac:
        team.append({"role": "facility", "emoji": "🏥", "name": fac["name"], "phone": fac["phone"],
                     "label": {"id": "Bidan & Puskesmas", "en": "Midwife & Puskesmas"}[L]})

    # "Untuk hari ini": short lines, the same shape as the child checklist.
    today_log = logs.get(today)
    nxt = M.next_anc(schedule) if p.status == "active" else None
    items = []
    if p.status == "active" and open_danger:  # first, so it is the first line she reads
        items.append({"key": "danger", "status": "urgent", "action": "danger",
                      "text": {"id": "Tanda bahaya! Segera ke Puskesmas", "en": "Danger sign! Go to the Puskesmas"}[L]})
    if p.status == "active":
        items.append({"key": "ttd", "status": "ok" if today_log and today_log.ttd else "action", "action": "supplements",
                      "text": {"id": "Tablet tambah darah sudah diminum" if today_log and today_log.ttd else "Minum tablet tambah darah hari ini",
                               "en": "Iron tablet taken" if today_log and today_log.ttd else "Take today's iron tablet"}[L]})
        if kek:
            items.append({"key": "pmt", "status": "ok" if today_log and today_log.pmt else "action", "action": "supplements",
                          "text": {"id": "Makanan tambahan sudah dimakan" if today_log and today_log.pmt else "Makan makanan tambahan ibu hamil",
                                   "en": "Supplementary food eaten" if today_log and today_log.pmt else "Eat the supplementary food"}[L]})
        if nxt:
            st = "action" if nxt["status"] in ("due", "overdue") else "ok"
            when = {"overdue": {"id": "terlewat", "en": "overdue"}, "due": {"id": "sekarang", "en": "now"},
                    "upcoming": {"id": f"mulai {human_date(nxt['window_start'])}", "en": f"from {human_date(nxt['window_start'], 'en')}"}}[nxt["status"]][L]
            items.append({"key": "anc", "status": st, "action": "anc", "text": f"{'Periksa hamil ke-' if L == 'id' else 'Antenatal visit '}{nxt['number']}: {when}"})
        if not ms or (today - ms[-1].measured_at).days > 30:
            items.append({"key": "measure", "status": "action", "action": "measure",
                          "text": {"id": "Ukur lengan & cek darah bulan ini", "en": "Check LiLA & Hb this month"}[L]})

    out = {
        "id": p.id, "mother_id": p.mother_id, "mother_name": p.mother.full_name, "region": S.region(p.region) if p.region else None,
        "status": p.status, "hpht": p.hpht.isoformat(), "hpl": M.hpl(p.hpht).isoformat(),
        "gestational_days": days, "gestational_weeks": weeks, "gestational_extra_days": days % 7, "trimester": M.trimester(weeks),
        "days_to_hpl": (M.hpl(p.hpht) - today).days, "mother_height_cm": p.mother_height_cm, "education": p.education,
        "gravida": p.gravida, "birth_plan": p.birth_plan or {}, "measurements": [_measurement(m) for m in ms],
        "latest": {"muac_cm": last_muac, "hb_g_dl": last_hb}, "flags": flags, "risk": risk, "facility": fac,
        "anc": schedule, "next_anc": nxt, "anc_missed": missed,
        "anc_done": len(visits), "daily_week": week, "today_log": {"ttd": bool(today_log and today_log.ttd), "pmt": bool(today_log and today_log.pmt)},
        "ttd_total": ttd_total, "pmt_needed": kek, "today": items, "care_team": team,
        "delivered_at": p.delivered_at.isoformat() if p.delivered_at else None, "child_id": p.child_id, "birth_info": p.birth_info or {},
        "nifas": M.nifas_schedule(p.delivered_at, p.nifas_done or [], today) if p.delivered_at else None,
        "latest_exam": exam_view(exam) if exam else None,
        "open_danger": _danger_view(open_danger, L) if open_danger else None,
        "facility_link": {"enabled": bool(p.facility_sync),
                          "facility": (db.get(HealthFacility, p.linked_facility_id).name if p.linked_facility_id else None),
                          "last_sync_at": p.last_sync_at.isoformat() if p.last_sync_at else None},
    }
    return out


# ---------- routes ----------
@router.get("/pregnancies")
def list_pregnancies(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = select(Pregnancy)
    if user.role == "caregiver":
        q = q.where(Pregnancy.mother_id == user.id)
    elif user.role == "kader":
        q = q.where((Pregnancy.kader_id == user.id) | (Pregnancy.region_id.in_(user.coverage())))
    elif user.role not in OVERSIGHT:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed")
    rows = db.scalars(q.order_by(Pregnancy.id.desc())).all()
    today = date.today()
    # Show active pregnancies and those still in the 42-day nifas period.
    rows = [p for p in rows if p.status == "active" or (p.delivered_at and (today - p.delivered_at).days <= 42)]
    return [view(db, p, lang_of(user), today) for p in rows]


@router.post("/pregnancies", status_code=201)
def create_pregnancy(body: PregnancyIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role != "caregiver":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the mother can add her pregnancy here")
    if not has_consent(db, user.id, "data_processing"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Consent to data processing is required")
    today = date.today()
    hpht = body.hpht or (M.hpht_from_weeks(body.gestational_weeks, today) if body.gestational_weeks else None)
    if hpht is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Give the HPHT date or the weeks of pregnancy")
    if hpht > today or (today - hpht).days > HPHT_MAX_DAYS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "HPHT must be within the last 44 weeks")
    if db.scalar(select(Pregnancy).where(Pregnancy.mother_id == user.id, Pregnancy.status == "active")):
        raise HTTPException(status.HTTP_409_CONFLICT, "There is already an active pregnancy")
    kader = _region_kader(db, user.region_id)
    p = Pregnancy(mother_id=user.id, region_id=user.region_id, kader_id=kader.id if kader else None, hpht=hpht,
                  mother_height_cm=body.mother_height_cm, education=body.education, gravida=body.gravida, birth_plan={})
    db.add(p)
    db.flush()
    audit(db, user, "create_pregnancy", "pregnancy", p.id)
    db.commit()
    db.refresh(p)
    return view(db, p, lang_of(user))


@router.post("/kader/mothers", status_code=201)
def register_mother(body: MotherRegisterIn, user: User = Depends(require_roles("kader", "officer", "admin")),
                    db: Session = Depends(get_db)):
    """Tambah ibu hamil: a Kader registers a pregnant mother. She gets an account on her phone number and a
    temporary password (8 digits) to log in later; the Kader reads it to her once."""
    import secrets

    if not body.consent_given:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The mother's consent is required")
    phone = normalize_phone(body.phone)
    if not phone or len(phone) < 8:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter the mother's phone number in digits")
    region_id = body.region_id or user.region_id
    if region_id is None or db.get(Region, region_id) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choose the mother's village")
    if user.role == "kader" and region_id not in user.coverage():
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This village is outside your area")
    today = date.today()
    hpht = body.hpht or (M.hpht_from_weeks(body.gestational_weeks, today) if body.gestational_weeks else None)
    if hpht is None or hpht > today or (today - hpht).days > HPHT_MAX_DAYS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Give the HPHT date or the weeks of pregnancy")
    mother = find_by_phone(db, phone)
    temp_password = None
    # One plain answer for a staff number and for a mother outside this Kader's villages, so numbers cannot be probed.
    if mother is not None and (mother.role != "caregiver" or (user.role == "kader" and mother.region_id is not None
                                                               and mother.region_id not in user.coverage())):
        raise HTTPException(status.HTTP_409_CONFLICT, "This phone number is already used by another account. Check the number, "
                                                      "or ask the mother to add her pregnancy in her own app.")
    if mother is None:
        temp_password = f"{secrets.randbelow(10**8):08d}"
        mother = User(email=None, phone=phone, full_name=body.full_name.strip(), password_hash=hash_password(temp_password),
                      role="caregiver", region_id=region_id, language="id")
        db.add(mother)
        db.flush()
        for scope, granted in (("data_processing", True), ("ai_analysis", True), ("satusehat_sharing", False), ("research_use", False)):
            db.add(Consent(user_id=mother.id, scope=scope, granted=granted))
        audit(db, user, "register_mother", "user", mother.id, consent="verbal, witnessed by kader")
    elif db.scalar(select(Pregnancy).where(Pregnancy.mother_id == mother.id, Pregnancy.status == "active")):
        raise HTTPException(status.HTTP_409_CONFLICT, "This mother already has an active pregnancy")
    kader = user if user.role == "kader" else _region_kader(db, region_id)
    p = Pregnancy(mother_id=mother.id, region_id=region_id, kader_id=kader.id if kader else None, hpht=hpht,
                  mother_height_cm=body.mother_height_cm, education=body.education, gravida=body.gravida, birth_plan={})
    db.add(p)
    db.flush()
    audit(db, user, "create_pregnancy", "pregnancy", p.id, by="kader")
    db.commit()
    db.refresh(p)
    # Only who she is: an existing account's email and phone are not shown; a new one's phone is the number just typed.
    return {"mother": {"id": mother.id, "full_name": mother.full_name, "phone": phone if temp_password else None},
            "temp_password": temp_password, "pregnancy": view(db, p, lang_of(user))}


@router.get("/pregnancies/{pid}")
def get_pregnancy_detail(pid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = get_pregnancy(pid, db, user)
    return view(db, p, lang_of(user))


@router.patch("/pregnancies/{pid}")
def update_pregnancy(pid: int, body: PregnancyUpdateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = get_pregnancy(pid, db, user)
    data = body.model_dump(exclude_unset=True)
    if "hpht" in data and data["hpht"] != p.hpht:
        if p.status != "active":
            raise HTTPException(status.HTTP_409_CONFLICT, "The birth is recorded; HPHT can no longer change")
        if data["hpht"] is None or data["hpht"] > date.today() or (date.today() - data["hpht"]).days > HPHT_MAX_DAYS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "HPHT must be within the last 44 weeks")
    if "birth_plan" in data:
        allowed = {"place", "transport", "companion", "helper", "blood_donor", "funding"}
        data["birth_plan"] = {k: str(v)[:80] for k, v in (data["birth_plan"] or {}).items() if k in allowed and v}
    for k, v in data.items():
        setattr(p, k, v)
    audit(db, user, "update_pregnancy", "pregnancy", p.id, fields=list(data))
    db.commit()
    return view(db, p, lang_of(user))


@router.post("/pregnancies/{pid}/measurements", status_code=201)
def add_mother_measurement(pid: int, body: MotherMeasurementIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = get_pregnancy(pid, db, user)
    if body.muac_cm is None and body.hb_g_dl is None and body.weight_kg is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter LiLA, Hb or weight")
    if body.client_uuid and (m := db.scalar(select(MaternalMeasurement).where(MaternalMeasurement.client_uuid == body.client_uuid))):
        if m.pregnancy_id != p.id:  # never hand back another pregnancy's values
            raise HTTPException(status.HTTP_409_CONFLICT, "This client_uuid is already used")
        return {"measurement": _measurement(m), "flags": M.mother_flags(m.muac_cm, m.hb_g_dl, p.mother_height_cm), "created": False}
    on = body.measured_at or date.today()
    if on > date.today() or on < p.hpht:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Date must be between HPHT and today")
    m = MaternalMeasurement(pregnancy_id=p.id, measured_at=on, gestational_weeks=round(M.gestational_days(p.hpht, on) / 7, 1),
                            muac_cm=body.muac_cm, hb_g_dl=body.hb_g_dl, weight_kg=body.weight_kg, client_uuid=body.client_uuid,
                            recorded_by_id=user.id)
    db.add(m)
    db.flush()
    flags = M.mother_flags(body.muac_cm, body.hb_g_dl, None)
    if flags:
        names = {"kek": "KEK (LiLA < 23,5 cm)", "anemia": "Anemia (Hb < 11 g/dL)", "severe_anemia": "Anemia berat (Hb < 7 g/dL)"}
        text = ", ".join(names[f["code"]] for f in flags if f["code"] in names)
        notify_roles(db, ["kader"], p.region_id, "mother_flag", {"id": "Ibu hamil perlu perhatian", "en": "Pregnant mother needs attention"},
                     f"{p.mother.full_name}: {text}", pregnancy_id=p.id)
    audit(db, user, "record_mother_measurement", "pregnancy", p.id, measurement_id=m.id)
    db.commit()
    return {"measurement": _measurement(m), "flags": flags, "created": True}


@router.post("/pregnancies/{pid}/anc", status_code=201)
def record_anc(pid: int, body: AncIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = get_pregnancy(pid, db, user)
    on = body.visit_date or date.today()
    if on > date.today() or on < p.hpht:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Visit date must be between HPHT and today")
    v = db.scalar(select(AncVisit).where(AncVisit.pregnancy_id == p.id, AncVisit.number == body.number))
    if v is None:
        v = AncVisit(pregnancy_id=p.id, number=body.number, visit_date=on, place=body.place, recorded_by_id=user.id)
        db.add(v)
    else:
        v.visit_date, v.place = on, body.place
    audit(db, user, "record_anc", "pregnancy", p.id, number=body.number)
    db.commit()
    return view(db, p, lang_of(user))


@router.delete("/pregnancies/{pid}/anc/{number}")
def undo_anc(pid: int, number: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = get_pregnancy(pid, db, user)
    v = db.scalar(select(AncVisit).where(AncVisit.pregnancy_id == p.id, AncVisit.number == number))
    if v:
        db.delete(v)
        db.commit()
    return view(db, p, lang_of(user))


@router.post("/pregnancies/{pid}/daily")
def daily_log(pid: int, body: DailyIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = get_pregnancy(pid, db, user)
    day = body.day or date.today()
    if day > date.today() or (date.today() - day).days > 30:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Day must be within the last 30 days")
    g = db.scalar(select(PregnancyDailyLog).where(PregnancyDailyLog.pregnancy_id == p.id, PregnancyDailyLog.day == day))
    if g is None:
        g = PregnancyDailyLog(pregnancy_id=p.id, day=day, ttd=False, pmt=False)
        db.add(g)
    if body.ttd is not None:
        g.ttd = body.ttd
    if body.pmt is not None:
        g.pmt = body.pmt
    db.commit()
    return view(db, p, lang_of(user))


@router.post("/pregnancies/{pid}/danger", status_code=201)
def report_danger(pid: int, body: DangerIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = get_pregnancy(pid, db, user)
    signs = [s for s in body.signs if s in M.DANGER_SIGNS or s in M.COMMON_COMPLAINTS]
    danger = any(s in M.DANGER_SIGNS for s in signs)
    replay = body.client_uuid and db.scalar(select(PregnancyDangerReport).where(
        PregnancyDangerReport.pregnancy_id == p.id, PregnancyDangerReport.client_uuid == body.client_uuid))
    if replay:  # a report queued offline and sent again: answer as before, without a second alert to the Kader
        return {"danger": replay.danger, "signs": replay.signs, "kader": {"name": p.kader.full_name, "phone": p.kader.phone} if p.kader else None,
                "facility": facility(p.region)}
    r = PregnancyDangerReport(pregnancy_id=p.id, signs=signs, danger=danger, reported_by_id=user.id, client_uuid=body.client_uuid)
    db.add(r)
    db.flush()
    if danger:  # the doctor too, as for a child emergency: the Kader may be out of signal
        notify_roles(db, ["kader", "doctor"], p.region_id, "mother_danger", {"id": "Tanda bahaya kehamilan", "en": "Pregnancy danger sign"},
                     {"id": f"{p.mother.full_name} melaporkan tanda bahaya. Segera hubungi.", "en": f"{p.mother.full_name} reported a danger sign. Contact her now."},
                     pregnancy_id=p.id, report_id=r.id)
    audit(db, user, "report_pregnancy_danger", "pregnancy", p.id, signs=signs)
    db.commit()
    return {"danger": danger, "signs": signs, "kader": {"name": p.kader.full_name, "phone": p.kader.phone} if p.kader else None,
            "facility": facility(p.region)}


@router.patch("/pregnancies/{pid}/danger/{rid}")
def follow_up_danger(pid: int, rid: int, body: DangerFollowUpIn, user: User = Depends(require_roles(*STAFF)), db: Session = Depends(get_db)):
    """Staff record that they reached the mother, then what happened; the outcome closes the report.
    "not_reached" is only a logged attempt: a mother nobody could reach must stay open and urgent, so the report is
    not closed and no contact is recorded. Replays are safe: the first contact time and the first outcome are kept."""
    p = get_pregnancy(pid, db, user)
    r = db.get(PregnancyDangerReport, rid)
    if r is None or r.pregnancy_id != p.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Danger report not found for this pregnancy")
    if not r.danger:
        raise HTTPException(422, "This report has no danger sign to follow up")
    if body.action is None and body.outcome is None:
        raise HTTPException(422, 'Send {"action": "contacted"} or an outcome')
    if body.outcome == "not_reached":
        audit(db, user, "danger_not_reached", "pregnancy", p.id, report_id=r.id)
        db.commit()
        return {"open_danger": _danger_view(r, lang_of(user)) if _is_open(r) else None, "outcome": r.outcome, "attempt": "not_reached"}
    if body.outcome and r.outcome and body.outcome != r.outcome:
        raise HTTPException(status.HTTP_409_CONFLICT, "An outcome is already recorded for this report")
    now = utcnow()
    if r.contacted_at is None:
        r.contacted_at, r.contacted_by_id = now, user.id
        audit(db, user, "danger_contacted", "pregnancy", p.id, report_id=r.id)
    if body.outcome and r.outcome is None:
        r.outcome, r.outcome_at, r.outcome_by_id = body.outcome, now, user.id
        audit(db, user, "danger_outcome", "pregnancy", p.id, report_id=r.id, outcome=body.outcome)
    db.commit()
    db.refresh(r)
    return {"open_danger": _danger_view(r, lang_of(user)) if _is_open(r) else None, "outcome": r.outcome}


@router.get("/kader/danger-open")
def open_danger_reports(user: User = Depends(require_roles(*STAFF)), db: Session = Depends(get_db)):
    """Danger reports nobody has closed yet, newest first: one per pregnancy (its latest danger report)."""
    q = (select(PregnancyDangerReport, Pregnancy).join(Pregnancy, Pregnancy.id == PregnancyDangerReport.pregnancy_id)
         .where(PregnancyDangerReport.danger.is_(True), PregnancyDangerReport.created_at >= _danger_cutoff()))
    if user.role == "kader":
        q = q.where((Pregnancy.kader_id == user.id) | (Pregnancy.region_id.in_(user.coverage())))
    L, seen, out = lang_of(user), set(), []
    for r, p in db.execute(q.order_by(PregnancyDangerReport.created_at.desc(), PregnancyDangerReport.id.desc())).all():
        if p.id in seen:
            continue
        seen.add(p.id)
        if r.outcome is None:
            keys, labels = _danger_signs(r, L)
            out.append({"report_id": r.id, "pregnancy_id": p.id, "mother_name": p.mother.full_name, "mother_phone": p.mother.phone,
                        "region_name": p.region.name if p.region else None, "signs": keys, "sign_labels": labels,
                        "created_at": r.created_at.isoformat(), "contacted_at": r.contacted_at.isoformat() if r.contacted_at else None})
    return out


@router.post("/pregnancies/{pid}/birth", status_code=201)
def record_birth(pid: int, body: BirthIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Catat kelahiran: close the pregnancy, create the child's profile with the birth measurement, start nifas."""
    p = get_pregnancy(pid, db, user)
    if p.status != "active":
        raise HTTPException(status.HTTP_409_CONFLICT, "This birth is already recorded")
    born = body.birth_date or date.today()
    if born > date.today() or born < p.hpht + timedelta(weeks=20):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Birth date must be after 20 weeks of pregnancy and not in the future")
    weeks = body.gestational_weeks or round(M.gestational_days(p.hpht, born) / 7, 1)
    child = Child(name=body.name, sex=body.sex, birth_date=born, caregiver_id=p.mother_id, kader_id=p.kader_id, region_id=p.region_id,
                  birth_weight_kg=body.birth_weight_kg, birth_length_cm=body.birth_length_cm, birth_gestational_weeks=weeks)
    db.add(child)
    db.flush()
    from .children import _record_measurement

    m, _ = _record_measurement(db, child, MeasurementIn(measured_at=born, weight_kg=body.birth_weight_kg, height_cm=body.birth_length_cm,
                                                        position="lying", run_assessment=False), user)
    p.status, p.delivered_at, p.child_id = "delivered", born, child.id
    p.birth_info = {"place": body.birth_place, "attendant": body.birth_attendant, "gestational_weeks": weeks}
    premature = weeks < M.TERM_WEEKS
    if p.kader_id:
        extra = {"id": (" BBLR." if body.birth_weight_kg < 2.5 else "") + (" Prematur." if premature else ""),
                 "en": (" Low birth weight." if body.birth_weight_kg < 2.5 else "") + (" Premature." if premature else "")}
        notify(db, p.kader_id, "birth", {"id": "Kelahiran baru", "en": "New birth"},
               {"id": f"{p.mother.full_name} melahirkan {body.name} ({body.birth_weight_kg} kg).{extra['id']} Jadwalkan kunjungan nifas.",
                "en": f"{p.mother.full_name} gave birth to {body.name} ({body.birth_weight_kg} kg).{extra['en']} Plan the postpartum visits."},
               pregnancy_id=p.id, child_id=child.id)
    audit(db, user, "record_birth", "pregnancy", p.id, child_id=child.id)
    db.commit()
    db.refresh(child)
    # The child's first status comes from the birth size, so home shows it at once.
    run_assessment(db, child, user, lang_of(user), measurement_id=m.id, use_ai=has_consent(db, child.caregiver_id, "ai_analysis"))
    db.refresh(child)
    return {"child": S.child(child), "pregnancy": view(db, p, lang_of(user)), "low_birth_weight": body.birth_weight_kg < 2.5,
            "premature": premature, "gestational_weeks": weeks,
            "z": growth.compute_z_scores(body.sex, 0, body.birth_weight_kg, body.birth_length_cm, "lying").as_dict()}


@router.post("/pregnancies/{pid}/nifas")
def mark_nifas(pid: int, body: NifasIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = get_pregnancy(pid, db, user)
    if not p.delivered_at:
        raise HTTPException(status.HTTP_409_CONFLICT, "Record the birth first")
    done = set(p.nifas_done or [])
    done ^= {body.code}  # tap again to undo
    p.nifas_done = sorted(done)
    db.commit()
    return view(db, p, lang_of(user))
