from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import serializers as S
from ..ai.triage import SUPPLY_CATALOG
from ..database import get_db
from ..deps import OVERSIGHT, STAFF, can_access_child, get_child, get_current_user, lang_of, require_roles
from ..models import Locker, SupplyRequest, User
from ..schemas import ApproveIn, PickupIn, RejectIn, RestockIn, SupplyRequestIn
from ..services import logistics
from ..services.common import audit, notify
from ..services.throttle import FailureLimiter

router = APIRouter(prefix="/api", tags=["N.E.X.U.S. logistics"])

# Wrong pickup codes per person and locker: 10 in 15 minutes, so the 6-digit codes cannot be guessed by trying them all.
PICKUP_LIMIT = FailureLimiter(max_failures=10, window_seconds=15 * 60)


@router.get("/logistics/catalog")
def catalog(lang: str = "id"):
    L = lang if lang in ("id", "en") else "en"
    return [{"item_key": k, "name": v["name"][L], "weight_kg": v["weight_kg"], "needs_doctor": v["needs_doctor"]}
            for k, v in SUPPLY_CATALOG.items()]


@router.get("/lockers")
def list_lockers(kind: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    logistics.tick(db)
    q = select(Locker)
    if kind:
        q = q.where(Locker.kind == kind)
    return [S.locker(lk, lang_of(user)) for lk in db.scalars(q.order_by(Locker.kind, Locker.name)).all()]


@router.get("/lockers/{locker_id}")
def get_locker(locker_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    lk = db.get(Locker, locker_id)
    if lk is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Locker not found")
    return S.locker(lk, lang_of(user))


@router.post("/lockers/{locker_id}/restock")
def restock(locker_id: int, body: RestockIn, user: User = Depends(require_roles(*OVERSIGHT)), db: Session = Depends(get_db)):
    lk = db.get(Locker, locker_id)
    if lk is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Locker not found")
    try:
        logistics.restock(db, lk, body.item_key, body.quantity, user)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    db.refresh(lk)
    return S.locker(lk, lang_of(user))


@router.post("/lockers/by-code/{locker_code}/pickup")
def pickup(locker_code: str, body: PickupIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Called by the locker kiosk (or the Kader's phone at the locker) after scanning the caregiver's QR or code."""
    if not body.pickup_code and not body.qr_payload:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Provide a pickup code or QR payload")
    key = f"{user.id}:{locker_code}"
    if PICKUP_LIMIT.blocked(key):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            {"id": "Terlalu banyak kode salah. Coba lagi dalam 15 menit.",
                             "en": "Too many wrong codes. Try again in 15 minutes."}[lang_of(user)], headers={"Retry-After": "900"})
    logistics.tick(db)
    try:
        req = logistics.verify_pickup(db, locker_code, body.pickup_code, body.qr_payload, user, lang_of(user))
    except LookupError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))
    except logistics.CodeMismatch as e:
        PICKUP_LIMIT.fail(key)
        audit(db, user, "locker_pickup_failed", "locker", None, locker=locker_code)
        db.commit()
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(e))
    except PermissionError as e:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(e))
    notify(db, req.child.caregiver_id, "picked_up", {"id": "Paket diambil", "en": "Package collected"},
           {"id": f"Paket untuk {req.child.name} telah diambil dari loker {locker_code}.",
            "en": f"The package for {req.child.name} was collected from locker {locker_code}."}, supply_request_id=req.id)
    db.commit()
    return {"ok": True, "supply_request": S.supply_request(req, lang_of(user), include_code=False)}


def _visible_requests(db: Session, user: User):
    q = select(SupplyRequest).order_by(SupplyRequest.id.desc())
    rows = db.scalars(q).all()
    return [r for r in rows if can_access_child(user, r.child)]


@router.get("/supply-requests")
def list_supply_requests(status_filter: str | None = None, child_id: int | None = None, user: User = Depends(get_current_user),
                         db: Session = Depends(get_db)):
    logistics.tick(db)
    rows = _visible_requests(db, user)
    if status_filter:
        wanted = set(status_filter.split(","))
        rows = [r for r in rows if r.status in wanted]
    if child_id:
        rows = [r for r in rows if r.child_id == child_id]
    # Pickup codes are only shown to the caregiver who collects the package.
    return [S.supply_request(r, lang_of(user), include_code=user.role == "caregiver") for r in rows]


@router.post("/supply-requests", status_code=201)
def create_supply_request(body: SupplyRequestIn, user: User = Depends(require_roles(*STAFF)), db: Session = Depends(get_db)):
    child = get_child(body.child_id, db, user)
    for it in body.items:
        try:
            ok = it.get("item_key") in SUPPLY_CATALOG and 0 < int(it.get("quantity", 0)) <= 100
        except (TypeError, ValueError):
            ok = False
        if not ok:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid item {it}")
    req = SupplyRequest(child_id=child.id, requested_by_id=user.id, urgency=body.urgency, status="pending_approval",
                        items=[{"item_key": i["item_key"], "quantity": int(i["quantity"])} for i in body.items])
    db.add(req)
    db.flush()
    audit(db, user, "create_supply_request", "supply_request", req.id)
    db.commit()
    db.refresh(req)
    return S.supply_request(req, lang_of(user), include_code=False)


def _request_or_404(db: Session, request_id: int, user: User) -> SupplyRequest:
    req = db.get(SupplyRequest, request_id)
    if req is None or not can_access_child(user, req.child):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Supply request not found")
    return req


@router.get("/supply-requests/{request_id}/plan")
def preview_plan(request_id: int, user: User = Depends(require_roles(*STAFF)), db: Session = Depends(get_db)):
    """Decision support: every pathway (stock in a nearby locker, or road delivery from a hub) with ETA and constraints."""
    req = _request_or_404(db, request_id, user)
    try:
        return logistics.plan(db, req)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))


@router.post("/supply-requests/{request_id}/approve")
def approve(request_id: int, body: ApproveIn = Body(default=ApproveIn()), user: User = Depends(require_roles(*STAFF)),
            db: Session = Depends(get_db)):
    req = _request_or_404(db, request_id, user)
    try:
        logistics.approve(db, req, user, body.option_index)
    except PermissionError as e:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(e))
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    db.commit()
    db.refresh(req)
    return S.supply_request(req, lang_of(user), include_code=False)


@router.post("/supply-requests/{request_id}/reject")
def reject(request_id: int, body: RejectIn, user: User = Depends(require_roles(*STAFF)), db: Session = Depends(get_db)):
    req = _request_or_404(db, request_id, user)
    if req.status not in ("pending_approval", "awaiting_stock"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Request is {req.status}")
    req.status = "rejected"
    req.decision = {**(req.decision or {}), "rejected_reason": body.reason}
    audit(db, user, "reject_supply", "supply_request", req.id, reason=body.reason)
    db.commit()
    return S.supply_request(req, lang_of(user), include_code=False)


@router.post("/logistics/simulate")
def simulate(minutes: float = 0, user: User = Depends(require_roles(*OVERSIGHT)), db: Session = Depends(get_db)):
    """Fast-forward the road-delivery simulation (demo and evaluation of simulated response time)."""
    if not 0 <= minutes <= 7 * 24 * 60:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "minutes must be between 0 and 10080")
    # Shift in-flight timestamps back so the fast-forward persists.
    from datetime import timedelta

    delta = timedelta(minutes=minutes)
    for r in db.scalars(select(SupplyRequest).where(SupplyRequest.status == "in_transit")).all():
        r.approved_at = r.approved_at - delta if r.approved_at else None
    db.commit()
    result = logistics.tick(db)
    audit(db, user, "simulate", "logistics", None, minutes=minutes, **result)
    db.commit()
    return result


@router.get("/logistics/restock-alerts")
def restock_alerts(user: User = Depends(require_roles(*STAFF)), db: Session = Depends(get_db)):
    return logistics.restock_alerts(db)
