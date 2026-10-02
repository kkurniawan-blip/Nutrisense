"""Governance layer: consent, audit trail, SATUSEHAT/FHIR export, notifications and model registry."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .. import serializers as S
from ..database import get_db
from ..deps import get_child, get_current_user, require_roles
from ..models import AuditLog, Consent, FhirSyncLog, ModelRun, Notification, RiskAssessment, User
from ..schemas import ConsentIn
from ..services import fhir, model_registry
from ..services.common import audit, has_consent

router = APIRouter(prefix="/api", tags=["governance"])

SCOPES = ("data_processing", "ai_analysis", "satusehat_sharing", "research_use")


@router.get("/consents")
def my_consents(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {scope: has_consent(db, user.id, scope) for scope in SCOPES}


@router.post("/consents")
def set_consent(body: ConsentIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.scope == "data_processing" and not body.granted:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Withdrawing data-processing consent requires deleting your children's records (DELETE /api/children/{id})")
    if body.child_id:
        get_child(body.child_id, db, user)
    db.add(Consent(user_id=user.id, child_id=body.child_id, scope=body.scope, granted=body.granted))
    audit(db, user, "consent_change", "consent", None, scope=body.scope, granted=body.granted)
    db.commit()
    return {scope: has_consent(db, user.id, scope) for scope in SCOPES}


@router.get("/audit-logs")
def audit_logs(limit: int = Query(100, ge=1, le=500), entity: str | None = None, _: User = Depends(require_roles("admin", "officer")),
               db: Session = Depends(get_db)):
    q = select(AuditLog).order_by(AuditLog.id.desc()).limit(min(limit, 500))
    if entity:
        q = q.where(AuditLog.entity == entity)
    return [{"id": a.id, "user_id": a.user_id, "action": a.action, "entity": a.entity, "entity_id": a.entity_id,
             "detail": a.detail, "created_at": a.created_at.isoformat()} for a in db.scalars(q).all()]


def _bundle_for(db: Session, child):
    assessments = db.scalars(select(RiskAssessment).where(RiskAssessment.child_id == child.id)).all()
    consents = db.scalars(select(Consent).where(Consent.user_id == child.caregiver_id, Consent.scope == "satusehat_sharing")
                          .order_by(Consent.id.desc()).limit(1)).all()
    return fhir.bundle(child, child.measurements, assessments, consents)


@router.get("/children/{child_id}/fhir")
def export_fhir(child_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """FHIR R4 transaction Bundle (Patient, Observation, RiskAssessment, Consent) — the caregiver's data export."""
    child = get_child(child_id, db, user)
    b = _bundle_for(db, child)
    audit(db, user, "fhir_export", "child", child.id, resources=len(b["entry"]))
    db.commit()
    return b


@router.post("/children/{child_id}/fhir/sync")
def sync_satusehat(child_id: int, user: User = Depends(require_roles("kader", "officer", "doctor", "admin")), db: Session = Depends(get_db)):
    """Simulated SATUSEHAT submission. Blocked unless the caregiver consented to sharing."""
    child = get_child(child_id, db, user)
    if not has_consent(db, child.caregiver_id, "satusehat_sharing"):
        db.add(FhirSyncLog(child_id=child.id, triggered_by_id=user.id, status="blocked_no_consent", resource_count=0,
                           message="Caregiver has not consented to SATUSEHAT sharing"))
        audit(db, user, "fhir_sync_blocked", "child", child.id)
        db.commit()
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Caregiver has not consented to SATUSEHAT sharing")
    b = _bundle_for(db, child)
    errors = fhir.validate(b)
    log = FhirSyncLog(child_id=child.id, triggered_by_id=user.id, status="simulated_success" if not errors else "validation_failed",
                      resource_count=len(b["entry"]), message="; ".join(errors) or "Bundle accepted by simulated SATUSEHAT endpoint")
    db.add(log)
    audit(db, user, "fhir_sync", "child", child.id, status=log.status, resources=log.resource_count)
    db.commit()
    return {"status": log.status, "resources": log.resource_count, "errors": errors}


@router.get("/notifications")
def notifications(unread_only: bool = False, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        q = q.where(Notification.read.is_(False))
    return [S.notification(n) for n in db.scalars(q.order_by(Notification.id.desc()).limit(100)).all()]


@router.post("/notifications/{notification_id}/read")
def mark_read(notification_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = db.get(Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    n.read = True
    db.commit()
    return S.notification(n)


@router.post("/notifications/read-all")
def mark_all_read(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(update(Notification).where(Notification.user_id == user.id).values(read=True))
    db.commit()
    return {"ok": True}


@router.get("/models")
def model_runs(_: User = Depends(require_roles("officer", "doctor", "admin")), db: Session = Depends(get_db)):
    return [{"id": r.id, "name": r.name, "algorithm": r.algorithm, "version": r.version, "is_active": r.is_active,
             "n_samples": r.n_samples, "metrics": {k: r.metrics.get(k) for k in ("accuracy", "f1_macro", "false_negative_rate_high")},
             "trained_at": r.trained_at.isoformat()} for r in db.scalars(select(ModelRun).order_by(ModelRun.id.desc())).all()]


@router.post("/models/retrain")
def retrain(user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    run = model_registry.train_and_register(db, notes=f"Retrained by {user.email or user.full_name}")
    audit(db, user, "model_retrain", "model_run", run.id)
    db.commit()
    return {"id": run.id, "metrics": run.metrics}
