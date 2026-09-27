from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import serializers as S
from ..database import get_db
from ..deps import STAFF, can_access_child, require_roles
from ..models import Case, CaseNote, Child, RiskAssessment, User
from ..schemas import CaseUpdateIn, ReviewIn
from ..services.common import audit, notify

router = APIRouter(prefix="/api", tags=["cases & human review"])

_PRIORITY_ORDER = {"emergency": 0, "high": 1, "medium": 2, "low": 3}


def _case_or_404(db: Session, case_id: int, user: User) -> Case:
    case = db.get(Case, case_id)
    if case is None or not can_access_child(user, case.child):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case not found")
    return case


@router.get("/cases")
def list_cases(status_filter: str | None = None, priority: str | None = None, region_id: int | None = None, mine: bool = False,
               user: User = Depends(require_roles(*STAFF)), db: Session = Depends(get_db)):
    q = select(Case).join(Child)
    if status_filter:
        q = q.where(Case.status.in_(status_filter.split(",")))
    if priority:
        q = q.where(Case.priority == priority)
    if region_id:
        q = q.where(Child.region_id == region_id)
    if mine:
        q = q.where((Case.assigned_to_id == user.id) | (Case.doctor_id == user.id))
    cases = [c for c in db.scalars(q).all() if can_access_child(user, c.child)]
    cases.sort(key=lambda c: (c.status in ("resolved", "closed"), _PRIORITY_ORDER.get(c.priority, 9), -c.id))
    return [S.case(c, db.get(RiskAssessment, c.assessment_id) if c.assessment_id else None) for c in cases]


@router.get("/cases/{case_id}")
def get_case(case_id: int, user: User = Depends(require_roles(*STAFF)), db: Session = Depends(get_db)):
    case = _case_or_404(db, case_id, user)
    return S.case(case, db.get(RiskAssessment, case.assessment_id) if case.assessment_id else None)


@router.patch("/cases/{case_id}")
def update_case(case_id: int, body: CaseUpdateIn, user: User = Depends(require_roles(*STAFF)), db: Session = Depends(get_db)):
    case = _case_or_404(db, case_id, user)
    data = body.model_dump(exclude_unset=True)
    note = data.pop("note", None)
    share = data.pop("share_with_family", False)
    if data.get("status") in ("resolved", "closed") and user.role == "kader" and case.priority in ("high", "emergency"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "High-priority cases must be closed by a doctor or officer")
    for field, value in data.items():
        setattr(case, field, value)
    if data.get("status") in ("resolved", "closed"):
        case.resolved_at = datetime.now(timezone.utc)
    if note:
        db.add(CaseNote(case_id=case.id, author_id=user.id, text=note, visible_to_caregiver=bool(share)))
        if share:
            notify(db, case.child.caregiver_id, "care_note", "Pesan dari tenaga kesehatan / Message from your health worker",
                   note[:200], child_id=case.child_id)
    if data.get("status") == "referred":
        notify(db, case.child.caregiver_id, "referral", "Rujukan / Referral",
               f"{case.child.name} dirujuk ke dokter/Puskesmas. / {case.child.name} has been referred to a doctor.", case_id=case.id)
    if "assigned_to_id" in data and data["assigned_to_id"]:
        notify(db, data["assigned_to_id"], "case_assigned", "Kasus baru / New case assigned", case.child.name, case_id=case.id)
    audit(db, user, "update_case", "case", case.id, **{k: v for k, v in data.items()}, note_added=bool(note))
    db.commit()
    db.refresh(case)
    return S.case(case, db.get(RiskAssessment, case.assessment_id) if case.assessment_id else None)


@router.post("/assessments/{assessment_id}/review")
def review_assessment(assessment_id: int, body: ReviewIn, user: User = Depends(require_roles("kader", "doctor", "officer", "admin")),
                      db: Session = Depends(get_db)):
    """Human-in-the-loop: a health worker confirms or overrides the AI risk level.

    Kaders may confirm a result or raise concern after a home visit, but only a doctor or health officer
    can lower a result the AI flagged as high risk.
    """
    a = db.get(RiskAssessment, assessment_id)
    if a is None or not can_access_child(user, db.get(Child, a.child_id)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assessment not found")
    order = ["low", "medium", "high"]
    if user.role == "kader" and a.risk_level == "high" and order.index(body.reviewed_level) < order.index("high"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a doctor or health officer can lower a high-risk result")
    a.reviewed_level, a.review_note, a.reviewed_by_id = body.reviewed_level, body.note, user.id
    a.reviewed_at = datetime.now(timezone.utc)
    child = db.get(Child, a.child_id)
    if body.reviewed_level != a.risk_level:
        notify(db, child.caregiver_id, "assessment_reviewed", "Hasil ditinjau tenaga kesehatan / Result reviewed",
               f"{child.name}: {a.risk_level} -> {body.reviewed_level}. {body.note}", assessment_id=a.id)
    audit(db, user, "review_assessment", "risk_assessment", a.id, model_level=a.risk_level, reviewed_level=body.reviewed_level)
    db.commit()
    db.refresh(a)
    return S.assessment(a)


@router.get("/reviews/pending")
def pending_reviews(user: User = Depends(require_roles("kader", "doctor", "officer", "admin")), db: Session = Depends(get_db)):
    rows = db.scalars(select(RiskAssessment).where(RiskAssessment.needs_review.is_(True), RiskAssessment.reviewed_at.is_(None))
                      .order_by(RiskAssessment.id.desc())).all()
    latest_ids = {}
    for a in rows:
        if can_access_child(user, db.get(Child, a.child_id)):
            latest_ids.setdefault(a.child_id, a)
    return [{**S.assessment(a), "child_name": db.get(Child, a.child_id).name} for a in latest_ids.values()]
