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
presentation, Td immunisation and iron tablets. Check them against the SATUSEHAT antenatal profile before
connecting a production system.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..ai import maternal as M
from ..models import AncExam, AncVisit, HealthFacility, MaternalMeasurement, Pregnancy
from .common import audit, notify, notify_roles

LOCAL = "https://nutrisense.id/fhir"
LINK_SYSTEM = f"{LOCAL}/link-code"
ANC_SYSTEM = f"{LOCAL}/CodeSystem/anc"
VISIT_EXT = f"{LOCAL}/StructureDefinition/anc-visit-number"
LOINC = "http://loinc.org"

# LOINC code -> exam field, and the unit the value is expected in.
_LOINC = {
    "29463-7": ("weight_kg", "kg"),
    "8480-6": ("bp_systolic", "mm[Hg]"),
    "8462-4": ("bp_diastolic", "mm[Hg]"),
    "56072-2": ("muac_cm", "cm"),
    "718-7": ("hb_g_dl", "g/dL"),
    "11881-0": ("fundal_height_cm", "cm"),
    "55283-6": ("fetal_heart_rate", "/min"),
    "18185-9": ("gestational_weeks", "wk"),
    "20454-5": ("urine_protein", None),
}
_LOCAL_CODES = {"fetal-presentation": "fetal_presentation", "td-immunization": "td_immunization", "iron-tablets": "iron_tablets"}
_BP_PANEL = "85354-9"
_INT_FIELDS = {"bp_systolic", "bp_diastolic", "fetal_heart_rate", "iron_tablets"}
# Plausible ranges: anything outside is a typing or unit error at the source and is rejected, not stored.
_RANGES = {"weight_kg": (25, 150), "bp_systolic": (60, 260), "bp_diastolic": (30, 160), "muac_cm": (12, 50), "hb_g_dl": (3, 20),
           "fundal_height_cm": (5, 50), "fetal_heart_rate": (60, 240), "gestational_weeks": (1, 45), "iron_tablets": (0, 120)}
PRESENTATIONS = {"head", "breech", "transverse"}
_CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"  # no 0/O, 1/I/L: easy to read out and type


class SyncError(Exception):
    """A rejected submission; `status` is the HTTP status to answer with."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def facility_for_key(db: Session, key: str | None) -> HealthFacility | None:
    if not key:
        return None
    f = db.scalar(select(HealthFacility).where(HealthFacility.api_key_hash == hash_key(key)))
    return f if f and f.active else None


def new_link_code(db: Session) -> str:
    while True:
        code = "NS-" + "".join(secrets.choice(_CODE_CHARS) for _ in range(6))
        if db.scalar(select(Pregnancy.id).where(Pregnancy.link_code == code)) is None:
            return code


def normalize_code(code: str) -> str:
    c = code.strip().upper().replace(" ", "")
    return c if c.startswith("NS-") else f"NS-{c.removeprefix('NS')}"


# ---------- FHIR in ----------
def _resources(bundle: dict) -> list[dict]:
    if not isinstance(bundle, dict) or bundle.get("resourceType") != "Bundle":
        raise SyncError(422, "Expected a FHIR Bundle")
    return [e.get("resource") or {} for e in bundle.get("entry") or [] if isinstance(e, dict)]


def _number(q: dict | None, field: str):
    if not isinstance(q, dict) or q.get("value") is None:
        return None
    try:
        v = float(q["value"])
    except (TypeError, ValueError):
        raise SyncError(422, f"{field}: not a number")
    return int(round(v)) if field in _INT_FIELDS else round(v, 1)


def parse_bundle(bundle: dict) -> tuple[str, dict]:
    """The link code and the exam fields from a check-up Bundle."""
    res = _resources(bundle)
    patient = next((r for r in res if r.get("resourceType") == "Patient"), None)
    code = next((i.get("value") for i in (patient or {}).get("identifier", []) if i.get("system") == LINK_SYSTEM and i.get("value")), None)
    if not code:
        raise SyncError(422, f"Patient needs an identifier with system {LINK_SYSTEM} (the mother's NutriSense link code)")
    enc = next((r for r in res if r.get("resourceType") == "Encounter"), None)
    if not enc or not enc.get("id"):
        raise SyncError(422, "The Bundle needs an Encounter with an id (used so a resend does not duplicate the check-up)")
    exam: dict = {"external_id": str(enc["id"])[:80]}
    start = (enc.get("period") or {}).get("start")
    try:
        exam["exam_date"] = date.fromisoformat(str(start)[:10]) if start else date.today()
    except ValueError:
        raise SyncError(422, "Encounter.period.start is not a date")
    for ext in enc.get("extension") or []:
        if ext.get("url") == VISIT_EXT and ext.get("valueInteger") is not None:
            exam["visit_number"] = int(ext["valueInteger"])
    for p in enc.get("participant") or []:
        name = (p.get("individual") or {}).get("display")
        if name:
            exam["examiner"] = str(name)[:120]
            break

    for r in res:
        if r.get("resourceType") != "Observation" or r.get("status") in ("entered-in-error", "cancelled"):
            continue
        for coding in (r.get("code") or {}).get("coding") or []:
            system, c = coding.get("system"), coding.get("code")
            if system == LOINC and c == _BP_PANEL:
                for comp in r.get("component") or []:
                    for cc in (comp.get("code") or {}).get("coding") or []:
                        if cc.get("system") == LOINC and cc.get("code") in ("8480-6", "8462-4"):
                            f = _LOINC[cc["code"]][0]
                            exam[f] = _number(comp.get("valueQuantity"), f)
            elif system == LOINC and c in _LOINC:
                f = _LOINC[c][0]
                if f == "urine_protein":
                    txt = (r.get("valueCodeableConcept") or {}).get("text") or r.get("valueString")
                    exam[f] = str(txt)[:10] if txt else None
                else:
                    exam[f] = _number(r.get("valueQuantity"), f)
            elif system == ANC_SYSTEM and c in _LOCAL_CODES:
                f = _LOCAL_CODES[c]
                if f == "iron_tablets":
                    exam[f] = _number(r.get("valueQuantity"), f)
                else:
                    v = (r.get("valueCodeableConcept") or {}).get("coding", [{}])[0].get("code") or r.get("valueString")
                    exam[f] = str(v)[:10] if v else None
            elif system == ANC_SYSTEM and c == "visit-number":
                exam["visit_number"] = _number(r.get("valueQuantity"), "visit_number") or exam.get("visit_number")
    return code, exam


def _validate(exam: dict) -> None:
    for f, (lo, hi) in _RANGES.items():
        v = exam.get(f)
        if v is not None and not lo <= v <= hi:
            raise SyncError(422, f"{f}={v} is outside the plausible range {lo}-{hi}")
    if exam.get("visit_number") is not None and not 1 <= int(exam["visit_number"]) <= 6:
        raise SyncError(422, "visit number must be 1-6 (K1..K6)")
    if exam.get("fetal_presentation") and exam["fetal_presentation"] not in PRESENTATIONS:
        exam["fetal_presentation"] = None
    if exam["exam_date"] > date.today():
        raise SyncError(422, "The check-up date is in the future")
    measured = [f for f in ("weight_kg", "bp_systolic", "bp_diastolic", "muac_cm", "hb_g_dl", "fundal_height_cm", "fetal_heart_rate")
                if exam.get(f) is not None]
    if not measured:
        raise SyncError(422, "No check-up measurements found in the Bundle")


# ---------- store ----------
def ingest(db: Session, facility: HealthFacility, link_code: str, exam: dict, actor=None) -> tuple[AncExam, bool]:
    """Store one check-up for the pregnancy behind `link_code`. Returns (exam, created)."""
    _validate(exam)
    p = db.scalar(select(Pregnancy).where(Pregnancy.link_code == normalize_code(link_code)))
    if p is None:
        raise SyncError(404, "No pregnancy with this link code")
    if not p.facility_sync:
        raise SyncError(403, "The mother has not allowed check-up results to be shared (consent off)")
    if exam["exam_date"] < p.hpht:
        raise SyncError(422, "The check-up date is before this pregnancy began")

    row = db.scalar(select(AncExam).where(AncExam.facility_id == facility.id, AncExam.external_id == exam["external_id"]))
    created = row is None
    if created:
        row = AncExam(pregnancy_id=p.id, facility_id=facility.id, external_id=exam["external_id"], exam_date=exam["exam_date"])
        db.add(row)
    elif row.pregnancy_id != p.id:
        raise SyncError(409, "This Encounter id was already used for another mother")
    fields = ("visit_number", "exam_date", "gestational_weeks", "examiner", "weight_kg", "bp_systolic", "bp_diastolic", "muac_cm", "hb_g_dl",
              "fundal_height_cm", "fetal_heart_rate", "fetal_presentation", "urine_protein", "td_immunization", "iron_tablets", "notes")
    for f in fields:
        if f in exam:
            setattr(row, f, exam[f])
    if row.gestational_weeks is None:
        row.gestational_weeks = round(M.gestational_days(p.hpht, row.exam_date) / 7, 1)
    row.received_at = datetime.now(timezone.utc)
    db.flush()

    # The K visit is done: the given number, else the first one not yet recorded.
    done = {v.number: v for v in db.scalars(select(AncVisit).where(AncVisit.pregnancy_id == p.id)).all()}
    number = row.visit_number or next((n for n in range(1, 7) if n not in done), None)
    if number:
        row.visit_number = number
        v = done.get(number)
        if v is None:
            db.add(AncVisit(pregnancy_id=p.id, number=number, visit_date=row.exam_date, place=facility.name[:40]))
        else:
            v.visit_date, v.place = row.exam_date, facility.name[:40]

    # LiLA, Hb and weight join the mother's own checks, so her risk level uses the facility's numbers.
    if row.muac_cm is not None or row.hb_g_dl is not None or row.weight_kg is not None:
        uuid = f"fac{facility.id}:{row.external_id}"[:64]
        m = db.scalar(select(MaternalMeasurement).where(MaternalMeasurement.client_uuid == uuid))
        if m is None:
            m = MaternalMeasurement(pregnancy_id=p.id, client_uuid=uuid)
            db.add(m)
        m.measured_at, m.gestational_weeks = row.exam_date, row.gestational_weeks
        m.muac_cm, m.hb_g_dl, m.weight_kg = row.muac_cm, row.hb_g_dl, row.weight_kg

    p.linked_facility_id = facility.id
    p.last_sync_at = datetime.now(timezone.utc)
    if created:
        notify(db, p.mother_id, "anc_result", {"id": "Hasil periksa hamil sudah masuk", "en": "Your check-up results are in"},
               {"id": f"{facility.name} mengirim hasil periksa {row.exam_date.isoformat()}. Lihat di halaman Kehamilan.",
                "en": f"{facility.name} sent your check-up of {row.exam_date.isoformat()}. See it on the Pregnancy page."},
               pregnancy_id=p.id)
    flags = M.mother_flags(row.muac_cm, row.hb_g_dl, None, (row.bp_systolic, row.bp_diastolic), row.fetal_heart_rate)
    urgent = [f for f in flags if f["status"] == "urgent"]
    if flags and created:
        names = {"hypertension": "tekanan darah tinggi", "fetal_hr": "detak jantung janin perlu dicek", "severe_anemia": "sangat kurang darah",
                 "anemia": "kurang darah", "kek": "lengan kecil (KEK)"}
        text = ", ".join(names.get(f["code"], f["code"]) for f in flags)
        notify_roles(db, ["kader"], p.region_id, "mother_danger" if urgent else "mother_flag",
                     {"id": "Hasil Puskesmas: ibu hamil perlu perhatian", "en": "Facility result: pregnant mother needs attention"},
                     f"{p.mother.full_name}: {text} ({facility.name})", pregnancy_id=p.id, urgency="emergency" if urgent else None)
    audit(db, actor, "facility_checkup_received", "pregnancy", p.id, facility_id=facility.id, external_id=row.external_id,
          created=created, flags=[f["code"] for f in flags])
    return row, created


def exam_view(e: AncExam) -> dict:
    return {"id": e.id, "visit_number": e.visit_number, "exam_date": e.exam_date.isoformat(), "gestational_weeks": e.gestational_weeks,
            "facility": e.facility.name, "facility_kind": e.facility.kind, "examiner": e.examiner, "weight_kg": e.weight_kg,
            "bp_systolic": e.bp_systolic, "bp_diastolic": e.bp_diastolic, "muac_cm": e.muac_cm, "hb_g_dl": e.hb_g_dl,
            "fundal_height_cm": e.fundal_height_cm, "fetal_heart_rate": e.fetal_heart_rate, "fetal_presentation": e.fetal_presentation,
            "urine_protein": e.urine_protein, "td_immunization": e.td_immunization, "iron_tablets": e.iron_tablets, "notes": e.notes,
            "received_at": e.received_at.isoformat() if e.received_at else None}


# ---------- FHIR out (the same message a facility system sends; used by the demo portal and the simulator) ----------
def build_bundle(link_code: str, exam: dict, facility: HealthFacility) -> dict:
    def q(value, unit, code):
        return {"value": value, "unit": unit, "system": "http://unitsofmeasure.org", "code": code}

    def obs(coding: dict, extra: dict) -> dict:
        return {"resource": {"resourceType": "Observation", "status": "final", "code": {"coding": [coding]},
                             "subject": {"reference": "urn:uuid:patient"}, "encounter": {"reference": "urn:uuid:encounter"},
                             "effectiveDateTime": exam["exam_date"].isoformat(), **extra}}

    entries = [
        {"fullUrl": "urn:uuid:patient", "resource": {"resourceType": "Patient", "identifier": [{"system": LINK_SYSTEM, "value": link_code}]}},
        {"fullUrl": "urn:uuid:encounter", "resource": {
            "resourceType": "Encounter", "id": exam["external_id"], "status": "finished",
            "class": {"system": "http://terminology.hl7.org/CodeSystem/v3-ActCode", "code": "AMB"},
            "serviceType": {"text": "Pemeriksaan kehamilan (ANC)"},
            "period": {"start": exam["exam_date"].isoformat()},
            "serviceProvider": {"display": facility.name},
            **({"participant": [{"individual": {"display": exam["examiner"]}}]} if exam.get("examiner") else {}),
            **({"extension": [{"url": VISIT_EXT, "valueInteger": exam["visit_number"]}]} if exam.get("visit_number") else {}),
        }},
    ]
    units = {"weight_kg": ("kg", "kg"), "muac_cm": ("cm", "cm"), "hb_g_dl": ("g/dL", "g/dL"), "fundal_height_cm": ("cm", "cm"),
             "fetal_heart_rate": ("/min", "/min"), "gestational_weeks": ("wk", "wk")}
    for code, (field, _) in _LOINC.items():
        if field in units and exam.get(field) is not None:
            entries.append(obs({"system": LOINC, "code": code}, {"valueQuantity": q(exam[field], *units[field])}))
    if exam.get("bp_systolic") is not None or exam.get("bp_diastolic") is not None:
        entries.append(obs({"system": LOINC, "code": _BP_PANEL, "display": "Blood pressure panel"}, {"component": [
            {"code": {"coding": [{"system": LOINC, "code": c}]}, "valueQuantity": q(exam[f], "mmHg", "mm[Hg]")}
            for c, f in (("8480-6", "bp_systolic"), ("8462-4", "bp_diastolic")) if exam.get(f) is not None]}))
    if exam.get("urine_protein"):
        entries.append(obs({"system": LOINC, "code": "20454-5"}, {"valueCodeableConcept": {"text": exam["urine_protein"]}}))
    for local, field in _LOCAL_CODES.items():
        v = exam.get(field)
        if v is None or v == "":
            continue
        val = {"valueQuantity": {"value": v}} if field == "iron_tablets" else {"valueCodeableConcept": {"coding": [{"system": ANC_SYSTEM, "code": v}]}}
        entries.append(obs({"system": ANC_SYSTEM, "code": local}, val))
    return {"resourceType": "Bundle", "type": "collection", "timestamp": datetime.now(timezone.utc).isoformat(), "entry": entries}
