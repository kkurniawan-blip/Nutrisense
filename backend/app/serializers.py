"""Model -> JSON helpers used by the routers."""
from datetime import date

from .ai import kia
from .ai.growth import age_in_months, classify_haz, classify_waz, classify_whz
from .ai.triage import SUPPLY_CATALOG
from .models import (Case, Child, GrowthMeasurement, Locker, MealLog, Notification, Region, RiskAssessment,
                     SupplyRequest, SymptomReport, User)
from .services.logistics import available


def region(r: Region | None) -> dict | None:
    if r is None:
        return None
    return {"id": r.id, "name": r.name, "district": r.district, "province": r.province, "lat": r.lat, "lng": r.lng,
            "rural": r.rural, "prevalence_benchmark": r.prevalence_benchmark, "transport_difficulty": r.transport_difficulty,
            "puskesmas_name": r.puskesmas_name, "puskesmas_phone": r.puskesmas_phone, "facility_km": r.facility_km}


def user(u: User) -> dict:
    return {"id": u.id, "email": u.email, "full_name": u.full_name, "phone": u.phone, "role": u.role,
            "region_id": u.region_id, "region": region(u.region), "language": u.language,
            "covered_region_ids": sorted(u.coverage()) if u.role == "kader" else []}


def measurement(m: GrowthMeasurement) -> dict:
    return {"id": m.id, "child_id": m.child_id, "measured_at": m.measured_at.isoformat(), "age_months": m.age_months,
            "weight_kg": m.weight_kg, "height_cm": m.height_cm, "muac_cm": m.muac_cm, "position": m.position,
            "haz": m.haz, "waz": m.waz, "whz": m.whz, "haz_class": classify_haz(m.haz), "waz_class": classify_waz(m.waz),
            "whz_class": classify_whz(m.whz), "source": m.source, "client_uuid": m.client_uuid,
            "measured_by": m.measured_by, "oedema": m.oedema}


def assessment(a: RiskAssessment | None) -> dict | None:
    if a is None:
        return None
    return {"id": a.id, "child_id": a.child_id, "risk_level": a.reviewed_level or a.risk_level, "model_risk_level": a.risk_level,
            "probabilities": a.probabilities, "confidence": a.confidence, "needs_review": a.needs_review and a.reviewed_at is None,
            "guardrail": a.guardrail, "explanation": a.explanation, "reasons": a.reasons, "triage": a.triage, "trend": a.trend,
            "features": a.features, "model_run_id": a.model_run_id, "reviewed_level": a.reviewed_level,
            "review_note": a.review_note, "reviewed_at": a.reviewed_at.isoformat() if a.reviewed_at else None,
            "reviewed_by_name": a.reviewed_by.full_name if a.reviewed_by else None,
            "reviewed_by_role": a.reviewed_by.role if a.reviewed_by else None,
            "created_at": a.created_at.isoformat()}


def weight_gain(c: Child) -> dict:
    """KMS weighing results (N naik / T tidak naik, against the minimum gain KBM) and the 2T flag."""
    points = [(m.measured_at, m.age_months, m.weight_kg) for m in c.measurements]
    return {"weighings": kia.weighings(points)[-3:], "not_gaining": kia.not_gaining(points),
            "two_t": kia.not_gaining(points) >= 2, "source": "KBM · Buku KIA 2020"}


def child(c: Child, latest_assessment: RiskAssessment | None = None) -> dict:
    last = c.measurements[-1] if c.measurements else None
    return {"id": c.id, "name": c.name, "sex": c.sex, "birth_date": c.birth_date.isoformat(),
            "age_months": age_in_months(c.birth_date, date.today()), "caregiver_id": c.caregiver_id,
            "caregiver_name": c.caregiver.full_name if c.caregiver else None, "kader_id": c.kader_id,
            "region_id": c.region_id, "region": region(c.region), "birth_weight_kg": c.birth_weight_kg,
            "birth_length_cm": c.birth_length_cm, "clean_water_access": c.clean_water_access,
            "sanitation_access": c.sanitation_access, "exclusive_breastfeeding": c.exclusive_breastfeeding,
            "birth_gestational_weeks": c.birth_gestational_weeks, "weight_gain": weight_gain(c),
            "latest_measurement": measurement(last) if last else None, "measurement_count": len(c.measurements),
            "latest_assessment": assessment(latest_assessment)}


def symptom_report(r: SymptomReport) -> dict:
    return {"id": r.id, "child_id": r.child_id, "description": r.description, "symptoms": r.symptoms,
            "danger_signs": r.danger_signs, "appetite": r.appetite, "duration_days": r.duration_days,
            "interpreted_by": r.interpreted_by, "summary": r.summary, "created_at": r.created_at.isoformat()}


def meal(m: MealLog) -> dict:
    return {"id": m.id, "child_id": m.child_id, "eaten_at": m.eaten_at.isoformat(), "meal_type": m.meal_type, "items": m.items,
            "nutrients": m.nutrients, "food_groups": m.food_groups, "source": m.source, "ai_notes": m.ai_notes}


def case(c: Case, a: RiskAssessment | None = None) -> dict:
    return {"id": c.id, "child_id": c.child_id, "child_name": c.child.name, "region": region(c.child.region),
            "status": c.status, "priority": c.priority, "urgency": c.urgency, "assigned_to_id": c.assigned_to_id,
            "doctor_id": c.doctor_id, "assessment": assessment(a), "created_at": c.created_at.isoformat(),
            "updated_at": c.updated_at.isoformat(), "resolved_at": c.resolved_at.isoformat() if c.resolved_at else None,
            "notes": [{"id": n.id, "author": n.author.full_name, "author_role": n.author.role, "text": n.text,
                       "visible_to_caregiver": bool(n.visible_to_caregiver), "created_at": n.created_at.isoformat()} for n in c.notes]}


def item_name(key: str, lang: str) -> str:
    return SUPPLY_CATALOG.get(key, {}).get("name", {}).get(lang, key)


def supply_request(r: SupplyRequest, lang: str, include_code: bool) -> dict:
    return {"id": r.id, "child_id": r.child_id, "child_name": r.child.name, "case_id": r.case_id,
            "items": [{**i, "name": item_name(i["item_key"], lang),
                       "needs_doctor": SUPPLY_CATALOG.get(i["item_key"], {}).get("needs_doctor", False)} for i in r.items],
            "urgency": r.urgency, "status": r.status, "fulfillment": r.fulfillment,
            "locker": {"id": r.locker.id, "code": r.locker.code, "name": r.locker.name, "lat": r.locker.lat, "lng": r.locker.lng} if r.locker else None,
            "pickup_code": r.pickup_code if include_code else None, "qr_payload": r.qr_payload if include_code else None,
            "decision": r.decision, "approved_at": r.approved_at.isoformat() if r.approved_at else None,
            "ready_at": r.ready_at.isoformat() if r.ready_at else None,
            "expires_at": r.expires_at.isoformat() if r.expires_at else None,
            "picked_up_at": r.picked_up_at.isoformat() if r.picked_up_at else None, "created_at": r.created_at.isoformat()}


def locker(lk: Locker, lang: str = "id") -> dict:
    return {"id": lk.id, "code": lk.code, "name": lk.name, "kind": lk.kind, "region_id": lk.region_id, "lat": lk.lat, "lng": lk.lng,
            "status": lk.status, "slots_total": lk.slots_total, "last_heartbeat": lk.last_heartbeat.isoformat(),
            "inventory": [{"item_key": i.item_key, "name": item_name(i.item_key, lang), "quantity": i.quantity, "reserved": i.reserved,
                           "available": available(i), "restock_threshold": i.restock_threshold,
                           "low": available(i) <= i.restock_threshold} for i in sorted(lk.inventory, key=lambda x: x.item_key)]}


def notification(n: Notification) -> dict:
    return {"id": n.id, "kind": n.kind, "title": n.title, "body": n.body, "data": n.data, "read": n.read,
            "created_at": n.created_at.isoformat()}
