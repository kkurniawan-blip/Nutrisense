"""Connection to the Puskesmas or hospital: the mother's link and consent, the FHIR endpoint that facility systems
call after each antenatal check-up, and a demo portal that sends the same FHIR message from inside the app."""
import json
from datetime import date
from secrets import token_hex

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import get_settings
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
    """The mother's consent: allow the Puskesmas/hospital to send her check-up results. Turning it off stops the code
    at once; turning it on again gives a new code, so an old code that was shared can no longer be used."""
    p = get_pregnancy(pid, db, user)
    if user.id != p.mother_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the mother can connect her pregnancy to a health facility")
    if body.enabled and not p.facility_sync:
        if p.status != "active":
            raise HTTPException(status.HTTP_409_CONFLICT, "Only an ongoing pregnancy can be connected")
        FS.issue_link_code(db, p)
    elif not body.enabled:
        FS.revoke_link_code(db, p)
    p.facility_sync = body.enabled
    db.add(Consent(user_id=user.id, scope="facility_sync", granted=body.enabled))
    audit(db, user, "facility_link", "pregnancy", p.id, enabled=body.enabled)
    db.commit()
    return _link(db, p)


MAX_BUNDLE_BYTES = 1_000_000  # a check-up Bundle is a few kB


async def _read_bundle(request: Request):
    """The body as JSON, read only up to a limit so an oversized upload cannot exhaust memory. Errors are returned, not
    raised, so the endpoint can answer them as an OperationOutcome after checking the key."""
    try:
        if int(request.headers.get("content-length") or 0) > MAX_BUNDLE_BYTES:
            return FS.SyncError(413, f"The body is larger than {MAX_BUNDLE_BYTES} bytes")
    except ValueError:
        return FS.SyncError(400, "Bad Content-Length")
    buf = bytearray()
    async for chunk in request.stream():
        buf += chunk
        if len(buf) > MAX_BUNDLE_BYTES:
            return FS.SyncError(413, f"The body is larger than {MAX_BUNDLE_BYTES} bytes")
    try:
        return json.loads(buf)
    except (ValueError, RecursionError):
        return FS.SyncError(400, "The body is not valid JSON")


_BUNDLE_BODY = {"requestBody": {"required": True, "content": {t: {"schema": {"type": "object", "description": "FHIR R4 Bundle"}}
                                                              for t in ("application/fhir+json", "application/json")}}}


@router.post("/integrations/fhir", openapi_extra=_BUNDLE_BODY)
def receive_fhir(bundle=Depends(_read_bundle), authorization: str | None = Header(default=None),
                 x_facility_key: str | None = Header(default=None), db: Session = Depends(get_db)):
    """Called by the facility's system after an antenatal check-up. Auth: `Authorization: Bearer <facility key>`
    (or `X-Facility-Key`). Body: a FHIR R4 Bundle; see docs/FACILITY_INTEGRATION.md. Answers with an OperationOutcome:
    201 stored, 200 updated (a resend of the same Encounter id)."""
    key = x_facility_key or (authorization[7:] if authorization and authorization.lower().startswith("bearer ") else None)
    facility = FS.facility_for_key(db, key)
    if facility is None:
        return _outcome(401, "Unknown or inactive facility key")
    if isinstance(bundle, FS.SyncError):
        return _outcome(bundle.status, str(bundle))
    try:
        code, exam = FS.parse_bundle(bundle)
    except FS.SyncError as e:
        return _outcome(e.status, str(e))
    for attempt in range(2):
        try:
            row, created = FS.ingest(db, facility, code, dict(exam))
            db.commit()
            break
        except FS.SyncError as e:
            db.rollback()
            return _outcome(e.status, str(e))
        except IntegrityError:
            # The same check-up arrived twice at the same moment: the other request stored it, so this one updates it.
            db.rollback()
    else:
        return _outcome(503, "The check-up is being stored by another request; send it again")
    result = "created" if created else "updated"
    return _outcome(201 if created else 200, f"Check-up {'stored' if created else 'updated'} (K{row.visit_number or '?'}, "
                                             f"{row.exam_date.isoformat()})", result=result)


# HTTP status -> OperationOutcome issue code (FHIR R4 IssueType).
_ISSUE = {400: "structure", 401: "security", 403: "forbidden", 404: "not-found", 409: "conflict", 413: "too-long", 422: "invalid",
          503: "transient"}
RESULT_SYSTEM = f"{FS.LOCAL}/CodeSystem/sync-result"


def _outcome(code: int, text: str, result: str | None = None) -> JSONResponse:
    issue = {"severity": "information", "code": "informational", "diagnostics": text} if code < 300 else \
        {"severity": "error", "code": _ISSUE.get(code, "processing"), "diagnostics": text}
    if result:
        issue["details"] = {"coding": [{"system": RESULT_SYSTEM, "code": result}], "text": text}
    return JSONResponse(status_code=code, content={"resourceType": "OperationOutcome", "issue": [issue]},
                        media_type="application/fhir+json", headers={"WWW-Authenticate": "Bearer"} if code == 401 else None)


@router.get("/facilities")
def list_facilities(user: User = Depends(require_roles("doctor", "officer", "admin")), db: Session = Depends(get_db)):
    return [{"id": f.id, "name": f.name, "kind": f.kind, "code": f.code}
            for f in db.scalars(select(HealthFacility).where(HealthFacility.active.is_(True)).order_by(HealthFacility.name)).all()]


@router.post("/facility-portal/checkup", status_code=201)
def portal_checkup(body: PortalExamIn, user: User = Depends(require_roles("doctor", "officer", "admin")), db: Session = Depends(get_db)):
    """Demo of the facility side: builds the FHIR Bundle a Puskesmas system would send and runs it through the same
    parser and checks as /api/integrations/fhir. Off in production: there, results come only from facility systems."""
    if get_settings().environment == "production":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
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
