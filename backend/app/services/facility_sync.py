"""Check-up results from the Puskesmas or hospital, received as HL7 FHIR R4 and shown in the mother's app.

How it works:
1. The mother turns on "Hubungkan ke Puskesmas" (her consent) and gets a link code such as ``NS-7KQ2MP``.
2. At the check-up she shows the code (or its QR) to the midwife. The facility's system (SIMPUS, a hospital
   EMR, or SATUSEHAT middleware) stores it as an identifier on her Patient record.
3. After the check-up, the system POSTs a FHIR Bundle (Patient + Encounter + Observations) to
   ``/api/integrations/fhir``, authenticated with the facility's API key.
4. NutriSense finds the pregnancy by the code, checks the consent, stores the check-up (once, even if sent again),
   marks the K visit done, feeds LiLA/Hb/weight into the mother's checks, recalculates her risk and tells her
   (and the Kader, when something is wrong).

Codes: LOINC for the measurements LOINC defines; a NutriSense code system for the K visit number, fetal
presentation, Td immunisation and iron tablets. docs/FACILITY_INTEGRATION.md lists them and marks the ones still to
verify against the SATUSEHAT antenatal profile before a production system is connected.
"""
from __future__ import annotations

import hashlib
import math
import re
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..ai import maternal as M
from ..models import AncExam, AncVisit, FacilityLinkCode, HealthFacility, MaternalMeasurement, Pregnancy
from .common import audit, human_date, notify, notify_roles

LOCAL = "https://nutrisense.id/fhir"
LINK_SYSTEM = f"{LOCAL}/link-code"
ANC_SYSTEM = f"{LOCAL}/CodeSystem/anc"
VISIT_EXT = f"{LOCAL}/StructureDefinition/anc-visit-number"
LOINC = "http://loinc.org"
UCUM = "http://unitsofmeasure.org"
OBS_CATEGORY = "http://terminology.hl7.org/CodeSystem/observation-category"

# LOINC code -> exam field and the UCUM unit it is stored in.
_LOINC = {
    "29463-7": ("weight_kg", "kg"),  # Body weight
    "8480-6": ("bp_systolic", "mm[Hg]"),  # Systolic blood pressure
    "8462-4": ("bp_diastolic", "mm[Hg]"),  # Diastolic blood pressure
    "56072-2": ("muac_cm", "cm"),  # Mid-upper arm circumference (LiLA): to verify
    "718-7": ("hb_g_dl", "g/dL"),  # Hemoglobin [Mass/volume] in Blood
    "11881-0": ("fundal_height_cm", "cm"),  # Uterus Fundal height by Tape measure (TFU)
    "55283-6": ("fetal_heart_rate", "/min"),  # Fetal heart rate (DJJ)
    "18185-9": ("gestational_weeks", "wk"),  # Gestational age
    "20454-5": ("urine_protein", None),  # Protein [Presence] in Urine by Test strip
}
_BP_PANEL = "85354-9"  # Blood pressure panel. BP components are read from any Observation, so other panel codes work too.
_BP_PARTS = {"8480-6": "bp_systolic", "8462-4": "bp_diastolic"}
_LOCAL_CODES = {"fetal-presentation": "fetal_presentation", "td-immunization": "td_immunization", "iron-tablets": "iron_tablets"}
_INT_FIELDS = {"bp_systolic", "bp_diastolic", "fetal_heart_rate", "iron_tablets"}
_MMHG = {"mm[hg]": 1, "mmhg": 1}
_CM = {"cm": 1, "mm": 0.1}
# Units accepted per field (UCUM code or the usual printed form, lower case) -> factor to the stored unit. Hb in mmol/L
# is refused, not converted: labs differ on monomer vs tetramer, and a wrong factor would hide or invent anaemia.
_UNITS = {
    "weight_kg": {"kg": 1, "g": 0.001, "[lb_av]": 0.45359237, "lb": 0.45359237},
    "bp_systolic": _MMHG, "bp_diastolic": _MMHG, "muac_cm": _CM, "fundal_height_cm": _CM,
    "hb_g_dl": {"g/dl": 1, "g/l": 0.1},
    "fetal_heart_rate": {"/min": 1, "{beats}/min": 1, "beats/min": 1, "beats/minute": 1, "bpm": 1},
    "gestational_weeks": {"wk": 1, "week": 1, "weeks": 1, "minggu": 1, "d": 1 / 7, "day": 1 / 7, "days": 1 / 7},
}
# Plausible ranges: anything outside is a typing or unit error at the source and is rejected, not stored.
_RANGES = {"weight_kg": (25, 150), "bp_systolic": (60, 260), "bp_diastolic": (30, 160), "muac_cm": (12, 50), "hb_g_dl": (3, 20),
           "fundal_height_cm": (5, 50), "fetal_heart_rate": (60, 240), "gestational_weeks": (1, 45), "iron_tablets": (0, 120)}
PRESENTATIONS = {"head": "head", "cephalic": "head", "kepala": "head", "breech": "breech", "sungsang": "breech",
                 "transverse": "transverse", "lintang": "transverse"}
_FIELDS = ("visit_number", "exam_date", "gestational_weeks", "examiner", "weight_kg", "bp_systolic", "bp_diastolic", "muac_cm",
           "hb_g_dl", "fundal_height_cm", "fetal_heart_rate", "fetal_presentation", "urine_protein", "td_immunization", "iron_tablets")
_CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"  # no 0/O, 1/I/L: easy to read out and type
_FHIR_ID = re.compile(r"[A-Za-z0-9\-.]{1,64}")  # FHIR R4 id datatype
MAX_ENTRIES = 200
# Dates without a time are the facility's own dates. A UTC time is read in WITA (NTT); "future" is judged in WIT, the
# latest Indonesian time zone, so a morning check-up in NTT is not refused while the server's UTC day is still yesterday.
FACILITY_TZ = timezone(timedelta(hours=8))
_LATEST_TZ = timezone(timedelta(hours=9))


class SyncError(Exception):
    """A rejected submission; `status` is the HTTP status to answer with."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def hash_key(key: str) -> str:
    # Keys are long random strings, so a plain SHA-256 is enough (no salt or slow hash needed, unlike passwords).
    return hashlib.sha256(key.encode()).hexdigest()


def new_api_key() -> str:
    return "nsk_" + secrets.token_urlsafe(32)


def facility_for_key(db: Session, key: str | None) -> HealthFacility | None:
    key = (key or "").strip()
    if not key:
        return None
    f = db.scalar(select(HealthFacility).where(HealthFacility.api_key_hash == hash_key(key)))
    return f if f and f.active else None


def issue_link_code(db: Session, p: Pregnancy) -> str:
    """A new code for the pregnancy, never one given out before (to anyone)."""
    while True:
        code = "NS-" + "".join(secrets.choice(_CODE_CHARS) for _ in range(6))
        if db.scalar(select(FacilityLinkCode.id).where(FacilityLinkCode.code == code)) is None:
            break
    db.add(FacilityLinkCode(code=code, pregnancy_id=p.id))
    p.link_code = code
    return code


def revoke_link_code(db: Session, p: Pregnancy) -> None:
    """Consent withdrawn: the code stops working at once, and stays reserved so it is never reissued."""
    if p.link_code:
        row = db.scalar(select(FacilityLinkCode).where(FacilityLinkCode.code == p.link_code))
        if row and row.revoked_at is None:
            row.revoked_at = datetime.now(timezone.utc)
    p.link_code = None


def normalize_code(code) -> str:
    """'ns-7kq2mp', 'NS 7KQ2MP', 'NS7KQ2MP' and '7KQ2MP' all mean NS-7KQ2MP."""
    c = "".join(ch for ch in str(code).upper() if ch.isascii() and ch.isalnum())
    if len(c) == 8 and c.startswith("NS"):
        c = c[2:]
    return f"NS-{c}"


# ---------- FHIR in ----------
def _list(x) -> list:
    return x if isinstance(x, list) else []


def _dict(x) -> dict:
    return x if isinstance(x, dict) else {}


def _codings(concept) -> list[dict]:
    return [c for c in _list(_dict(concept).get("coding")) if isinstance(c, dict)]


def _quantity(q, field: str):
    """A valueQuantity in the stored unit: converted when the unit is known, refused when it is not."""
    q = _dict(q)
    v = q.get("value")
    if v is None:
        return None
    if isinstance(v, bool) or q.get("comparator"):
        raise SyncError(422, f"{field}: expected a plain number")
    try:
        v = float(v)
    except (TypeError, ValueError):
        raise SyncError(422, f"{field}: not a number")
    if not math.isfinite(v):
        raise SyncError(422, f"{field}: not a number")
    units = _UNITS.get(field)
    given = [str(u).strip() for u in (q.get("code"), q.get("unit")) if u not in (None, "")]
    if units and given:
        factor = next((units[u.lower()] for u in given if u.lower() in units), None)
        if factor is None:
            raise SyncError(422, f"{field}: unit '{given[0]}' is not supported (use {_LOINC_UNIT.get(field, '')})")
        v *= factor
    return int(round(v)) if field in _INT_FIELDS else round(v, 1)


_LOINC_UNIT = {f: u for f, u in _LOINC.values() if u}


def _text(r: dict, code_first: bool = True) -> str | None:
    """A coded or free-text answer. Our own codes (TT2, head) are read by code; a urine result by its words (+1,
    negatif), since a LOINC/SNOMED answer code means nothing on the mother's screen."""
    cc = _dict(r.get("valueCodeableConcept"))
    codings = _codings(cc)
    code = next((x["code"] for x in codings if x.get("code")), None)
    words = cc.get("text") or next((x["display"] for x in codings if x.get("display")), None) or r.get("valueString")
    v = (code or words) if code_first else (words or code)
    return str(v).strip()[:10] if v not in (None, "") else None


def _put(exam: dict, field: str, value) -> None:
    # A repeated measurement without a value (dataAbsentReason) must not wipe one already read.
    if value is not None or field not in exam:
        exam[field] = value


def _exam_date(enc: dict) -> date:
    start = _dict(enc.get("period")).get("start")
    hint = "Encounter.period.start must be the check-up date, e.g. 2026-10-01 or 2026-10-01T09:30:00+08:00"
    if not isinstance(start, str) or not start:
        raise SyncError(422, hint)
    try:
        if len(start) == 10:
            return date.fromisoformat(start)
        dt = datetime.fromisoformat(start)
    except ValueError:
        raise SyncError(422, hint)
    if dt.tzinfo is not None and dt.utcoffset() == timedelta(0):
        dt = dt.astimezone(FACILITY_TZ)
    return dt.date()  # with a local offset (+08:00): the date as written at the facility


def _points_to(ref, full_url, r: dict) -> bool:
    rid, kind = r.get("id"), r.get("resourceType")
    return ref == full_url or bool(rid) and (ref == f"{kind}/{rid}" or str(ref).endswith(f"/{kind}/{rid}"))


def _int(v, what: str) -> int:
    if isinstance(v, bool) or not isinstance(v, (int, float, str)):
        raise SyncError(422, f"{what}: not a whole number")
    try:
        return int(float(v))
    except ValueError:
        raise SyncError(422, f"{what}: not a whole number")


def parse_bundle(bundle) -> tuple[str, dict]:
    """The link code and the exam fields from a check-up Bundle."""
    try:
        return _parse(bundle)
    except SyncError:
        raise
    except (AttributeError, KeyError, TypeError, ValueError, OverflowError) as e:  # any shape we did not foresee: a 422, never a 500
        raise SyncError(422, f"The Bundle is not well-formed FHIR ({type(e).__name__})") from e


def _parse(bundle) -> tuple[str, dict]:
    if not isinstance(bundle, dict) or bundle.get("resourceType") != "Bundle":
        raise SyncError(422, "Expected a FHIR Bundle")
    entries = _list(bundle.get("entry"))
    if len(entries) > MAX_ENTRIES:
        raise SyncError(413, f"Too many entries ({len(entries)}); one check-up has at most {MAX_ENTRIES}")
    res = [(e.get("fullUrl"), e["resource"]) for e in entries if isinstance(e, dict) and isinstance(e.get("resource"), dict)]
    patients = [x for x in res if x[1].get("resourceType") == "Patient"]
    encounters = [x for x in res if x[1].get("resourceType") == "Encounter"]
    # One mother and one visit per Bundle, so results can never be filed under the wrong person.
    if len(patients) != 1:
        raise SyncError(422, f"The Bundle must hold exactly one Patient (found {len(patients)})")
    if len(encounters) != 1:
        raise SyncError(422, f"The Bundle must hold exactly one Encounter (found {len(encounters)})")
    (p_url, patient), (e_url, enc) = patients[0], encounters[0]
    code = next((i["value"] for i in _list(patient.get("identifier")) if isinstance(i, dict) and i.get("system") == LINK_SYSTEM
                 and isinstance(i.get("value"), str) and i["value"].strip()), None)
    if not code:
        raise SyncError(422, f"Patient needs an identifier with system {LINK_SYSTEM} (the mother's NutriSense link code)")
    eid = enc.get("id")
    if not isinstance(eid, str) or not _FHIR_ID.fullmatch(eid):
        raise SyncError(422, "Encounter.id is required: the facility's own id for this check-up (1-64 letters, digits, '-' or '.'). "
                             "Sending the same id again updates the check-up")
    if enc.get("status") in ("cancelled", "entered-in-error"):
        raise SyncError(422, "This Encounter is cancelled or entered in error; removing a check-up is not supported yet")
    exam: dict = {"external_id": eid, "exam_date": _exam_date(enc)}
    for ext in _list(enc.get("extension")):
        if isinstance(ext, dict) and ext.get("url") == VISIT_EXT and ext.get("valueInteger") is not None:
            exam["visit_number"] = _int(ext["valueInteger"], "visit number")
    name = next((_dict(p.get("individual")).get("display") for p in _list(enc.get("participant"))
                 if isinstance(p, dict) and _dict(p.get("individual")).get("display")), None)
    if name:
        exam["examiner"] = str(name)[:120]

    for _, r in res:
        if r.get("resourceType") != "Observation" or r.get("status") in ("entered-in-error", "cancelled"):
            continue
        subject, encounter = _dict(r.get("subject")).get("reference"), _dict(r.get("encounter")).get("reference")
        if subject and not _points_to(subject, p_url, patient):
            raise SyncError(422, "An Observation's subject is not the Patient in this Bundle")
        if encounter and not _points_to(encounter, e_url, enc):
            raise SyncError(422, "An Observation's encounter is not the Encounter in this Bundle")
        _read_observation(r, exam)
    return code, exam


def _read_observation(r: dict, exam: dict) -> None:
    for comp in _list(r.get("component")):  # BP as a panel (85354-9 or any other code) with two components
        if isinstance(comp, dict):
            for cc in _codings(comp.get("code")):
                if cc.get("system") == LOINC and cc.get("code") in _BP_PARTS:
                    f = _BP_PARTS[cc["code"]]
                    _put(exam, f, _quantity(comp.get("valueQuantity"), f))
    for coding in _codings(r.get("code")):
        system, c = coding.get("system"), coding.get("code")
        if system == LOINC and c in _LOINC:
            f = _LOINC[c][0]
            _put(exam, f, _text(r, code_first=False) if f == "urine_protein" else _quantity(r.get("valueQuantity"), f))
        elif system == ANC_SYSTEM and c in _LOCAL_CODES:
            f = _LOCAL_CODES[c]
            if f == "iron_tablets":
                _put(exam, f, _quantity(r.get("valueQuantity"), f))
            elif f == "fetal_presentation":
                # By our code or the words (kepala, sungsang, lintang); an unknown wording is left out, not stored.
                _put(exam, f, PRESENTATIONS.get((_text(r) or "").lower()) or PRESENTATIONS.get((_text(r, False) or "").lower()))
            else:
                _put(exam, f, _text(r))
        elif system == ANC_SYSTEM and c == "visit-number":
            v = _dict(r.get("valueQuantity")).get("value", r.get("valueInteger"))
            if v is not None:
                exam["visit_number"] = _int(v, "visit number")
        else:
            continue
        return  # one known coding per Observation is enough


def _validate(exam: dict) -> None:
    for f, (lo, hi) in _RANGES.items():
        v = exam.get(f)
        if v is not None and not lo <= v <= hi:
            raise SyncError(422, f"{f}={v} is outside the plausible range {lo}-{hi}")
    if exam.get("visit_number") is not None and not 1 <= int(exam["visit_number"]) <= 6:
        raise SyncError(422, "visit number must be 1-6 (K1..K6)")
    if exam["exam_date"] > datetime.now(_LATEST_TZ).date():
        raise SyncError(422, "The check-up date is in the future")
    measured = [f for f in ("weight_kg", "bp_systolic", "bp_diastolic", "muac_cm", "hb_g_dl", "fundal_height_cm", "fetal_heart_rate")
                if exam.get(f) is not None]
    if not measured:
        raise SyncError(422, "No check-up measurements found in the Bundle")


# ---------- store ----------
def _pregnancy_for(db: Session, link_code: str) -> Pregnancy:
    code = normalize_code(link_code)
    p = db.scalar(select(Pregnancy).where(Pregnancy.link_code == code))
    if p is not None and p.facility_sync:
        return p
    if p is not None or db.scalar(select(FacilityLinkCode.id).where(FacilityLinkCode.code == code)) is not None:
        raise SyncError(403, "The mother has not allowed check-up results to be shared with this code (consent withdrawn or a "
                             "new code made). Ask her for her current code")
    raise SyncError(404, "No pregnancy with this link code")


def _check_dates(p: Pregnancy, on: date) -> None:
    if p.status not in ("active", "delivered"):
        raise SyncError(409, "This pregnancy is closed in NutriSense")
    if p.delivered_at and on > p.delivered_at:
        raise SyncError(409, f"The check-up is after the birth on {p.delivered_at.isoformat()}; postpartum check-ups are not received here yet")
    if on < p.hpht:
        raise SyncError(422, "The check-up date is before this pregnancy began")
    if on > p.hpht + timedelta(weeks=45):
        raise SyncError(422, "The check-up date is more than 45 weeks after this pregnancy began: check the date or the link code")


def _flag_codes(e: AncExam) -> list[str]:
    return sorted(f["code"] for f in M.mother_flags(e.muac_cm, e.hb_g_dl, None, (e.bp_systolic, e.bp_diastolic), e.fetal_heart_rate))


def ingest(db: Session, facility: HealthFacility, link_code: str, exam: dict, actor=None) -> tuple[AncExam, bool]:
    """Store one check-up for the pregnancy behind `link_code`. Returns (exam, created).

    A resend of the same Encounter replaces the stored check-up, so a value the facility corrected or removed is
    corrected or removed here too."""
    _validate(exam)
    p = _pregnancy_for(db, link_code)
    _check_dates(p, exam["exam_date"])

    row = db.scalar(select(AncExam).where(AncExam.facility_id == facility.id, AncExam.external_id == exam["external_id"]))
    if row is not None and row.pregnancy_id != p.id:
        raise SyncError(409, "This Encounter id was already used for another mother")
    created = row is None
    before = None if created else (_flag_codes(row), row.visit_number, row.exam_date)
    if created:
        row = AncExam(pregnancy_id=p.id, facility_id=facility.id, external_id=exam["external_id"], exam_date=exam["exam_date"])
        db.add(row)
    for f in _FIELDS:
        if f == "visit_number" and exam.get(f) is None and not created:
            continue  # keep the K number given or worked out the first time
        setattr(row, f, exam.get(f))
    if exam.get("notes"):
        row.notes = exam["notes"]
    if row.gestational_weeks is None:
        row.gestational_weeks = round(M.gestational_days(p.hpht, row.exam_date) / 7, 1)
    row.received_at = datetime.now(timezone.utc)
    db.flush()

    _mark_visit(db, p, facility, row, before)
    _sync_measurement(db, p, facility, row)
    p.linked_facility_id = facility.id
    p.last_sync_at = datetime.now(timezone.utc)
    flags = M.mother_flags(row.muac_cm, row.hb_g_dl, None, (row.bp_systolic, row.bp_diastolic), row.fetal_heart_rate)
    _tell(db, p, facility, row, flags, created, before)
    audit(db, actor, "facility_checkup_received", "pregnancy", p.id, facility_id=facility.id, external_id=row.external_id,
          created=created, flags=[f["code"] for f in flags])
    return row, created


def _mark_visit(db: Session, p: Pregnancy, facility: HealthFacility, row: AncExam, before) -> None:
    """The K visit is done: the number the facility gave, else the first open visit whose weeks fit the check-up."""
    done = {v.number: v for v in db.scalars(select(AncVisit).where(AncVisit.pregnancy_id == p.id)).all()}
    place = facility.name[:40]
    if before and before[1] and before[1] != row.visit_number:
        # The facility corrected the K number: undo the visit this check-up marked, unless someone recorded it by hand.
        old = done.get(before[1])
        if old and old.recorded_by_id is None and old.visit_date == before[2] and old.place == place:
            db.delete(old)
            del done[before[1]]
    if row.visit_number is None:
        weeks = int(row.gestational_weeks)
        row.visit_number = next((v["number"] for v in M.ANC_VISITS if v["number"] not in done and v["from_week"] <= weeks <= v["to_week"]), None)
    if row.visit_number:
        v = done.get(row.visit_number)
        if v is None:
            db.add(AncVisit(pregnancy_id=p.id, number=row.visit_number, visit_date=row.exam_date, place=place))
        else:
            v.visit_date, v.place = row.exam_date, place


def _sync_measurement(db: Session, p: Pregnancy, facility: HealthFacility, row: AncExam) -> None:
    """LiLA, Hb and weight join the mother's own checks, so her risk level uses the facility's numbers."""
    # A fixed-length key from the Encounter id: long ids cannot collide by truncation, and it fits client_uuid (64).
    key = f"fac{facility.id}-" + hashlib.sha256(row.external_id.encode()).hexdigest()[:48]
    m = db.scalar(select(MaternalMeasurement).where(MaternalMeasurement.client_uuid == key))
    if m is not None and m.pregnancy_id != p.id:
        raise SyncError(409, "This check-up conflicts with a measurement of another pregnancy")
    if row.muac_cm is None and row.hb_g_dl is None and row.weight_kg is None:
        if m is not None:
            db.delete(m)  # the corrected check-up no longer has these values
        return
    if m is None:
        m = MaternalMeasurement(pregnancy_id=p.id, client_uuid=key)
        db.add(m)
    m.measured_at, m.gestational_weeks = row.exam_date, row.gestational_weeks
    m.muac_cm, m.hb_g_dl, m.weight_kg = row.muac_cm, row.hb_g_dl, row.weight_kg


def _tell(db: Session, p: Pregnancy, facility: HealthFacility, row: AncExam, flags: list[dict], created: bool, before) -> None:
    if created:
        notify(db, p.mother_id, "anc_result", {"id": "Hasil periksa hamil sudah masuk", "en": "Your check-up results are in"},
               {"id": f"{facility.name} mengirim hasil periksa {human_date(row.exam_date)}. Lihat di halaman Kehamilan.",
                "en": f"{facility.name} sent your check-up of {human_date(row.exam_date, 'en')}. See it on the Pregnancy page."},
               pregnancy_id=p.id)
    # The Kader hears about a new problem: on the first send, or when a correction changes the flags. Not after the birth.
    changed = created or sorted(f["code"] for f in flags) != before[0]
    if not flags or not changed or p.status != "active":
        return
    urgent = any(f["status"] == "urgent" for f in flags)
    names = {"hypertension": "tekanan darah tinggi", "fetal_hr": "detak jantung janin perlu dicek", "severe_anemia": "sangat kurang darah",
             "anemia": "kurang darah", "kek": "lengan kecil (KEK)"}
    text = ", ".join(names.get(f["code"], f["code"]) for f in flags)
    notify_roles(db, ["kader"], p.region_id, "mother_danger" if urgent else "mother_flag",
                 {"id": "Hasil Puskesmas: ibu hamil perlu perhatian", "en": "Facility result: pregnant mother needs attention"},
                 f"{p.mother.full_name}: {text} ({facility.name})", pregnancy_id=p.id, urgency="emergency" if urgent else None)


def exam_view(e: AncExam) -> dict:
    return {"id": e.id, "visit_number": e.visit_number, "exam_date": e.exam_date.isoformat(), "gestational_weeks": e.gestational_weeks,
            "facility": e.facility.name, "facility_kind": e.facility.kind, "examiner": e.examiner, "weight_kg": e.weight_kg,
            "bp_systolic": e.bp_systolic, "bp_diastolic": e.bp_diastolic, "muac_cm": e.muac_cm, "hb_g_dl": e.hb_g_dl,
            "fundal_height_cm": e.fundal_height_cm, "fetal_heart_rate": e.fetal_heart_rate, "fetal_presentation": e.fetal_presentation,
            "urine_protein": e.urine_protein, "td_immunization": e.td_immunization, "iron_tablets": e.iron_tablets, "notes": e.notes,
            "received_at": e.received_at.isoformat() if e.received_at else None}


# ---------- FHIR out (the same message a facility system sends; used by the demo portal and in tests) ----------
_CATEGORY = {"hb_g_dl": "laboratory", "urine_protein": "laboratory", "weight_kg": "vital-signs", "bp_systolic": "vital-signs"}


def build_bundle(link_code: str, exam: dict, facility: HealthFacility) -> dict:
    patient_url, encounter_url = f"urn:uuid:{uuid.uuid4()}", f"urn:uuid:{uuid.uuid4()}"

    def q(value, code, unit=None):
        return {"value": value, "unit": unit or code, "system": UCUM, "code": code}

    def obs(field: str, coding: dict, extra: dict) -> dict:
        cat = _CATEGORY.get(field, "exam")
        return {"fullUrl": f"urn:uuid:{uuid.uuid4()}", "resource": {
            "resourceType": "Observation", "status": "final",
            "category": [{"coding": [{"system": OBS_CATEGORY, "code": cat}]}], "code": {"coding": [coding]},
            "subject": {"reference": patient_url}, "encounter": {"reference": encounter_url},
            "effectiveDateTime": exam["exam_date"].isoformat(), **extra}}

    entries = [
        {"fullUrl": patient_url, "resource": {"resourceType": "Patient", "identifier": [{"system": LINK_SYSTEM, "value": link_code}]}},
        {"fullUrl": encounter_url, "resource": {
            "resourceType": "Encounter", "id": exam["external_id"], "status": "finished",
            "class": {"system": "http://terminology.hl7.org/CodeSystem/v3-ActCode", "code": "AMB"},
            "serviceType": {"text": "Pemeriksaan kehamilan (ANC)"},
            "subject": {"reference": patient_url},
            "period": {"start": exam["exam_date"].isoformat()},
            "serviceProvider": {"display": facility.name},
            **({"participant": [{"individual": {"display": exam["examiner"]}}]} if exam.get("examiner") else {}),
            **({"extension": [{"url": VISIT_EXT, "valueInteger": exam["visit_number"]}]} if exam.get("visit_number") else {}),
        }},
    ]
    for code, (field, unit) in _LOINC.items():
        if unit and field not in _BP_PARTS.values() and exam.get(field) is not None:
            entries.append(obs(field, {"system": LOINC, "code": code}, {"valueQuantity": q(exam[field], unit)}))
    if exam.get("bp_systolic") is not None or exam.get("bp_diastolic") is not None:
        entries.append(obs("bp_systolic", {"system": LOINC, "code": _BP_PANEL, "display": "Blood pressure panel"}, {"component": [
            {"code": {"coding": [{"system": LOINC, "code": c}]}, "valueQuantity": q(exam[f], "mm[Hg]", "mmHg")}
            for c, f in _BP_PARTS.items() if exam.get(f) is not None]}))
    if exam.get("urine_protein"):
        entries.append(obs("urine_protein", {"system": LOINC, "code": "20454-5"}, {"valueCodeableConcept": {"text": exam["urine_protein"]}}))
    for local, field in _LOCAL_CODES.items():
        v = exam.get(field)
        if v is None or v == "":
            continue
        val = ({"valueQuantity": q(v, "{tablet}", "tablet")} if field == "iron_tablets"
               else {"valueCodeableConcept": {"coding": [{"system": ANC_SYSTEM, "code": v}]}})
        entries.append(obs(field, {"system": ANC_SYSTEM, "code": local}, val))
    return {"resourceType": "Bundle", "type": "collection", "timestamp": datetime.now(timezone.utc).isoformat(), "entry": entries}
