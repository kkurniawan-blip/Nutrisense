"""HL7 FHIR R4 mapping for SATUSEHAT interoperability.

Children map to Patient, measurements to Observation (vital-signs), risk results to RiskAssessment and
consents to Consent, packaged as a transaction Bundle. Submission to SATUSEHAT is simulated in the
prototype: the bundle is generated and validated structurally, and the sync is logged. Only data
covered by an active `satusehat_sharing` consent is ever exported.
"""
from __future__ import annotations

from datetime import datetime, timezone

from ..models import Child, Consent, GrowthMeasurement, RiskAssessment

LOCAL_SYSTEM = "https://nutrisense.id/fhir"
ZSCORE_SYSTEM = f"{LOCAL_SYSTEM}/CodeSystem/who-growth-zscore"
_RISK_CODE = {"low": "low", "medium": "moderate", "high": "high"}


def _ref(kind: str, id_: int) -> str:
    return f"urn:uuid:{kind.lower()}-{id_}"


def patient(child: Child) -> dict:
    return {
        "resourceType": "Patient",
        "identifier": [{"system": f"{LOCAL_SYSTEM}/child", "value": str(child.id)}],
        "active": True,
        "name": [{"use": "official", "text": child.name}],
        "gender": child.sex,
        "birthDate": child.birth_date.isoformat(),
        "address": [{"use": "home", "district": child.region.district, "state": child.region.province, "country": "ID",
                     "text": child.region.name}] if child.region else [],
        "contact": [{"relationship": [{"text": "caregiver"}], "name": {"text": child.caregiver.full_name},
                     "telecom": [{"system": "phone", "value": child.caregiver.phone}] if child.caregiver.phone else []}],
    }


def _obs(child: Child, m: GrowthMeasurement, code: dict, value: dict, suffix: str) -> dict:
    return {
        "fullUrl": _ref(f"obs-{suffix}", m.id),
        "resource": {
            "resourceType": "Observation",
            "status": "final",
            "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "vital-signs"}]}],
            "code": code,
            "subject": {"reference": _ref("Patient", child.id)},
            "effectiveDateTime": m.measured_at.isoformat(),
            **value,
        },
        "request": {"method": "POST", "url": "Observation"},
    }


def observations(child: Child, m: GrowthMeasurement) -> list[dict]:
    lying = m.position == "lying"
    out = [
        _obs(child, m, {"coding": [{"system": "http://loinc.org", "code": "8306-3" if lying else "8302-2",
                                    "display": "Body height --lying" if lying else "Body height"}]},
             {"valueQuantity": {"value": m.height_cm, "unit": "cm", "system": "http://unitsofmeasure.org", "code": "cm"}}, "height"),
        _obs(child, m, {"coding": [{"system": "http://loinc.org", "code": "29463-7", "display": "Body weight"}]},
             {"valueQuantity": {"value": m.weight_kg, "unit": "kg", "system": "http://unitsofmeasure.org", "code": "kg"}}, "weight"),
    ]
    for key, display in (("haz", "Height-for-age z-score (WHO 2006)"), ("waz", "Weight-for-age z-score (WHO 2006)"),
                         ("whz", "Weight-for-height z-score (WHO 2006)")):
        v = getattr(m, key)
        if v is not None:
            out.append(_obs(child, m, {"coding": [{"system": ZSCORE_SYSTEM, "code": key, "display": display}]},
                            {"valueQuantity": {"value": v, "unit": "SD", "system": "http://unitsofmeasure.org", "code": "{SD}"}}, key))
    return out


def risk_assessment(child: Child, a: RiskAssessment) -> dict:
    return {
        "fullUrl": _ref("RiskAssessment", a.id),
        "resource": {
            "resourceType": "RiskAssessment",
            "status": "final",
            "subject": {"reference": _ref("Patient", child.id)},
            "occurrenceDateTime": a.created_at.isoformat(),
            "method": {"text": f"NutriSense stunting risk model (ModelRun {a.model_run_id}) with WHO guardrails"},
            "prediction": [{
                "outcome": {"text": "Stunting / growth faltering"},
                "qualitativeRisk": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/risk-probability",
                                                "code": _RISK_CODE[a.reviewed_level or a.risk_level]}]},
                "probabilityDecimal": a.probabilities.get(a.risk_level),
            }],
            "note": [{"text": r["text"]} for r in a.reasons[:5]],
        },
        "request": {"method": "POST", "url": "RiskAssessment"},
    }


def consent(child: Child, c: Consent) -> dict:
    return {
        "fullUrl": _ref("Consent", c.id),
        "resource": {
            "resourceType": "Consent",
            "status": "active" if c.granted else "rejected",
            "scope": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/consentscope", "code": "patient-privacy"}]},
            "category": [{"coding": [{"system": "http://loinc.org", "code": "59284-0", "display": "Patient Consent"}]}],
            "patient": {"reference": _ref("Patient", child.id)},
            "dateTime": c.updated_at.isoformat(),
            "policyRule": {"text": f"NutriSense data policy v{c.version}: {c.scope}"},
            "provision": {"type": "permit" if c.granted else "deny"},
        },
        "request": {"method": "POST", "url": "Consent"},
    }


def bundle(child: Child, measurements: list[GrowthMeasurement], assessments: list[RiskAssessment], consents: list[Consent]) -> dict:
    entries = [{"fullUrl": _ref("Patient", child.id), "resource": patient(child), "request": {"method": "POST", "url": "Patient"}}]
    for m in measurements:
        entries += observations(child, m)
    entries += [risk_assessment(child, a) for a in assessments]
    entries += [consent(child, c) for c in consents]
    return {"resourceType": "Bundle", "type": "transaction", "timestamp": datetime.now(timezone.utc).isoformat(), "entry": entries}


def validate(b: dict) -> list[str]:
    """Minimal structural checks (a full profile validation would use the SATUSEHAT validator)."""
    errors = []
    if b.get("resourceType") != "Bundle" or b.get("type") != "transaction":
        errors.append("Bundle must be a transaction")
    for i, e in enumerate(b.get("entry", [])):
        r = e.get("resource", {})
        if "resourceType" not in r:
            errors.append(f"entry[{i}] missing resourceType")
        if "request" not in e:
            errors.append(f"entry[{i}] missing request")
        if r.get("resourceType") == "Observation" and not r.get("subject"):
            errors.append(f"entry[{i}] Observation missing subject")
    return errors
