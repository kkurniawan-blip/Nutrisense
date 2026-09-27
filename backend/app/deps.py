"""Authentication and role-based access control (RBAC) dependencies."""
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt import PyJWTError
from sqlalchemy.orm import Session

from .database import get_db
from .models import Child, User
from .security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")

STAFF = ("kader", "officer", "doctor", "admin")
OVERSIGHT = ("officer", "doctor", "admin")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    try:
        payload = decode_access_token(token)
        user = db.get(User, int(payload["sub"]))
    except (PyJWTError, KeyError, ValueError):
        user = None
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token", headers={"WWW-Authenticate": "Bearer"})
    return user


def require_roles(*roles: str):
    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires role: {', '.join(roles)}")
        return user

    return checker


def can_access_child(user: User, child: Child) -> bool:
    if user.role in OVERSIGHT:
        return True
    if user.role == "caregiver":
        return child.caregiver_id == user.id
    if user.role == "kader":
        return child.kader_id == user.id or child.region_id in user.coverage()
    return False


def get_child(child_id: int, db: Session, user: User) -> Child:
    child = db.get(Child, child_id)
    if child is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Child not found")
    if not can_access_child(user, child):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to this child")
    return child


def lang_of(user: User, override: str | None = None) -> str:
    lang = override or user.language or "id"
    return lang if lang in ("id", "en") else "en"
