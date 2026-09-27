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
from ..services.common import audit, has_consent

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
        if not body.caregiver_email:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "caregiver_email is required when staff register a child")
        caregiver = db.scalar(select(User).where(User.email == body.caregiver_email.lower(), User.role == "caregiver"))
        if caregiver is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No caregiver account with that email; ask the caregiver to register first")
    else:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed")
    if not has_consent(db, caregiver.id, "data_processing"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Caregiver has not consented to data processing")
    if body.birth_date > date.today() or growth.age_in_months(body.birth_date, date.today()) > 60.9:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "NutriSense supports children aged 0-60 months")
    region_id = body.region_id or caregiver.region_id or (user.region_id if user.role == "kader" else None)
    if region_id is not None and db.get(Region, region_id) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown region")
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
    return S.child(child, _latest_assessment(db, child.id))


@router.patch("/children/{child_id}")
def update_child(child_id: int, body: ChildUpdateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    child = get_child(child_id, db, user)
    data = body.model_dump(exclude_unset=True)
    if "kader_id" in data and user.role not in OVERSIGHT:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only officers can reassign Kaders")
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
    from ..models import Case, ChatMessage, Consent, DroneDispatch, FhirSyncLog, MealLog, NutritionRecommendation, SupplyRequest

    for model in (NutritionRecommendation, MealLog, ChatMessage, FhirSyncLog, Consent):
        for row in db.scalars(select(model).where(model.child_id == child.id)).all():
            db.delete(row)
    for req in db.scalars(select(SupplyRequest).where(SupplyRequest.child_id == child.id)).all():
        if req.status in ("in_transit", "ready_for_pickup"):
            raise HTTPException(status.HTTP_409_CONFLICT, "A supply package is in progress; cancel or collect it first")
        for dsp in db.scalars(select(DroneDispatch).where(DroneDispatch.supply_request_id == req.id)).all():
            db.delete(dsp)
        db.flush()
        db.delete(req)
    for row in db.scalars(select(Case).where(Case.child_id == child.id)).all():
        db.delete(row)
    db.flush()
    for model in (RiskAssessment, SymptomReport):
        for row in db.scalars(select(model).where(model.child_id == child.id)).all():
            db.delete(row)
    db.flush()
    audit(db, user, "delete_child", "child", child.id)
    db.delete(child)
    db.commit()


def _record_measurement(db: Session, child: Child, body: MeasurementIn, user: User) -> tuple[GrowthMeasurement, bool]:
    if body.client_uuid:
        existing = db.scalar(select(GrowthMeasurement).where(GrowthMeasurement.client_uuid == body.client_uuid))
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
    m = GrowthMeasurement(child_id=child.id, measured_at=measured_at, age_months=age, weight_kg=body.weight_kg,
                          height_cm=body.height_cm, muac_cm=body.muac_cm, position=body.position, haz=z.haz, waz=z.waz,
                          whz=z.whz, source="kader" if user.role == "kader" else body.source, client_uuid=body.client_uuid,
                          recorded_by_id=user.id)
    db.add(m)
    db.flush()
    audit(db, user, "record_measurement", "child", child.id, measurement_id=m.id)
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
    if created and body.run_assessment and has_consent(db, child.caregiver_id, "ai_analysis"):
        result["assessment"] = S.assessment(run_assessment(db, child, user, lang_of(user, lang), measurement_id=m.id))
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
        if has_consent(db, child.caregiver_id, "ai_analysis"):
            a = run_assessment(db, child, user, lang_of(user, lang), measurement_id=mid)
            assessed.append({"child_id": child_id, "risk_level": a.risk_level})
    return {"results": results, "assessed": assessed}


@router.get("/children/{child_id}/growth-chart")
def growth_chart(child_id: int, indicator: str = "hfa", user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Child's points plus WHO reference curves (-3, -2, 0, +2 SD) for plotting."""
    child = get_child(child_id, db, user)
    if indicator not in ("hfa", "wfa"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "indicator must be hfa or wfa")
    value = "height_cm" if indicator == "hfa" else "weight_kg"
    latest = _latest_assessment(db, child.id)
    return {
        "indicator": indicator,
        "sex": child.sex,
        "points": [{"age_months": m.age_months, "value": getattr(m, value), "z": m.haz if indicator == "hfa" else m.waz,
                    "measured_at": m.measured_at.isoformat()} for m in child.measurements],
        "reference": growth.reference_curve(child.sex, indicator),
        "projection": (latest.trend.get("projections") if latest and indicator == "hfa" else None),
    }


@router.get("/children/{child_id}/assessments")
def list_assessments(child_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    child = get_child(child_id, db, user)
    rows = db.scalars(select(RiskAssessment).where(RiskAssessment.child_id == child.id).order_by(RiskAssessment.id.desc())).all()
    return [S.assessment(a) for a in rows]


@router.post("/children/{child_id}/assess")
def assess(child_id: int, lang: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    child = get_child(child_id, db, user)
    if not has_consent(db, child.caregiver_id, "ai_analysis"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Caregiver has not consented to AI analysis")
    try:
        return S.assessment(run_assessment(db, child, user, lang_of(user, lang)))
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))


@router.post("/children/{child_id}/symptoms", status_code=201)
def report_symptoms(child_id: int, body: SymptomIn, lang: str | None = None, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    """AI symptom checker: interprets free text (Bahasa/English/local terms), then re-runs risk triage."""
    child = get_child(child_id, db, user)
    if not body.description.strip() and not body.symptoms:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Describe the symptoms or select at least one")
    L = lang_of(user, lang)
    use_ai = has_consent(db, child.caregiver_id, "ai_analysis")
    parsed = symptom_ai.interpret(body.description, body.symptoms, L) if use_ai else {
        **symptom_ai.interpret_rules(body.description), "danger_signs": [], "summary": None, "other_concerns": [], "interpreted_by": "rules"}
    if not use_ai:
        parsed["symptoms"] = sorted(set(parsed["symptoms"]) | set(body.symptoms))
        parsed["danger_signs"] = sorted(set(parsed["symptoms"]) & symptom_ai.DANGER_SIGNS)
    report = SymptomReport(child_id=child.id, reported_by_id=user.id, description=body.description or None,
                           symptoms=parsed["symptoms"], danger_signs=parsed["danger_signs"],
                           appetite=body.appetite or parsed["appetite"], duration_days=body.duration_days or parsed["duration_days"],
                           interpreted_by=parsed["interpreted_by"], summary=parsed.get("summary"))
    db.add(report)
    db.flush()
    audit(db, user, "report_symptoms", "child", child.id, report_id=report.id, danger=bool(parsed["danger_signs"]))
    db.commit()
    db.refresh(child)
    out = {"report": S.symptom_report(report), "other_concerns": parsed.get("other_concerns", []), "assessment": None}
    if use_ai and (child.measurements or report.danger_signs):
        out["assessment"] = S.assessment(run_assessment(db, child, user, L, symptom_report_id=report.id))
    return out


@router.get("/children/{child_id}/symptoms")
def list_symptoms(child_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    child = get_child(child_id, db, user)
    rows = db.scalars(select(SymptomReport).where(SymptomReport.child_id == child.id).order_by(SymptomReport.id.desc())).all()
    return [S.symptom_report(r) for r in rows]


@router.get("/symptoms/catalog", tags=["reference"])
def symptom_catalog():
    return {"symptoms": symptom_ai.SYMPTOM_KEYS, "danger_signs": sorted(symptom_ai.DANGER_SIGNS)}
