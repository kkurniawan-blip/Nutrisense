from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import AuditLog, Consent, Notification, User


def audit(db: Session, user: User | None, action: str, entity: str, entity_id: int | None = None, **detail) -> None:
    db.add(AuditLog(user_id=user.id if user else None, action=action, entity=entity, entity_id=entity_id, detail=detail))


Text = str | dict[str, str]


def _in_language(text: Text, lang: str) -> str:
    return text if isinstance(text, str) else text.get(lang) or text["id"]


def notify(db: Session, user_id: int, kind: str, title: Text, body: Text, **data) -> None:
    """Store a notification in the recipient's own language. title/body may be {"id": ..., "en": ...}."""
    user = db.get(User, user_id)
    lang = user.language if user and user.language in ("id", "en") else "id"
    db.add(Notification(user_id=user_id, kind=kind, title=_in_language(title, lang), body=_in_language(body, lang), data=data))


def has_consent(db: Session, user_id: int, scope: str) -> bool:
    """Latest consent record for the caregiver and scope; absent means not granted."""
    c = db.scalar(select(Consent).where(Consent.user_id == user_id, Consent.scope == scope, Consent.child_id.is_(None))
                  .order_by(Consent.id.desc()))
    return bool(c and c.granted)


def notify_roles(db: Session, roles: list[str], region_id: int | None, kind: str, title: Text, body: Text, **data) -> None:
    """Notify staff with the given roles. Officers/doctors/admins see all regions; Kaders only their own."""
    users = db.scalars(select(User).where(User.role.in_(roles), User.is_active.is_(True))).all()
    for u in users:
        if u.role == "kader" and region_id is not None and region_id not in u.coverage():
            continue
        notify(db, u.id, kind, title, body, **data)


def normalize_phone(phone: str | None) -> str | None:
    """Indonesian mobile numbers in one form: digits only, starting with 0 (+62 812... and 62812... become 0812...)."""
    if not phone:
        return None
    digits = "".join(ch for ch in phone if ch.isdigit())
    if digits.startswith("62"):
        digits = "0" + digits[2:]
    elif digits.startswith("8"):
        digits = "0" + digits
    return digits or None


def find_by_phone(db: Session, phone: str | None) -> User | None:
    """Stored numbers may be written differently (spaces, +62), so compare the normalised forms."""
    want = normalize_phone(phone)
    if not want:
        return None
    return next((u for u in db.scalars(select(User).where(User.phone.is_not(None)).order_by(User.id)).all()
                 if normalize_phone(u.phone) == want), None)
