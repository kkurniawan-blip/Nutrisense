"""Connection to the Puskesmas or hospital: the mother's link and consent, the FHIR endpoint that facility systems
call after each antenatal check-up, and a demo portal that sends the same FHIR message from inside the app."""
from datetime import date
from secrets import token_hex

from fastapi import APIRouter, Body, Depends, Header, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, lang_of, require_roles
from ..models import AncExam, Consent, HealthFacility, Pregnancy, User
from ..services import facility_sync as FS
from ..services.common import audit
from .maternal import get_pregnancy, view

router = APIRouter(prefix="/api", tags=["facility sync"])


class LinkIn(BaseModel):
    enabled: bool


class PortalExamIn(BaseModel):
    facility_id: int
    link_code: str = Field(min_length=4, max_length=12)
    visit_number: int | None = Field(default=None, ge=1, le=6)
    exam_date: date | None = None
    examiner: str | None = Field(default=None, max_length=120)
    weight_kg: float | None = None
    bp_systolic: int | None = None
    bp_diastolic: int | None = None
    muac_cm: float | None = None
    hb_g_dl: float | None = None
    fundal_height_cm: float | None = None
    fetal_heart_rate: int | None = None
    fetal_presentation: str | None = Field(default=None, pattern="^(head|breech|transverse)$")
    urine_protein: str | None = Field(default=None, max_length=10)
    td_immunization: str | None = Field(default=None, max_length=10)
    iron_tablets: int | None = None
    notes: str | None = Field(default=None, max_length=500)


def _link(db: Session, p) -> dict:
    fac = db.get(HealthFacility, p.linked_facility_id) if p.linked_facility_id else None
    exams = db.scalars(select(AncExam).where(AncExam.pregnancy_id == p.id).order_by(AncExam.exam_date.desc(), AncExam.id.desc())).all()
    return {"enabled": bool(p.facility_sync), "code": p.link_code if p.facility_sync else None,
            "facility": fac.name if fac else None, "last_sync_at": p.last_sync_at.isoformat() if p.last_sync_at else None,
            "exams": [FS.exam_view(e) for e in exams]}


@router.get("/pregnancies/{pid}/link")
def get_link(pid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = get_pregnancy(pid, db, user)
    out = _link(db, p)
    if user.id != p.mother_id:
        out["code"] = None  # only the mother sees her code
    return out


@router.post("/pregnancies/{pid}/link")
def set_link(pid: int, body: LinkIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The mother's consent: allow the Puskesmas/hospital to send her check-up results. Turning it on again gives a
    new code, so an old code that was shared can no longer be used."""
    p = get_pregnancy(pid, db, user)
    if user.id != p.mother_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the mother can connect her pregnancy to a health facility")
    if body.enabled and not p.facility_sync:
        p.link_code = FS.new_link_code(db)
    p.facility_sync = body.enabled
    db.add(Consent(user_id=user.id, scope="facility_sync", granted=body.enabled))
    audit(db, user, "facility_link", "pregnancy", p.id, enabled=body.enabled)
    db.commit()
    return _link(db, p)


@router.post("/integrations/fhir")
def receive_fhir(bundle: dict = Body(...), authorization: str | None = Header(default=None),
                 x_facility_key: str | None = Header(default=None), db: Session = Depends(get_db)):
    """Called by the facility's system after an antenatal check-up. Auth: `Authorization: Bearer <facility key>`
    (or `X-Facility-Key`). Body: a FHIR R4 Bundle; see docs/FACILITY_INTEGRATION.md. Answers with an OperationOutcome."""
    key = x_facility_key or (authorization[7:] if authorization and authorization.lower().startswith("bearer ") else None)
    facility = FS.facility_for_key(db, key)
    if facility is None:
        return _outcome(401, "error", "security", "Unknown or inactive facility key")
    try:
        code, exam = FS.parse_bundle(bundle)
        row, created = FS.ingest(db, facility, code, exam)
    except FS.SyncError as e:
        db.rollback()
        return _outcome(e.status, "error", "processing" if e.status == 422 else "not-found" if e.status == 404 else "forbidden", str(e))
    db.commit()
    return _outcome(201 if created else 200, "information", "informational",
                    f"Check-up {'stored' if created else 'updated'} (K{row.visit_number or '?'}, {row.exam_date.isoformat()})",
                    exam_id=row.id, created=created)


def _outcome(code: int, severity: str, issue: str, text: str, **extra) -> JSONResponse:
    return JSONResponse(status_code=code, content={"resourceType": "OperationOutcome",
                                                   "issue": [{"severity": severity, "code": issue, "diagnostics": text}], **extra})


@router.get("/facilities")
def list_facilities(user: User = Depends(require_roles("doctor", "officer", "admin")), db: Session = Depends(get_db)):
    return [{"id": f.id, "name": f.name, "kind": f.kind, "code": f.code}
            for f in db.scalars(select(HealthFacility).where(HealthFacility.active.is_(True)).order_by(HealthFacility.name)).all()]


@router.post("/facility-portal/checkup", status_code=201)
def portal_checkup(body: PortalExamIn, user: User = Depends(require_roles("doctor", "officer", "admin")), db: Session = Depends(get_db)):
    """Demo of the facility side: builds the FHIR Bundle a Puskesmas system would send and runs it through the same
    parser and checks as /api/integrations/fhir."""
    facility = db.get(HealthFacility, body.facility_id)
    if facility is None or not facility.active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Facility not found")
    exam = body.model_dump(exclude={"facility_id", "link_code", "notes"})
    exam["exam_date"] = body.exam_date or date.today()
    exam["external_id"] = f"portal-{token_hex(6)}"
    code = FS.normalize_code(body.link_code)
    try:
        parsed_code, parsed = FS.parse_bundle(FS.build_bundle(code, exam, facility))
        if body.notes:
            parsed["notes"] = body.notes
        row, _ = FS.ingest(db, facility, parsed_code, parsed, actor=user)
    except FS.SyncError as e:
        db.rollback()
        raise HTTPException(e.status, str(e))
    db.commit()
    preg = db.get(Pregnancy, row.pregnancy_id)
    return {"exam": FS.exam_view(row), "mother_name": preg.mother.full_name, "risk": view(db, preg, lang_of(user))["risk"]}
