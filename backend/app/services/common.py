from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import AuditLog, Consent, Notification, User


def audit(db: Session, user: User | None, action: str, entity: str, entity_id: int | None = None, **detail) -> None:
    db.add(AuditLog(user_id=user.id if user else None, action=action, entity=entity, entity_id=entity_id, detail=detail))


def notify(db: Session, user_id: int, kind: str, title: str, body: str, **data) -> None:
    db.add(Notification(user_id=user_id, kind=kind, title=title, body=body, data=data))


def has_consent(db: Session, user_id: int, scope: str) -> bool:
    """Latest consent record for the caregiver and scope; absent means not granted."""
    c = db.scalar(select(Consent).where(Consent.user_id == user_id, Consent.scope == scope, Consent.child_id.is_(None))
                  .order_by(Consent.id.desc()))
    return bool(c and c.granted)


def notify_roles(db: Session, roles: list[str], region_id: int | None, kind: str, title: str, body: str, **data) -> None:
    """Notify staff with the given roles. Officers/doctors/admins see all regions; Kaders only their own."""
    users = db.scalars(select(User).where(User.role.in_(roles), User.is_active.is_(True))).all()
    for u in users:
        if u.role == "kader" and region_id is not None and region_id not in u.coverage():
            continue
        notify(db, u.id, kind, title, body, **data)
