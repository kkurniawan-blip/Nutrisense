from datetime import date, datetime, timezone

from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import serializers as S
from ..ai import assistant, llm, nutrition
from ..ai.growth import age_in_months
from ..database import get_db
from ..deps import get_child, get_current_user, lang_of
from ..models import ChatMessage, MealLog, NutritionRecommendation, RiskAssessment, SymptomReport, User
from ..schemas import ChatIn, MealIn, MenuSuggestIn
from ..services.common import audit, has_consent

router = APIRouter(prefix="/api", tags=["nutrition & AI assistant"])

MAX_IMAGE_BYTES = 5 * 1024 * 1024
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


@router.get("/foods")
def foods(lang: str = "id"):
    return {"foods": nutrition.food_list(lang), "groups": nutrition.FOOD_GROUPS}


@router.post("/children/{child_id}/meals", status_code=201)
def log_meal(child_id: int, body: MealIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    child = get_child(child_id, db, user)
    if body.client_uuid:
        dup = db.scalar(select(MealLog).where(MealLog.client_uuid == body.client_uuid, MealLog.child_id == child.id))
        if dup:
            return S.meal(dup)
    items, totals, groups = nutrition.compute_meal([i.model_dump() for i in body.items])
    try:
        eaten = datetime.fromisoformat(body.eaten_at) if body.eaten_at else datetime.now(timezone.utc)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "eaten_at must be an ISO 8601 date-time")
    meal = MealLog(child_id=child.id, logged_by_id=user.id, eaten_at=eaten, meal_type=body.meal_type, items=items,
                   nutrients=totals, food_groups=groups, source=body.source if body.source in ("manual", "nutriscan") else "manual",
                   ai_notes=body.ai_notes, client_uuid=body.client_uuid)
    db.add(meal)
    audit(db, user, "log_meal", "child", child.id)
    db.commit()
    db.refresh(meal)
    return S.meal(meal)


@router.get("/children/{child_id}/meals")
def list_meals(child_id: int, limit: int = 50, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    child = get_child(child_id, db, user)
    rows = db.scalars(select(MealLog).where(MealLog.child_id == child.id).order_by(MealLog.eaten_at.desc()).limit(limit)).all()
    return [S.meal(m) for m in rows]


@router.post("/children/{child_id}/nutriscan")
async def nutriscan(child_id: int, image: UploadFile = File(...), lang: str | None = None, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    """NutriScan: photo of a meal -> detected foods, portions and nutrients (not saved until the user confirms)."""
    child = get_child(child_id, db, user)
    if not has_consent(db, child.caregiver_id, "ai_analysis"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Caregiver has not consented to AI analysis")
    media_type = image.content_type or "image/jpeg"
    if media_type not in IMAGE_TYPES:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Upload a JPEG, PNG, WEBP or GIF image")
    data = await image.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "Image must be 5 MB or smaller")
    if not llm.is_enabled():
        return {"available": False, "message": "AI photo recognition is not configured on this server. Select foods manually.",
                "items": [], "nutrients": {}, "food_groups": []}
    result = nutrition.scan_image(data, media_type, age_in_months(child.birth_date, date.today()), lang_of(user, lang))
    if result is None:
        return {"available": False, "message": "Could not analyse the photo right now. Select foods manually.",
                "items": [], "nutrients": {}, "food_groups": []}
    audit(db, user, "nutriscan", "child", child.id, items=len(result["items"]))
    db.commit()
    return {"available": True, **result}


@router.post("/children/{child_id}/menu-suggestions")
def menu_suggestions(child_id: int, body: MenuSuggestIn = Body(default=MenuSuggestIn()), lang: str | None = None,
                     user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Menu suggester (used by NutriScan): easy, cheap dishes that fill today's missing food groups
    and this week's nutrient gaps."""
    child = get_child(child_id, db, user)
    L = lang_of(user, lang)
    age = age_in_months(child.birth_date, date.today())
    meals = db.scalars(select(MealLog).where(MealLog.child_id == child.id).order_by(MealLog.eaten_at.desc()).limit(100)).all()
    today = datetime.now(timezone.utc).date()
    groups = {g for m in meals if (m.eaten_at if m.eaten_at.tzinfo else m.eaten_at.replace(tzinfo=timezone.utc)).date() == today
              for g in (m.food_groups or [])}
    _, _, pending_groups = nutrition.compute_meal([i.model_dump() for i in body.items])
    groups |= set(pending_groups)
    intake = nutrition.analyse_intake(meals, age, lang=L)
    result = nutrition.suggest_menus(age, sorted(groups), intake.get("gaps") or [], L,
                                     use_ai=has_consent(db, child.caregiver_id, "ai_analysis"))
    return {"groups_today": sorted(groups), **result}


@router.get("/children/{child_id}/nutrition-plan")
def nutrition_plan(child_id: int, refresh: bool = False, lang: str | None = None, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    child = get_child(child_id, db, user)
    latest = db.scalar(select(NutritionRecommendation).where(NutritionRecommendation.child_id == child.id)
                       .order_by(NutritionRecommendation.id.desc()))
    stale = latest is not None and any("minutes" not in r for r in latest.content.get("recipes", []))  # pre-v2 recipe format
    if latest and not refresh and not stale:
        return {"id": latest.id, "created_at": latest.created_at.isoformat(), **latest.content}

    L = lang_of(user, lang)
    age = age_in_months(child.birth_date, date.today())
    meals = db.scalars(select(MealLog).where(MealLog.child_id == child.id).order_by(MealLog.eaten_at.desc()).limit(100)).all()
    intake = nutrition.analyse_intake(meals, age, lang=L)
    a = db.scalar(select(RiskAssessment).where(RiskAssessment.child_id == child.id).order_by(RiskAssessment.id.desc()))
    last_m = child.measurements[-1] if child.measurements else None
    reports = db.scalars(select(SymptomReport).where(SymptomReport.child_id == child.id).order_by(SymptomReport.id.desc()).limit(3)).all()
    ctx = {"age_months": age, "sex": child.sex, "name": child.name, "haz": last_m.haz if last_m else None,
           "whz": last_m.whz if last_m else None, "symptoms": sorted({s for r in reports for s in r.symptoms})}
    risk = (a.reviewed_level or a.risk_level) if a else None
    content = nutrition.recommend(ctx, intake, risk, L, use_ai=has_consent(db, child.caregiver_id, "ai_analysis"))
    rec = NutritionRecommendation(child_id=child.id, assessment_id=a.id if a else None, content=content, generated_by=content["generated_by"])
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return {"id": rec.id, "created_at": rec.created_at.isoformat(), **content}


def _child_context(db: Session, child) -> str:
    age = age_in_months(child.birth_date, date.today())
    m = child.measurements[-1] if child.measurements else None
    a = db.scalar(select(RiskAssessment).where(RiskAssessment.child_id == child.id).order_by(RiskAssessment.id.desc()))
    lines = [f"Name: {child.name}; sex: {child.sex}; age: {age:.0f} months."]
    if m:
        lines.append(f"Latest measurement {m.measured_at}: weight {m.weight_kg} kg, height {m.height_cm} cm, "
                     f"HAZ {m.haz}, WAZ {m.waz}, WHZ {m.whz}.")
    if a:
        lines.append(f"Latest risk level: {a.reviewed_level or a.risk_level}. Reasons: {'; '.join(r['text'] for r in a.reasons[:4])}.")
        lines.append(f"Triage urgency: {a.triage.get('urgency')}. Growth trend: {a.trend.get('status')}.")
    return "\n".join(lines)


@router.post("/assistant/chat")
def chat(body: ChatIn, lang: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    child = get_child(body.child_id, db, user) if body.child_id else None
    ai_ok = has_consent(db, child.caregiver_id if child else user.id, "ai_analysis") or user.role != "caregiver"
    history = db.scalars(select(ChatMessage).where(ChatMessage.user_id == user.id, ChatMessage.child_id == (child.id if child else None))
                         .order_by(ChatMessage.id.desc()).limit(12)).all()
    turns = [{"role": h.role, "content": h.content} for h in reversed(history)]
    L = lang_of(user, lang)
    if ai_ok:
        answer, source = assistant.reply(turns, body.message, _child_context(db, child) if child else None, L)
    else:
        answer, source = assistant._faq(body.message, L), "faq"
    db.add(ChatMessage(user_id=user.id, child_id=child.id if child else None, role="user", content=body.message))
    db.add(ChatMessage(user_id=user.id, child_id=child.id if child else None, role="assistant", content=answer, generated_by=source))
    db.commit()
    return {"reply": answer, "generated_by": source}


@router.get("/assistant/history")
def chat_history(child_id: int | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if child_id:
        get_child(child_id, db, user)
    rows = db.scalars(select(ChatMessage).where(ChatMessage.user_id == user.id, ChatMessage.child_id == child_id)
                      .order_by(ChatMessage.id.desc()).limit(50)).all()
    return [{"id": r.id, "role": r.role, "content": r.content, "generated_by": r.generated_by, "created_at": r.created_at.isoformat()}
            for r in reversed(rows)]
