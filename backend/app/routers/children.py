from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import serializers as S
from ..ai import growth, symptoms as symptom_ai
from ..database import get_db
from ..deps import OVERSIGHT, get_child, get_current_user, lang_of, require_roles
from ..models import Child, GrowthMeasurement, Region, RiskAssessment, SymptomReport, User
from ..schemas import ChildIn, ChildUpdateIn, MeasurementIn, SymptomIn, SyncBatchIn
from ..services.assessment import run_assessment
from ..services.common import audit, find_by_phone, has_consent, notify_roles

router = APIRouter(prefix="/api", tags=["children & growth"])


def _latest_assessment(db: Session, child_id: int) -> RiskAssessment | None:
    return db.scalar(select(RiskAssessment).where(RiskAssessment.child_id == child_id).order_by(RiskAssessment.id.desc()))


@router.get("/children")
def list_children(region_id: int | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = select(Child)
    if user.role == "caregiver":
        q = q.where(Child.caregiver_id == user.id)
    elif user.role == "kader":
        q = q.where((Child.kader_id == user.id) | (Child.region_id.in_(user.coverage())))
    if region_id:
        q = q.where(Child.region_id == region_id)
    return [S.child(c, _latest_assessment(db, c.id)) for c in db.scalars(q.order_by(Child.name)).all()]


@router.post("/children", status_code=201)
def create_child(body: ChildIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role == "caregiver":
        caregiver = user
    elif user.role in ("kader", "officer", "doctor", "admin"):
        if not body.caregiver_email and not body.caregiver_phone:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "caregiver_email or caregiver_phone is required when staff register a child")
        if body.caregiver_email:
            caregiver = db.scalar(select(User).where(User.email == body.caregiver_email.lower()))
        else:
            caregiver = find_by_phone(db, body.caregiver_phone)
        if caregiver is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No caregiver account with that email or phone; register the caregiver first")
        # Same answer for a staff account and for a mother outside the Kader's villages, so neither can be probed.
        if caregiver.role != "caregiver" or (user.role == "kader" and caregiver.region_id is not None
                                             and caregiver.region_id not in user.coverage()):
            raise HTTPException(status.HTTP_409_CONFLICT, "This email or phone belongs to an account you cannot add a child to")
    else:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed")
    if not has_consent(db, caregiver.id, "data_processing"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Caregiver has not consented to data processing")
    if body.birth_date > date.today() or growth.age_in_months(body.birth_date, date.today()) > 60.9:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "NutriSense supports children aged 0-60 months")
    region_id = body.region_id or caregiver.region_id or (user.region_id if user.role == "kader" else None)
    if region_id is not None and db.get(Region, region_id) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown region")
    if user.role == "kader" and region_id not in user.coverage():
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This village is outside your area")
    kader_id = user.id if user.role == "kader" else None
    if kader_id is None and region_id is not None:
        kaders = db.scalars(select(User).where(User.role == "kader", User.is_active.is_(True)).order_by(User.id)).all()
        kader = next((k for k in kaders if k.region_id == region_id), None) or next((k for k in kaders if region_id in k.coverage()), None)
        kader_id = kader.id if kader else None
    child = Child(name=body.name, sex=body.sex, birth_date=body.birth_date, caregiver_id=caregiver.id, kader_id=kader_id,
                  region_id=region_id, birth_weight_kg=body.birth_weight_kg, birth_length_cm=body.birth_length_cm,
                  clean_water_access=body.clean_water_access, sanitation_access=body.sanitation_access,
                  exclusive_breastfeeding=body.exclusive_breastfeeding)
    db.add(child)
    db.flush()
    audit(db, user, "create_child", "child", child.id)
    db.commit()
    db.refresh(child)
    return S.child(child)


@router.get("/children/{child_id}")
def get_child_detail(child_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    child = get_child(child_id, db, user)
    audit(db, user, "view_child", "child", child.id)
    db.commit()
    from .family import care_info

    return {**S.child(child, _latest_assessment(db, child.id)), **care_info(db, child, lang_of(user))}


@router.patch("/children/{child_id}")
def update_child(child_id: int, body: ChildUpdateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    child = get_child(child_id, db, user)
    data = body.model_dump(exclude_unset=True)
    if any(data.get(f) is None for f in ("name", "clean_water_access", "sanitation_access") if f in data):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Name, clean water and sanitation cannot be empty")
    if data.get("region_id") is not None and db.get(Region, data["region_id"]) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown region")
    if "kader_id" in data and user.role not in OVERSIGHT:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only officers can reassign Kaders")
    if data.get("kader_id") is not None:
        k = db.get(User, data["kader_id"])
        if k is None or k.role != "kader" or not k.is_active:
            raise HTTPException(422, "kader_id must be an active Kader")
    for field, value in data.items():
        setattr(child, field, value)
    audit(db, user, "update_child", "child", child.id, fields=list(data))
    db.commit()
    db.refresh(child)
    return S.child(child, _latest_assessment(db, child.id))


@router.delete("/children/{child_id}", status_code=204)
def delete_child(child_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Right to deletion: the caregiver (or an admin) can erase a child's record."""
    child = get_child(child_id, db, user)
    if user.role not in ("caregiver", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the caregiver or an admin can delete a record")
    links = _notification_links(db, child)
    from ..models import (BreastfeedingLog, Case, ChatMessage, Consent, DevelopmentCheck, FhirSyncLog, KiaRecord, MealLog,
                          Notification, NutritionRecommendation, Pregnancy, SupplyRequest)

    for model in (NutritionRecommendation, MealLog, ChatMessage, FhirSyncLog, Consent, DevelopmentCheck, KiaRecord, BreastfeedingLog):
        for row in db.scalars(select(model).where(model.child_id == child.id)).all():
            db.delete(row)
    for req in db.scalars(select(SupplyRequest).where(SupplyRequest.child_id == child.id)).all():
        if req.status in ("in_transit", "ready_for_pickup"):
            raise HTTPException(status.HTTP_409_CONFLICT, "A supply package is in progress; cancel or collect it first")
        db.delete(req)
    db.flush()  # packages point at the case: they must be gone before it (PostgreSQL enforces the link)
    for row in db.scalars(select(Case).where(Case.child_id == child.id)).all():
        db.delete(row)
    for p in db.scalars(select(Pregnancy).where(Pregnancy.child_id == child.id)).all():
        p.child_id = None  # the mother's pregnancy record stays hers
    # Notifications name the child; JSON filters differ per database, so match their links in Python.
    for n in db.scalars(select(Notification).where(Notification.user_id.in_(_recipients(db, child)))).all():
        if any(isinstance(v, int) and (k, v) in links for k, v in (n.data or {}).items()):
            db.delete(n)
    db.flush()
    for model in (RiskAssessment, SymptomReport):  # assessments point at symptom reports: delete them first
        for row in db.scalars(select(model).where(model.child_id == child.id)).all():
            db.delete(row)
        db.flush()
    audit(db, user, "delete_child", "child", child.id)
    db.delete(child)
    db.commit()


def _notification_links(db: Session, child: Child) -> set[tuple[str, int]]:
    """The notification data keys that point at this child or its records (cases, assessments, packages, measurements)."""
    from ..models import Case, SupplyRequest

    links = {("child_id", child.id)} | {("measurement_id", m.id) for m in child.measurements}
    for key, model in (("case_id", Case), ("assessment_id", RiskAssessment), ("supply_request_id", SupplyRequest)):
        links |= {(key, i) for i in db.scalars(select(model.id).where(model.child_id == child.id)).all()}
    return links


def _recipients(db: Session, child: Child) -> list[int]:
    """Everyone who can have been notified about the child: the family and the staff."""
    staff = db.scalars(select(User.id).where(User.role.in_(("kader", "officer", "doctor", "admin")))).all()
    return [child.caregiver_id, *staff]


def _existing_measurement(db: Session, child: Child, client_uuid: str) -> GrowthMeasurement | None:
    """A retry of an offline upload returns the saved row; the same id on another child is a conflict, never its data."""
    m = db.scalar(select(GrowthMeasurement).where(GrowthMeasurement.client_uuid == client_uuid))
    if m is not None and m.child_id != child.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "This client_uuid is already used")
    return m


def _record_measurement(db: Session, child: Child, body: MeasurementIn, user: User) -> tuple[GrowthMeasurement, bool]:
    if body.client_uuid:
        existing = _existing_measurement(db, child, body.client_uuid)
        if existing:
            return existing, False
    measured_at = body.measured_at or date.today()
    if measured_at > date.today() or measured_at < child.birth_date:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Measurement date must be between birth date and today")
    age = growth.age_in_months(child.birth_date, measured_at)
    try:
        z = growth.compute_z_scores(child.sex, age, body.weight_kg, body.height_cm, body.position)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    errors = growth.plausibility_errors(age, body.weight_kg, body.height_cm, z)
    if errors:
        raise HTTPException(422,
                            {"message": "Biologically implausible measurement; please re-measure", "flags": errors, "z_scores": z.as_dict()})
    measured_by = body.measured_by or ("kader" if user.role == "kader" else "mother")
    m = GrowthMeasurement(child_id=child.id, measured_at=measured_at, age_months=age, weight_kg=body.weight_kg,
                          height_cm=body.height_cm, muac_cm=body.muac_cm, position=body.position, haz=z.haz, waz=z.waz,
                          whz=z.whz, source="kader" if user.role == "kader" else body.source, client_uuid=body.client_uuid,
                          recorded_by_id=user.id, measured_by=measured_by, oedema=body.oedema)
    db.add(m)
    try:
        db.flush()
    except IntegrityError:
        # Two uploads of the same entry at once: the second insert hits the unique key, so hand back the first one.
        # Callers that pass a client_uuid have nothing else pending, so the rollback loses no other write.
        db.rollback()
        existing = _existing_measurement(db, child, body.client_uuid) if body.client_uuid else None
        if existing is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "This measurement could not be saved; try again")
        return existing, False
    if body.oedema:
        # Oedema of both feet is a sign of severe acute malnutrition: tell the Kader and staff at once.
        notify_roles(db, ["kader", "officer", "doctor"], child.region_id, "oedema",
                     {"id": f"Bengkak kedua kaki: {child.name}", "en": f"Oedema of both feet: {child.name}"},
                     {"id": "Tanda gizi buruk. Rujuk ke Puskesmas hari ini.", "en": "A sign of severe malnutrition. Refer to the Puskesmas today."},
                     child_id=child.id, measurement_id=m.id)
    audit(db, user, "record_measurement", "child", child.id, measurement_id=m.id, measured_by=measured_by, oedema=bool(body.oedema))
    return m, True


@router.get("/children/{child_id}/measurements")
def list_measurements(child_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    child = get_child(child_id, db, user)
    return [S.measurement(m) for m in child.measurements]


@router.post("/children/{child_id}/measurements", status_code=201)
def add_measurement(child_id: int, body: MeasurementIn, lang: str | None = None, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    """Save a measurement, compute WHO z-scores and (by default) run the full AI assessment pipeline."""
    child = get_child(child_id, db, user)
    m, created = _record_measurement(db, child, body, user)
    db.commit()
    db.refresh(child)
    result = {"measurement": S.measurement(m), "created": created, "assessment": None}
    if created and body.run_assessment:
        # WHO rules, triage, cases and Kader alerts run for every child; only the LLM text needs the ai_analysis consent.
        result["assessment"] = S.assessment(run_assessment(db, child, user, lang_of(user, lang), measurement_id=m.id,
                                                           use_ai=has_consent(db, child.caregiver_id, "ai_analysis")))
    return result


@router.post("/sync", tags=["offline sync"])
def sync_offline(body: SyncBatchIn, lang: str | None = None, user: User = Depends(require_roles("kader", "caregiver", "officer", "admin")),
                 db: Session = Depends(get_db)):
    """Upload measurements captured offline. Idempotent via client_uuid; each item reports its own outcome."""
    results = []
    touched: dict[int, int] = {}
    for raw in body.measurements:
        try:
            child_id = int(raw.get("child_id"))
            item = MeasurementIn(**{k: v for k, v in raw.items() if k != "child_id"})
            child = get_child(child_id, db, user)
            m, created = _record_measurement(db, child, item, user)
            db.commit()
            if created:
                touched[child.id] = m.id
            results.append({"client_uuid": item.client_uuid, "status": "created" if created else "duplicate", "measurement_id": m.id})
        except HTTPException as e:
            db.rollback()
            results.append({"client_uuid": raw.get("client_uuid"), "status": "error", "detail": e.detail})
        except (ValueError, TypeError, IntegrityError) as e:
            db.rollback()
            results.append({"client_uuid": raw.get("client_uuid"), "status": "error", "detail": str(e)})
    assessed = []
    for child_id, mid in touched.items():
        child = db.get(Child, child_id)
        db.refresh(child)
        a = run_assessment(db, child, user, lang_of(user, lang), measurement_id=mid,
                           use_ai=has_consent(db, child.caregiver_id, "ai_analysis"))
        assessed.append({"child_id": child_id, "risk_level": a.risk_level})
    return {"results": results, "assessed": assessed}


_INDICATOR = {
    "hfa": {"id": "Tinggi menurut umur (TB/U)", "en": "Height-for-age (HAZ)"},
    "wfa": {"id": "Berat menurut umur (BB/U)", "en": "Weight-for-age (WAZ)"},
    "wfh": {"id": "Berat menurut tinggi (BB/TB)", "en": "Weight-for-height (WHZ)"},
}


def _meaning(indicator: str, z: float | None, trend_status: str | None, name: str, lang: str) -> str:
    """Plain-language explanation of a z-score for parents (no jargon, no diagnosis)."""
    L = lang == "id"
    if z is None:
        return "Belum ada data." if L else "No data yet."
    if indicator == "hfa":
        if z < -3:
            t = (f"Tinggi {name} jauh di bawah anak seusianya. Sebaiknya segera diperiksa oleh tenaga kesehatan."
                 if L else f"{name}'s height is far below other children the same age. Please see a health worker soon.")
        elif z < -2:
            t = (f"Tinggi {name} berada di bawah batas normal anak seusianya. Diskusikan dengan Kader dan terus pantau setiap bulan."
                 if L else f"{name}'s height is below the normal range for their age. Talk with your Kader and keep measuring every month.")
        elif z < 0:
            t = (f"Tinggi {name} saat ini berada di bawah rata-rata anak seusianya. Yang penting adalah memantau perubahan dari waktu ke waktu."
                 if L else f"{name}'s height is currently below the average for their age. What matters most is how it changes over time.")
        else:
            t = f"Tinggi {name} sesuai dengan anak seusianya. Pertahankan ya!" if L else f"{name}'s height is on track for their age. Keep it up!"
        if trend_status in ("declining", "projected_stunting"):
            t += " Beberapa bulan terakhir pertambahan tingginya melambat." if L else " Height gain has slowed over recent months."
        elif trend_status == "catching_up":
            t += " Kabar baik: pertumbuhannya mulai mengejar." if L else " Good news: growth is catching up."
        return t
    if indicator == "wfa":
        if z < -2:
            return (f"Berat {name} di bawah batas normal anak seusianya. Perhatikan porsi dan protein hewani setiap hari."
                    if L else f"{name}'s weight is below the normal range for their age. Focus on portions and animal protein daily.")
        if z < 0:
            return (f"Berat {name} sedikit di bawah rata-rata anak seusianya. Pantau terus kenaikan beratnya setiap bulan."
                    if L else f"{name}'s weight is a little below average for their age. Keep checking that it goes up every month.")
        return f"Berat {name} sesuai dengan anak seusianya." if L else f"{name}'s weight is on track for their age."
    if z < -3:
        return (f"{name} sangat kurus untuk tingginya. Segera periksakan ke Puskesmas."
                if L else f"{name} is very thin for their height. Please go to the Puskesmas soon.")
    if z < -2:
        return (f"{name} kurus untuk tingginya. Diskusikan dengan Kader tentang tambahan makanan bergizi."
                if L else f"{name} is thin for their height. Talk with your Kader about extra nutritious food.")
    if z > 2:
        return (f"Berat {name} lebih dari yang dianjurkan untuk tingginya. Kurangi makanan manis dan jajanan."
                if L else f"{name} weighs more than recommended for their height. Cut back on sweet snacks.")
    return f"Berat {name} seimbang dengan tingginya." if L else f"{name}'s weight is in balance with their height."


@router.get("/children/{child_id}/growth-chart")
def growth_chart(child_id: int, indicator: str = "hfa", lang: str | None = None, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    """Child's points plus WHO reference curves (-3, -2, 0, +2 SD), a plain-language meaning and technical details.

    hfa / wfa: x = age in months. wfh: x = length/height in cm (weight-for-length below 24 months).
    """
    child = get_child(child_id, db, user)
    if indicator not in ("hfa", "wfa", "wfh"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "indicator must be hfa, wfa or wfh")
    L = lang_of(user, lang)
    ms = child.measurements
    latest = _latest_assessment(db, child.id)
    last = ms[-1] if ms else None
    if indicator == "wfh":
        ref_key = "wfl" if (last and last.age_months < 24) else "wfh"
        points = [{"x": m.height_cm, "age_months": m.age_months, "value": m.weight_kg, "z": m.whz,
                   "measured_at": m.measured_at.isoformat()} for m in ms]
        reference, z_key, cls = growth.reference_curve(child.sex, ref_key), "whz", growth.classify_whz
    else:
        value = "height_cm" if indicator == "hfa" else "weight_kg"
        z_key = "haz" if indicator == "hfa" else "waz"
        points = [{"x": m.age_months, "age_months": m.age_months, "value": getattr(m, value), "z": getattr(m, z_key),
                   "measured_at": m.measured_at.isoformat()} for m in ms]
        reference = growth.reference_curve(child.sex, indicator)
        cls = growth.classify_haz if indicator == "hfa" else growth.classify_waz
    z = getattr(last, z_key) if last else None
    trend_status = latest.trend.get("status") if latest else None
    return {
        "indicator": indicator,
        "sex": child.sex,
        "x_unit": "cm" if indicator == "wfh" else "months",
        "y_unit": "cm" if indicator == "hfa" else "kg",
        "points": points,
        "reference": reference,
        "projection": (latest.trend.get("projections") if latest and indicator == "hfa" else None),
        "meaning": _meaning(indicator, z, trend_status if indicator == "hfa" else None, child.name.split(" ")[0], L),
        "details": {"label": _INDICATOR[indicator]["id" if L == "id" else "en"], "z": z, "class": cls(z),
                    "reference": "WHO Child Growth Standards 2006"},
    }


@router.get("/children/{child_id}/assessments")
def list_assessments(child_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    child = get_child(child_id, db, user)
    rows = db.scalars(select(RiskAssessment).where(RiskAssessment.child_id == child.id).order_by(RiskAssessment.id.desc())).all()
    return [S.assessment(a) for a in rows]


@router.post("/children/{child_id}/assess")
def assess(child_id: int, lang: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    child = get_child(child_id, db, user)
    try:
        return S.assessment(run_assessment(db, child, user, lang_of(user, lang), use_ai=has_consent(db, child.caregiver_id, "ai_analysis")))
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))


@router.post("/children/{child_id}/symptoms", status_code=201)
def report_symptoms(child_id: int, body: SymptomIn, lang: str | None = None, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    """AI symptom checker: interprets free text (Bahasa/English/local terms), then re-runs risk triage."""
    child = get_child(child_id, db, user)
    if body.client_uuid:
        dup = db.scalar(select(SymptomReport).where(SymptomReport.client_uuid == body.client_uuid, SymptomReport.child_id == child.id))
        if dup:
            return {"report": S.symptom_report(dup), "other_concerns": [], "assessment": None, "duplicate": True}
    if not body.description.strip() and not body.symptoms:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Describe the symptoms or select at least one")
    L = lang_of(user, lang)
    use_ai = has_consent(db, child.caregiver_id, "ai_analysis")
    # Age from the child's record (never from the typed text): under 60 days the young-infant danger set applies.
    age_days = (date.today() - child.birth_date).days
    parsed = symptom_ai.interpret(body.description, body.symptoms, L, age_days=age_days) if use_ai else {
        **symptom_ai.interpret_rules(body.description), "danger_signs": [], "summary": None, "other_concerns": [], "interpreted_by": "rules"}
    if not use_ai:
        parsed["symptoms"] = sorted(set(parsed["symptoms"]) | {s for s in body.symptoms if s in symptom_ai.SYMPTOM_KEYS})
        parsed["danger_signs"] = symptom_ai.danger_signs_for(parsed["symptoms"], age_days)
    report = SymptomReport(child_id=child.id, reported_by_id=user.id, description=body.description or None,
                           symptoms=parsed["symptoms"], danger_signs=parsed["danger_signs"],
                           appetite=body.appetite or parsed["appetite"], duration_days=body.duration_days or parsed["duration_days"],
                           interpreted_by=parsed["interpreted_by"], summary=parsed.get("summary"), client_uuid=body.client_uuid)
    db.add(report)
    db.flush()
    audit(db, user, "report_symptoms", "child", child.id, report_id=report.id, danger=bool(parsed["danger_signs"]))
    db.commit()
    db.refresh(child)
    out = {"report": S.symptom_report(report), "other_concerns": parsed.get("other_concerns", []), "assessment": None}
    if child.measurements or report.danger_signs:  # danger signs must reach the Kader with or without AI consent
        out["assessment"] = S.assessment(run_assessment(db, child, user, L, symptom_report_id=report.id, use_ai=use_ai))
    return out


@router.get("/children/{child_id}/symptoms")
def list_symptoms(child_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    child = get_child(child_id, db, user)
    rows = db.scalars(select(SymptomReport).where(SymptomReport.child_id == child.id).order_by(SymptomReport.id.desc())).all()
    return [S.symptom_report(r) for r in rows]


@router.get("/symptoms/catalog", tags=["reference"])
def symptom_catalog():
    return {"symptoms": symptom_ai.SYMPTOM_KEYS, "danger_signs": sorted(symptom_ai.DANGER_SIGNS),
            # Babies under `young_infant_days` days old (from the child's record): these are danger signs too.
            "young_infant_days": symptom_ai.YOUNG_INFANT_DAYS, "young_infant_danger_signs": sorted(symptom_ai.YOUNG_INFANT_DANGER_SIGNS)}
