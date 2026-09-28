"""Mother-facing helpers: today's checklist, development tracker, recipes and the child's care team."""
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..ai import development, nutrition
from ..ai.growth import age_in_months
from ..ai.recipes import RECIPES
from ..database import get_db
from ..deps import get_child, get_current_user, lang_of
from ..models import Case, CaseNote, Child, DevelopmentCheck, MealLog, RiskAssessment, SupplyRequest, SymptomReport, User
from ..services.common import audit

router = APIRouter(prefix="/api", tags=["family companion"])


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@router.get("/children/{child_id}/today")
def today_checklist(child_id: int, lang: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """'What should I do today?': a short, colour-coded checklist for the selected child.

    status: ok (green) | monitor (yellow) | action (orange) | urgent (red) | info (blue)
    """
    child = get_child(child_id, db, user)
    L = lang_of(user, lang)
    name = child.name.split(" ")[0]
    now = datetime.now(timezone.utc)
    items = []

    last = child.measurements[-1] if child.measurements else None
    if last and (date.today() - last.measured_at).days <= 30:
        items.append({"key": "measure", "status": "ok", "action": "measure",
                      "text": {"id": "Ukuran tercatat", "en": "Measured this month"}[L]})
    else:
        items.append({"key": "measure", "status": "action", "action": "measure",
                      "text": {"id": "Belum diukur bulan ini", "en": "Not measured this month"}[L]})

    meals = db.scalars(select(MealLog).where(MealLog.child_id == child.id, MealLog.eaten_at >= now - timedelta(days=2))).all()
    today_meals = [m for m in meals if _aware(m.eaten_at).date() == now.date()]
    groups = {g for m in today_meals for g in (m.food_groups or []) if g != "breast_milk"}
    if today_meals:
        items.append({"key": "meals", "status": "ok", "action": "meal",
                      "text": {"id": f"Makan {len(today_meals)}×", "en": f"Ate {len(today_meals)}×"}[L]})
        n = len(groups)
        items.append({"key": "diversity", "status": "ok" if n >= 5 else "monitor", "action": "meal", "count": n,
                      "text": {"id": f"{n}/8 kelompok makanan", "en": f"{n}/8 food groups"}[L]})
    elif age_in_months(child.birth_date, date.today()) >= 6:
        items.append({"key": "meals", "status": "action", "action": "meal",
                      "text": {"id": "Belum catat makan", "en": "No meals logged yet"}[L]})

    week = db.scalars(select(SymptomReport).where(SymptomReport.child_id == child.id, SymptomReport.created_at >= now - timedelta(days=7))
                      .order_by(SymptomReport.id.desc())).all()
    danger = [r for r in week if r.danger_signs]
    if danger:
        items.append({"key": "symptoms", "status": "urgent", "action": "symptoms",
                      "text": {"id": "Tanda bahaya! Segera ke Puskesmas", "en": "Danger sign! Go to the Puskesmas"}[L]})
    elif week:
        items.append({"key": "symptoms", "status": "monitor", "action": "symptoms",
                      "text": {"id": "Ada gejala. Pantau ya", "en": "Symptoms this week"}[L]})
    else:
        items.append({"key": "symptoms", "status": "ok", "action": "symptoms",
                      "text": {"id": "Tidak ada gejala", "en": "No symptoms"}[L]})

    ready = db.scalar(select(SupplyRequest).where(SupplyRequest.child_id == child.id, SupplyRequest.status == "ready_for_pickup"))
    if ready:
        items.append({"key": "package", "status": "info", "action": "pickups",
                      "text": {"id": "Paket siap diambil", "en": "Package ready"}[L]})
    return {"child_id": child.id, "items": items, "groups_today": sorted(groups)}


class DevelopmentIn(BaseModel):
    answers: dict[str, bool] = Field(description="milestone_key -> achieved")


def _answers(db: Session, child_id: int) -> dict[str, bool]:
    return {c.milestone_key: c.achieved for c in db.scalars(select(DevelopmentCheck).where(DevelopmentCheck.child_id == child_id)).all()}


@router.get("/children/{child_id}/development")
def get_development(child_id: int, lang: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    child = get_child(child_id, db, user)
    return development.summary(age_in_months(child.birth_date, date.today()), _answers(db, child.id), lang_of(user, lang))


@router.post("/children/{child_id}/development")
def save_development(child_id: int, body: DevelopmentIn, lang: str | None = None, user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    child = get_child(child_id, db, user)
    existing = {c.milestone_key: c for c in db.scalars(select(DevelopmentCheck).where(DevelopmentCheck.child_id == child.id)).all()}
    for key, achieved in body.answers.items():
        if key not in development.MILESTONES:
            continue
        row = existing.get(key)
        if row is None:
            db.add(DevelopmentCheck(child_id=child.id, milestone_key=key, achieved=achieved, recorded_by_id=user.id))
        else:
            row.achieved, row.recorded_by_id = achieved, user.id
    audit(db, user, "development_check", "child", child.id, count=len(body.answers))
    db.commit()
    return development.summary(age_in_months(child.birth_date, date.today()), _answers(db, child.id), lang_of(user, lang))


@router.get("/children/{child_id}/recipes")
def child_recipes(child_id: int, lang: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """All easy recipes suitable for the child's age, quickest first."""
    child = get_child(child_id, db, user)
    age = age_in_months(child.birth_date, date.today())
    L = lang_of(user, lang)
    rows = sorted((r for r in RECIPES if r["min_age"] <= age), key=lambda r: (r["minutes"], r["cost"]))
    return [nutrition.recipe_view(r, L) for r in rows]


ROLE_LABEL = {
    "caregiver": {"id": "Pengasuh", "en": "Caregiver"},
    "kader": {"id": "Kader kesehatan", "en": "Community health worker"},
    "officer": {"id": "Petugas Dinas Kesehatan", "en": "Health officer"},
    "doctor": {"id": "Dokter", "en": "Doctor"},
    "admin": {"id": "Admin", "en": "Admin"},
}


def care_info(db: Session, child: Child, lang: str) -> dict:
    """Care team, the latest professional review, and notes that staff chose to share with the family."""
    L = "id" if lang == "id" else "en"
    team = [{"role": "caregiver", "emoji": "👩", "name": child.caregiver.full_name, "label": ROLE_LABEL["caregiver"][L]}]
    if child.kader:
        team.append({"role": "kader", "emoji": "👩‍⚕️", "name": child.kader.full_name, "label": ROLE_LABEL["kader"][L],
                     "phone": child.kader.phone})
    if child.region:
        team.append({"role": "facility", "emoji": "🏥", "name": f"Puskesmas · {child.region.district}",
                     "label": {"id": "Fasilitas kesehatan", "en": "Health facility"}[L]})

    recs = []
    reviewed = db.scalar(select(RiskAssessment).where(RiskAssessment.child_id == child.id, RiskAssessment.reviewed_at.is_not(None))
                         .order_by(RiskAssessment.reviewed_at.desc()))
    if reviewed and reviewed.reviewed_by:
        recs.append({"kind": "review", "author": reviewed.reviewed_by.full_name, "role": reviewed.reviewed_by.role,
                     "role_label": ROLE_LABEL.get(reviewed.reviewed_by.role, {}).get(L), "text": reviewed.review_note or "",
                     "reviewed_level": reviewed.reviewed_level, "at": reviewed.reviewed_at.isoformat()})
    shared = db.scalars(select(CaseNote).join(Case).where(Case.child_id == child.id, CaseNote.visible_to_caregiver.is_(True))
                        .order_by(CaseNote.created_at.desc()).limit(5)).all()
    for n in shared:
        recs.append({"kind": "note", "author": n.author.full_name, "role": n.author.role,
                     "role_label": ROLE_LABEL.get(n.author.role, {}).get(L), "text": n.text, "at": n.created_at.isoformat()})
    recs.sort(key=lambda r: r["at"], reverse=True)
    return {"care_team": team, "professional_recommendations": recs, "last_reviewed": recs[0] if recs else None}
