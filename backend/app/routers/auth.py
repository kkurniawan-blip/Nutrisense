import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import serializers as S
from ..database import get_db
from ..deps import get_current_user, require_roles
from ..models import Consent, Region, User
from ..schemas import LoginIn, PasswordChangeIn, ProfileUpdateIn, RegisterIn, StaffAreaIn, StaffCreateIn
from ..security import create_access_token, hash_password, verify_password
from ..services.common import audit, find_by_phone, normalize_phone
from ..services.throttle import FailureLimiter

router = APIRouter(prefix="/api", tags=["auth & users"])

# 5 wrong passwords lock the account for 15 minutes. The per-address limit is higher because a whole posyandu (or a
# proxy in front of the API) can share one address.
ACCOUNT_LIMIT = FailureLimiter(max_failures=5, window_seconds=15 * 60)
IP_LIMIT = FailureLimiter(max_failures=30, window_seconds=15 * 60)
# Checked when the account does not exist, so a wrong email takes as long as a wrong password.
_DUMMY_HASH = hash_password(secrets.token_hex(16))
_LOCKED = {"id": "Terlalu banyak percobaan masuk yang salah. Coba lagi dalam 15 menit.",
           "en": "Too many failed sign-in attempts. Try again in 15 minutes."}


def _token_response(user: User) -> dict:
    return {"access_token": create_access_token(user.id, user.role, user.token_version or 0), "token_type": "bearer",
            "user": S.user(user)}


def _check_regions(db: Session, ids) -> None:
    if any(i is not None and db.get(Region, i) is None for i in ids):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown region")


@router.post("/auth/register", status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    """Caregiver self-registration. Consent to data processing is mandatory (privacy by design)."""
    if not body.consent_data_processing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Consent to data processing is required to use NutriSense")
    phone = normalize_phone(body.phone)
    if not body.email and not phone:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Give an email or a phone number")
    if body.email and db.scalar(select(User).where(User.email == body.email.lower())):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    if phone and find_by_phone(db, phone):
        raise HTTPException(status.HTTP_409_CONFLICT, "Phone number already registered")
    if body.region_id is not None and db.get(Region, body.region_id) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown region")
    user = User(email=body.email.lower() if body.email else None, password_hash=hash_password(body.password), full_name=body.full_name,
                phone=phone, role="caregiver", region_id=body.region_id, language=body.language if body.language in ("id", "en") else "id")
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
def login(body: LoginIn, request: Request, lang: str | None = None, db: Session = Depends(get_db)):
    """Log in with an email or a phone number (many mothers in NTT have a phone but no email)."""
    ident = (body.phone or body.email or "").strip()
    if not ident:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Give an email or a phone number")
    by_email = "@" in ident
    account_key = ident.lower() if by_email else f"tel:{normalize_phone(ident)}"
    ip_key = request.client.host if request.client else "unknown"
    if ACCOUNT_LIMIT.blocked(account_key) or IP_LIMIT.blocked(ip_key):
        audit(db, None, "login_blocked", "user", None)
        db.commit()
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, _LOCKED["en" if lang == "en" else "id"], headers={"Retry-After": "900"})
    user = db.scalar(select(User).where(User.email == ident.lower())) if by_email else find_by_phone(db, ident)
    ok = verify_password(body.password, user.password_hash if user else _DUMMY_HASH) and user is not None and user.is_active
    if not ok:
        ACCOUNT_LIMIT.fail(account_key)
        IP_LIMIT.fail(ip_key)
        # No email, phone or password in the log: only which account (if any) was tried.
        audit(db, None, "login_failed", "user", user.id if user else None, known_account=user is not None)
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email/phone or password")
    ACCOUNT_LIMIT.reset(account_key)
    audit(db, user, "login", "user", user.id)
    db.commit()
    return _token_response(user)


@router.post("/auth/token", include_in_schema=False)
def token(request: Request, form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """OAuth2 password flow so the Swagger UI 'Authorize' button works."""
    if len(form.password) > 128:
        raise HTTPException(422, "Password is too long")
    return login(LoginIn(email=form.username, password=form.password), request, None, db)


@router.post("/auth/logout", status_code=204)
def logout(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Sign out: every token issued so far for this account stops working (on all devices)."""
    user.token_version = (user.token_version or 0) + 1
    audit(db, user, "logout", "user", user.id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/auth/me")
def me(user: User = Depends(get_current_user)):
    return S.user(user)


@router.patch("/auth/me")
def update_me(body: ProfileUpdateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    # A staff member's region is their access area, so only an admin changes it (PATCH /api/users/{id}).
    # The app sends the unchanged region with every profile save, so that is accepted and ignored.
    if "region_id" in data and user.role != "caregiver":
        if data["region_id"] != user.region_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only an admin can change a health worker's area")
        del data["region_id"]
    if data.get("region_id") is not None and db.get(Region, data["region_id"]) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown region")
    if "full_name" in data and not data["full_name"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Name is required")
    if "phone" in data:
        data["phone"] = normalize_phone(data["phone"])
        other = find_by_phone(db, data["phone"])
        if other is not None and other.id != user.id:
            raise HTTPException(status.HTTP_409_CONFLICT, "Phone number already registered")
        if data["phone"] is None and not user.email:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Keep a phone number: it is how you log in")
    for field, value in data.items():
        setattr(user, field, value)
    audit(db, user, "update_profile", "user", user.id, fields=sorted(data))
    db.commit()
    db.refresh(user)
    return S.user(user)


@router.post("/auth/change-password")
def change_password(body: PasswordChangeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Change your own password. The current password is required so a borrowed, unlocked phone can't take over an account."""
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    if body.current_password == body.new_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The new password must be different")
    user.password_hash = hash_password(body.new_password)
    # Sign out every other device that knew the old password; this device gets a fresh token.
    user.token_version = (user.token_version or 0) + 1
    audit(db, user, "change_password", "user", user.id)
    db.commit()
    return {"ok": True, **_token_response(user)}


@router.post("/users", status_code=201)
def create_user(body: StaffCreateIn, admin: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.email == body.email.lower())):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    _check_regions(db, [body.region_id, *body.covered_region_ids])
    user = User(email=body.email.lower(), password_hash=hash_password(body.password), full_name=body.full_name,
                role=body.role, phone=body.phone, region_id=body.region_id, language=body.language,
                covered_region_ids=body.covered_region_ids)
    db.add(user)
    db.flush()
    audit(db, admin, "create_user", "user", user.id, role=body.role)
    db.commit()
    db.refresh(user)
    return S.user(user)


@router.patch("/users/{user_id}")
def update_staff_area(user_id: int, body: StaffAreaIn, admin: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    """Change a health worker's area. Staff cannot do this on their own profile (PATCH /api/auth/me)."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    data = body.model_dump(exclude_unset=True)
    if data.get("covered_region_ids") is None:
        data.pop("covered_region_ids", None)
    _check_regions(db, [data.get("region_id"), *data.get("covered_region_ids", [])])
    for field, value in data.items():
        setattr(user, field, value)
    audit(db, admin, "update_user_area", "user", user.id, **data)
    db.commit()
    db.refresh(user)
    return S.user(user)


@router.get("/users")
def list_users(role: str | None = None, region_id: int | None = None,
               me: User = Depends(require_roles("officer", "doctor", "admin", "kader")), db: Session = Depends(get_db)):
    q = select(User).where(User.is_active.is_(True))
    if role:
        q = q.where(User.role == role)
    if region_id:
        q = q.where(User.region_id == region_id)
    users = db.scalars(q.order_by(User.full_name)).all()
    if me.role != "kader":
        return [S.user(u) for u in users]
    # A Kader sees the health team and the mothers in their own villages, without contact details.
    area = me.coverage()
    return [{**S.user(u), "email": None, "phone": None} for u in users if u.role != "caregiver" or u.region_id in area]


@router.get("/regions", tags=["reference"])
def regions(db: Session = Depends(get_db)):
    return [S.region(r) for r in db.scalars(select(Region).order_by(Region.district, Region.name)).all()]
