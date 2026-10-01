#!/usr/bin/env python3
"""Pretend to be a Puskesmas system (SIMPUS): send one antenatal check-up to NutriSense as a FHIR R4 Bundle.

Standard library only, so a facility IT person can run it anywhere with Python 3.9+ to try the connection, and read
it as a worked example of the message (see docs/FACILITY_INTEGRATION.md).

    python scripts/send_checkup.py --visit 3 --bp 150/95 --hb 10.2 --lila 23.0 --weight 58 --tfu 24 --djj 140
    python scripts/send_checkup.py --encounter-id SIMPUS-BMT-0001 --hb 11.5   # same id again: updates, never duplicates

It prints the HTTP status and NutriSense's OperationOutcome. Exit code: 0 accepted, 1 refused, 2 could not connect.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
import uuid
from datetime import date, datetime, timezone

# Keep in step with app/services/facility_sync.py (tests/test_facility.py parses this script's Bundle with it).
LINK_SYSTEM = "https://nutrisense.id/fhir/link-code"
VISIT_EXT = "https://nutrisense.id/fhir/StructureDefinition/anc-visit-number"
LOINC = "http://loinc.org"
UCUM = "http://unitsofmeasure.org"
CATEGORY = "http://terminology.hl7.org/CodeSystem/observation-category"


def _urn() -> str:
    return f"urn:uuid:{uuid.uuid4()}"


def _qty(value: float, code: str, unit: str | None = None) -> dict:
    return {"value": value, "unit": unit or code, "system": UCUM, "code": code}


def build_bundle(code: str, encounter_id: str, exam_date: date, visit: int | None = None, bp: tuple[int, int] | None = None,
                 hb: float | None = None, lila: float | None = None, weight: float | None = None, tfu: float | None = None,
                 djj: int | None = None, examiner: str | None = "Bidan Simulasi") -> dict:
    """One check-up: Patient (with the mother's link code), Encounter (the visit) and one Observation per measurement."""
    patient, encounter = _urn(), _urn()
    on = exam_date.isoformat()

    def obs(category: str, loinc: str, display: str, **value) -> dict:
        return {"fullUrl": _urn(), "resource": {
            "resourceType": "Observation", "status": "final",
            "category": [{"coding": [{"system": CATEGORY, "code": category}]}],
            "code": {"coding": [{"system": LOINC, "code": loinc, "display": display}]},
            "subject": {"reference": patient}, "encounter": {"reference": encounter}, "effectiveDateTime": on, **value}}

    enc = {"resourceType": "Encounter", "id": encounter_id, "status": "finished",
           "class": {"system": "http://terminology.hl7.org/CodeSystem/v3-ActCode", "code": "AMB", "display": "ambulatory"},
           "serviceType": {"text": "Pemeriksaan kehamilan (ANC)"}, "subject": {"reference": patient}, "period": {"start": on}}
    if visit:
        enc["extension"] = [{"url": VISIT_EXT, "valueInteger": visit}]
    if examiner:
        enc["participant"] = [{"individual": {"display": examiner}}]
    entries = [{"fullUrl": patient, "resource": {"resourceType": "Patient", "identifier": [{"system": LINK_SYSTEM, "value": code}]}},
               {"fullUrl": encounter, "resource": enc}]
    if weight is not None:
        entries.append(obs("vital-signs", "29463-7", "Body weight", valueQuantity=_qty(weight, "kg")))
    if bp is not None:
        entries.append(obs("vital-signs", "85354-9", "Blood pressure panel", component=[
            {"code": {"coding": [{"system": LOINC, "code": "8480-6", "display": "Systolic blood pressure"}]},
             "valueQuantity": _qty(bp[0], "mm[Hg]", "mmHg")},
            {"code": {"coding": [{"system": LOINC, "code": "8462-4", "display": "Diastolic blood pressure"}]},
             "valueQuantity": _qty(bp[1], "mm[Hg]", "mmHg")}]))
    if lila is not None:
        entries.append(obs("exam", "56072-2", "Mid upper arm circumference", valueQuantity=_qty(lila, "cm")))
    if hb is not None:
        entries.append(obs("laboratory", "718-7", "Hemoglobin [Mass/volume] in Blood", valueQuantity=_qty(hb, "g/dL")))
    if tfu is not None:
        entries.append(obs("exam", "11881-0", "Uterus Fundal height by Tape measure", valueQuantity=_qty(tfu, "cm")))
    if djj is not None:
        entries.append(obs("exam", "55283-6", "Fetal heart rate", valueQuantity=_qty(djj, "/min", "beats/minute")))
    return {"resourceType": "Bundle", "type": "collection", "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "entry": entries}


def send(url: str, key: str, bundle: dict, timeout: float = 30) -> tuple[int, dict]:
    """POST the Bundle; returns (HTTP status, OperationOutcome). Raises urllib.error.URLError when there is no answer."""
    req = urllib.request.Request(url.rstrip("/") + "/api/integrations/fhir", data=json.dumps(bundle).encode(), method="POST",
                                 headers={"Content-Type": "application/fhir+json", "Accept": "application/fhir+json",
                                          "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:  # 4xx/5xx still carry an OperationOutcome
        body = e.read()
        try:
            return e.code, json.loads(body)
        except ValueError:
            return e.code, {"text": body.decode(errors="replace")[:500]}


def _bp(text: str) -> tuple[int, int]:
    try:
        sys_, dia = text.split("/")
        return int(sys_), int(dia)
    except ValueError:
        raise argparse.ArgumentTypeError("write blood pressure as systolic/diastolic, e.g. 120/80")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Send one antenatal check-up to NutriSense as a FHIR R4 Bundle.")
    ap.add_argument("--url", default="http://localhost:8000", help="NutriSense address (default %(default)s)")
    ap.add_argument("--key", default="demo-puskesmas-baumata-key", help="the facility's API key (default: demo key)")
    ap.add_argument("--code", default="NS-7KQ2MP", help="the mother's link code (default: demo mother Maria)")
    ap.add_argument("--visit", type=int, choices=range(1, 7), metavar="1-6", help="K visit number")
    ap.add_argument("--bp", type=_bp, help="blood pressure, e.g. 120/80 (mmHg)")
    ap.add_argument("--hb", type=float, help="haemoglobin, g/dL")
    ap.add_argument("--lila", type=float, help="mid-upper arm circumference (LiLA), cm")
    ap.add_argument("--weight", type=float, help="weight, kg")
    ap.add_argument("--tfu", type=float, help="fundal height (TFU), cm")
    ap.add_argument("--djj", type=int, help="fetal heart rate (DJJ), beats per minute")
    ap.add_argument("--date", type=date.fromisoformat, default=None, help="check-up date YYYY-MM-DD (default today)")
    ap.add_argument("--encounter-id", help="the facility's id for this visit; reuse it to resend (default: a new id)")
    ap.add_argument("--examiner", default="Bidan Simulasi", help="midwife or doctor (default %(default)s)")
    a = ap.parse_args(argv)
    if all(v is None for v in (a.bp, a.hb, a.lila, a.weight, a.tfu, a.djj)):
        a.bp, a.weight = (118, 76), 55.0  # something to send when nothing was given
    encounter_id = a.encounter_id or f"SIM-{uuid.uuid4().hex[:12]}"
    bundle = build_bundle(a.code, encounter_id, a.date or date.today(), a.visit, a.bp, a.hb, a.lila, a.weight, a.tfu, a.djj, a.examiner)
    try:
        status, outcome = send(a.url, a.key, bundle)
    except (urllib.error.URLError, OSError) as e:
        print(f"Could not reach {a.url}: {getattr(e, 'reason', e)}", file=sys.stderr)
        return 2
    print(f"HTTP {status}  (Encounter id {encounter_id})")
    print(json.dumps(outcome, indent=2, ensure_ascii=False))
    return 0 if 200 <= status < 300 else 1


if __name__ == "__main__":
    sys.exit(main())
