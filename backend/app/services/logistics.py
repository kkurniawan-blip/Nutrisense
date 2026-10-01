"""N.E.X.U.S. logistics layer: smart-locker inventory, supply decisions and simulated road delivery.

checkStock() and simulateRoute() from the class diagram live here. A package comes from the nearest
stocked locker, or by road (courier) from a supply hub to the family's locker. Road trips are
simulated: a package arrives once its ETA has elapsed, which `tick()` evaluates whenever logistics
data is read (or when an officer fast-forwards the simulation from the dashboard).
"""
from __future__ import annotations

import math
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..ai.triage import SUPPLY_CATALOG
from ..models import Child, InventoryItem, Locker, Region, SupplyRequest, User
from ..security import sign_payload
from .common import audit, notify, notify_roles

LOCKER_MAX_TRAVEL_KM = 12.0  # a caregiver can reasonably reach this locker by foot / ojek
PICKUP_VALID_DAYS = 3
COURIER_SPEED_KMH = 30.0


def eta_text(minutes: float, lang: str = "id") -> str:
    """"45 menit" or "12 jam 35 menit": long trips read as hours, not hundreds of minutes."""
    m = max(0, round(minutes))
    h_word, m_word = ("jam", "menit") if lang == "id" else ("h", "min")
    if m < 90:
        return f"{m} {m_word}"
    h, rest = divmod(m, 60)
    return f"{h} {h_word} {rest} {m_word}" if rest else f"{h} {h_word}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def available(inv: InventoryItem) -> int:
    return inv.quantity - inv.reserved


def _inventory(locker: Locker) -> dict[str, InventoryItem]:
    return {i.item_key: i for i in locker.inventory}


def check_stock(locker: Locker, items: list[dict]) -> bool:
    inv = _inventory(locker)
    return all(k["item_key"] in inv and available(inv[k["item_key"]]) >= k["quantity"] for k in items)


def _child_location(child: Child) -> tuple[float, float, Region | None]:
    region = child.region or child.caregiver.region
    if region is None:
        raise ValueError("Child has no region; cannot plan logistics")
    return region.lat, region.lng, region


def plan(db: Session, req: SupplyRequest) -> dict:
    """Evaluate every feasible supply pathway and pick one (simulateRoute)."""
    lat, lng, region = _child_location(req.child)
    lockers = db.scalars(select(Locker).where(Locker.kind == "locker", Locker.status == "online")).all()
    hubs = db.scalars(select(Locker).where(Locker.kind == "hub", Locker.status == "online")).all()
    options: list[dict] = []

    by_distance = sorted(lockers, key=lambda lk: haversine_km(lat, lng, lk.lat, lk.lng))
    for lk in by_distance[:5]:
        d = haversine_km(lat, lng, lk.lat, lk.lng)
        stocked = check_stock(lk, req.items)
        options.append({
            "type": "locker_stock", "locker_id": lk.id, "locker_code": lk.code, "locker_name": lk.name,
            "distance_to_family_km": round(d, 1), "eta_minutes": 0,
            "feasible": stocked and d <= LOCKER_MAX_TRAVEL_KM,
            "reason": "insufficient_stock" if not stocked else ("in_stock" if d <= LOCKER_MAX_TRAVEL_KM else "too_far_for_family"),
        })

    destination = by_distance[0] if by_distance else None
    if destination is not None:
        difficulty = region.transport_difficulty if region else 1
        for hub in hubs:
            dist = haversine_km(hub.lat, hub.lng, destination.lat, destination.lng)
            hub_ok = check_stock(hub, req.items)
            options.append({
                "type": "courier", "hub_id": hub.id, "hub_name": hub.name, "locker_id": destination.id,
                "locker_code": destination.code, "locker_name": destination.name, "distance_km": round(dist, 1),
                "eta_minutes": round(dist * 1.4 / (COURIER_SPEED_KMH / difficulty) * 60 + 30, 1),
                "feasible": hub_ok, "reason": "ok" if hub_ok else "hub_out_of_stock",
            })

    feasible = [o for o in options if o["feasible"]]
    urgent = req.urgency in ("doctor_48h", "emergency")
    local = [o for o in feasible if o["type"] == "locker_stock"]
    road = [o for o in feasible if o["type"] == "courier"]
    # A stocked locker near the family needs no transport; otherwise the fastest road trip from a hub.
    chosen = min(local, key=lambda o: o["distance_to_family_km"]) if local else (min(road, key=lambda o: o["eta_minutes"]) if road else None)
    return {"chosen": chosen, "options": options, "evaluated_at": _now().isoformat(), "urgent": urgent}


def _issue_pickup(req: SupplyRequest) -> None:
    code = f"{secrets.randbelow(10**6):06d}"
    req.pickup_code = code
    req.qr_payload = f"NEXUS:{req.id}:{code}:{sign_payload(f'{req.id}:{code}')}"
    req.status = "ready_for_pickup"
    req.ready_at = _now()
    req.expires_at = _now() + timedelta(days=PICKUP_VALID_DAYS)


def _move_stock(db: Session, src: Locker, dst: Locker, items: list[dict]) -> None:
    src_inv, dst_inv = _inventory(src), _inventory(dst)
    for it in items:
        s = src_inv[it["item_key"]]
        s.quantity -= it["quantity"]
        s.reserved -= it["quantity"]
        d = dst_inv.get(it["item_key"])
        if d is None:
            d = InventoryItem(locker=dst, item_key=it["item_key"], quantity=0, reserved=0)
            db.add(d)
        d.quantity += it["quantity"]
        d.reserved += it["quantity"]


def _notify_ready(db: Session, req: SupplyRequest) -> None:
    locker = req.locker
    notify(db, req.child.caregiver_id, "pickup_ready",
           {"id": "Paket gizi siap diambil", "en": "Nutrition package ready"},
           {"id": f"{locker.name} ({locker.code}). Kode: {req.pickup_code}. Berlaku {PICKUP_VALID_DAYS} hari.",
            "en": f"{locker.name} ({locker.code}). Code: {req.pickup_code}. Valid for {PICKUP_VALID_DAYS} days."},
           supply_request_id=req.id, locker_code=locker.code)


def approve(db: Session, req: SupplyRequest, approver: User, override_option: int | None = None) -> SupplyRequest:
    if req.status not in ("pending_approval", "awaiting_stock"):
        raise ValueError(f"Request is {req.status}; only pending requests can be approved")
    needs_doctor = any(SUPPLY_CATALOG.get(i["item_key"], {}).get("needs_doctor") for i in req.items)
    if needs_doctor and approver.role not in ("doctor", "admin"):
        raise PermissionError("This package contains items that require a doctor's approval")

    decision = plan(db, req)
    chosen = decision["chosen"]
    if override_option is not None:
        opts = decision["options"]
        if not (0 <= override_option < len(opts)) or not opts[override_option]["feasible"]:
            raise ValueError("Selected logistics option is not feasible")
        chosen = decision["chosen"] = opts[override_option]
    req.decision = decision
    req.approved_by_id, req.approved_at = approver.id, _now()

    if chosen is None:
        req.status = "awaiting_stock"
        notify_roles(db, ["officer", "admin"], None, "stock_shortage", {"id": "Stok tidak cukup", "en": "Stock shortage"},
                     {"id": f"Permintaan #{req.id} tidak bisa dipenuhi dari loker atau gudang mana pun.",
                      "en": f"Supply request #{req.id} cannot be fulfilled from any locker or hub."}, supply_request_id=req.id)
        audit(db, approver, "approve_supply", "supply_request", req.id, outcome="awaiting_stock")
        return req

    req.fulfillment = chosen["type"]
    req.locker = db.get(Locker, chosen["locker_id"])
    if chosen["type"] == "locker_stock":
        inv = _inventory(req.locker)
        for it in req.items:
            inv[it["item_key"]].reserved += it["quantity"]
        _issue_pickup(req)
        _notify_ready(db, req)
    else:
        hub = db.get(Locker, chosen["hub_id"])
        inv = _inventory(hub)
        for it in req.items:
            inv[it["item_key"]].reserved += it["quantity"]
        req.status = "in_transit"
        notify(db, req.child.caregiver_id, "supply_in_transit", {"id": "Paket gizi sedang dikirim", "en": "Package on the way"},
               {"id": f"Perkiraan tiba ~{eta_text(chosen['eta_minutes'])} di {chosen['locker_name']}.",
                "en": f"Arrives in about {eta_text(chosen['eta_minutes'], 'en')} at {chosen['locker_name']}."}, supply_request_id=req.id)
    audit(db, approver, "approve_supply", "supply_request", req.id, fulfillment=chosen["type"], locker=chosen.get("locker_code"))
    return req


def tick(db: Session, fast_forward_minutes: float = 0) -> dict:
    """Advance the simulation: deliver road trips whose ETA passed, expire uncollected packages."""
    now = _now() + timedelta(minutes=fast_forward_minutes)
    delivered = 0

    for req in db.scalars(select(SupplyRequest).where(SupplyRequest.status == "in_transit", SupplyRequest.fulfillment == "courier")).all():
        eta = req.decision.get("chosen", {}).get("eta_minutes", 60)
        if _aware(req.approved_at) + timedelta(minutes=eta) <= now:
            chosen = req.decision["chosen"]
            _move_stock(db, db.get(Locker, chosen["hub_id"]), db.get(Locker, chosen["locker_id"]), req.items)
            _issue_pickup(req)
            _notify_ready(db, req)
            delivered += 1

    for req in db.scalars(select(SupplyRequest).where(SupplyRequest.status == "ready_for_pickup")).all():
        if _aware(req.expires_at) and _aware(req.expires_at) < now:
            inv = _inventory(req.locker)
            for it in req.items:
                inv[it["item_key"]].reserved -= it["quantity"]
            req.status = "expired"
            notify(db, req.child.caregiver_id, "pickup_expired", {"id": "Kode kedaluwarsa", "en": "Pickup expired"},
                   {"id": "Hubungi Kader untuk menjadwalkan ulang.", "en": "Contact your Kader to reschedule."}, supply_request_id=req.id)
    db.commit()
    return {"couriers_delivered": delivered}


def verify_pickup(db: Session, locker_code: str, pickup_code: str | None, qr_payload: str | None, actor: User | None,
                  lang: str = "id") -> SupplyRequest:
    locker = db.scalar(select(Locker).where(Locker.code == locker_code))
    if locker is None:
        raise LookupError("Unknown locker")
    bad_qr = {"id": "QR tidak dikenali. Coba ketik 6 angka kodenya.", "en": "QR not recognised. Try typing the 6-digit code."}["id" if lang == "id" else "en"]
    if qr_payload:
        try:
            _, rid, code, sig = qr_payload.split(":")
        except ValueError:
            raise PermissionError(bad_qr)
        if sign_payload(f"{rid}:{code}") != sig:
            raise PermissionError(bad_qr)
        pickup_code = code
        req = db.get(SupplyRequest, int(rid))
    else:
        req = db.scalar(select(SupplyRequest).where(SupplyRequest.locker_id == locker.id, SupplyRequest.pickup_code == pickup_code,
                                                    SupplyRequest.status == "ready_for_pickup"))
    L = "id" if lang == "id" else "en"
    if req is None or req.locker_id != locker.id or req.pickup_code != pickup_code:
        # Tell the Kader where the package really is, rather than only "wrong code".
        elsewhere = req if req is not None and req.pickup_code == pickup_code else db.scalar(
            select(SupplyRequest).where(SupplyRequest.pickup_code == pickup_code, SupplyRequest.status == "ready_for_pickup"))
        if elsewhere is not None and elsewhere.locker is not None and elsewhere.locker_id != locker.id:
            name = elsewhere.locker.name
            raise PermissionError({"id": f"Kode ini untuk {name}, bukan loker ini.", "en": f"This code is for {name}, not this locker."}[L])
        raise PermissionError({"id": "Kode tidak cocok untuk loker ini. Periksa lagi 6 angkanya.",
                               "en": "This code does not match this locker. Check the 6 digits again."}[L])
    if req.status != "ready_for_pickup":
        done = req.status == "picked_up"
        raise PermissionError({"id": "Paket ini sudah diambil." if done else "Paket ini belum siap diambil.",
                               "en": "This package was already collected." if done else "This package is not ready yet."}[L])
    if _aware(req.expires_at) < _now():
        raise PermissionError({"id": "Kode sudah kedaluwarsa. Minta kode baru ke Kader.", "en": "This code has expired. Ask your Kader for a new one."}[L])

    inv = _inventory(locker)
    low = []
    for it in req.items:
        row = inv[it["item_key"]]
        row.quantity -= it["quantity"]
        row.reserved -= it["quantity"]
        if available(row) <= row.restock_threshold:
            low.append(it["item_key"])
    req.status, req.picked_up_at = "picked_up", _now()
    locker.last_heartbeat = _now()
    audit(db, actor, "locker_pickup", "supply_request", req.id, locker=locker.code)
    if low:
        notify_roles(db, ["officer", "admin"], locker.region_id, "restock_needed", {"id": "Restok diperlukan", "en": "Restock needed"},
                     {"id": f"{locker.name}: {', '.join(low)} di bawah batas minimum.", "en": f"{locker.name}: {', '.join(low)} below threshold."}, locker_id=locker.id, items=low)
    db.commit()
    return req


def restock(db: Session, locker: Locker, item_key: str, quantity: int, actor: User) -> InventoryItem:
    if item_key not in SUPPLY_CATALOG:
        raise ValueError("Unknown item")
    inv = _inventory(locker).get(item_key)
    if inv is None:
        inv = InventoryItem(locker=locker, item_key=item_key, quantity=0, reserved=0)
        db.add(inv)
    inv.quantity += quantity
    audit(db, actor, "restock", "locker", locker.id, item_key=item_key, quantity=quantity)
    db.commit()
    return inv


def restock_alerts(db: Session) -> list[dict]:
    out = []
    for inv in db.scalars(select(InventoryItem)).all():
        if available(inv) <= inv.restock_threshold:
            out.append({"locker_id": inv.locker_id, "locker_code": inv.locker.code, "locker_name": inv.locker.name,
                        "item_key": inv.item_key, "available": available(inv), "threshold": inv.restock_threshold})
    return out
