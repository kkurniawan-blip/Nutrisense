from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import serializers as S
from ..database import get_db
from ..deps import get_current_user, require_roles
from ..models import Consent, Region, User
from ..schemas import LoginIn, ProfileUpdateIn, RegisterIn, StaffCreateIn
from ..security import create_access_token, hash_password, verify_password
from ..services.common import audit

router = APIRouter(prefix="/api", tags=["auth & users"])


def _token_response(user: User) -> dict:
    return {"access_token": create_access_token(user.id, user.role), "token_type": "bearer", "user": S.user(user)}


@router.post("/auth/register", status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    """Caregiver self-registration. Consent to data processing is mandatory (privacy by design)."""
    if not body.consent_data_processing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Consent to data processing is required to use NutriSense")
    if db.scalar(select(User).where(User.email == body.email.lower())):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    if body.region_id is not None and db.get(Region, body.region_id) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown region")
    user = User(email=body.email.lower(), password_hash=hash_password(body.password), full_name=body.full_name,
                phone=body.phone, role="caregiver", region_id=body.region_id, language=body.language if body.language in ("id", "en") else "id")
    db.add(user)
    db.flush()
    for scope, granted in (("data_processing", True), ("ai_analysis", body.consent_ai_analysis),
                           ("satusehat_sharing", body.consent_satusehat_sharing), ("research_use", body.consent_research_use)):
        db.add(Consent(user_id=user.id, scope=scope, granted=granted))
    audit(db, user, "register", "user", user.id)
    db.commit()
    db.refresh(user)
    return _token_response(user)


@router.post("/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user is None or not verify_password(body.password, user.password_hash) or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    audit(db, user, "login", "user", user.id)
    db.commit()
    return _token_response(user)


@router.post("/auth/token", include_in_schema=False)
def token(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """OAuth2 password flow so the Swagger UI 'Authorize' button works."""
    return login(LoginIn(email=form.username, password=form.password), db)


@router.get("/auth/me")
def me(user: User = Depends(get_current_user)):
    return S.user(user)


@router.patch("/auth/me")
def update_me(body: ProfileUpdateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return S.user(user)


@router.post("/users", status_code=201)
def create_user(body: StaffCreateIn, admin: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.email == body.email.lower())):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(email=body.email.lower(), password_hash=hash_password(body.password), full_name=body.full_name,
                role=body.role, phone=body.phone, region_id=body.region_id, language=body.language,
                covered_region_ids=body.covered_region_ids)
    db.add(user)
    db.flush()
    audit(db, admin, "create_user", "user", user.id, role=body.role)
    db.commit()
    db.refresh(user)
    return S.user(user)


@router.get("/users")
def list_users(role: str | None = None, region_id: int | None = None,
               _: User = Depends(require_roles("officer", "doctor", "admin", "kader")), db: Session = Depends(get_db)):
    q = select(User).where(User.is_active.is_(True))
    if role:
        q = q.where(User.role == role)
    if region_id:
        q = q.where(User.region_id == region_id)
    return [S.user(u) for u in db.scalars(q.order_by(User.full_name)).all()]


@router.get("/regions", tags=["reference"])
def regions(db: Session = Depends(get_db)):
    return [S.region(r) for r in db.scalars(select(Region).order_by(Region.district, Region.name)).all()]
