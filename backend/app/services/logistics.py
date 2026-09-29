"""N.E.X.U.S. logistics layer: smart-locker inventory, supply decisions and simulated drone dispatch.

checkStock() and simulateRoute() from the class diagram live here. Drone flights are simulated:
a flight "lands" once its ETA has elapsed, which `tick()` evaluates whenever logistics data is read
(or when an officer fast-forwards the simulation from the dashboard).
"""
from __future__ import annotations

import hashlib
import math
import secrets
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..ai.triage import SUPPLY_CATALOG
from ..config import get_settings
from ..models import Child, Drone, DroneDispatch, InventoryItem, Locker, Region, SupplyRequest, User
from ..security import sign_payload
from .common import audit, notify, notify_roles

settings = get_settings()

LOCKER_MAX_TRAVEL_KM = 12.0  # a caregiver can reasonably reach this locker by foot / ojek
PICKUP_VALID_DAYS = 3
CHARGE_MINUTES = 30
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


def weather_risk(region_id: int | None, on: date | None = None) -> float:
    """Deterministic simulated weather risk (0 calm .. 1 storm) per region per day."""
    seed = f"{region_id}:{(on or date.today()).isoformat()}".encode()
    return round(int(hashlib.sha256(seed).hexdigest()[:4], 16) / 0xFFFF * 0.7, 2)


def available(inv: InventoryItem) -> int:
    return inv.quantity - inv.reserved


def _inventory(locker: Locker) -> dict[str, InventoryItem]:
    return {i.item_key: i for i in locker.inventory}


def check_stock(locker: Locker, items: list[dict]) -> bool:
    inv = _inventory(locker)
    return all(k["item_key"] in inv and available(inv[k["item_key"]]) >= k["quantity"] for k in items)


def payload_kg(items: list[dict]) -> float:
    return round(sum(SUPPLY_CATALOG.get(i["item_key"], {}).get("weight_kg", 0.2) * i["quantity"] for i in items), 2)


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
    w = weather_risk(region.id if region else None)
    kg = payload_kg(req.items)
    if destination is not None:
        for hub in hubs:
            dist = haversine_km(hub.lat, hub.lng, destination.lat, destination.lng)
            hub_ok = check_stock(hub, req.items)
            drones = db.scalars(select(Drone).where(Drone.hub_id == hub.id)).all()
            needed = dist * 2 * settings.drone_battery_pct_per_km
            best = None
            for dr in drones:
                if dr.status != "idle" or dr.payload_kg < kg or dist * 2 > dr.max_range_km:
                    continue
                if dr.battery_pct - needed < settings.drone_reserve_battery_pct:
                    continue
                if best is None or dr.battery_pct > best.battery_pct:
                    best = dr
            reason = "ok"
            if not hub_ok:
                reason = "hub_out_of_stock"
            elif w > 0.5:
                reason = "weather_unsafe"
            elif best is None:
                reason = "no_drone_available_or_out_of_range"
            options.append({
                "type": "drone", "hub_id": hub.id, "hub_name": hub.name, "drone_id": best.id if best else None,
                "drone_code": best.code if best else None, "locker_id": destination.id, "locker_code": destination.code,
                "locker_name": destination.name, "distance_km": round(dist, 1), "payload_kg": kg,
                "battery_needed_pct": round(needed, 1), "weather_risk": w,
                "eta_minutes": round(dist / settings.drone_cruise_speed_kmh * 60 + 5, 1),
                "feasible": reason == "ok", "reason": reason,
            })
            difficulty = region.transport_difficulty if region else 1
            options.append({
                "type": "courier", "hub_id": hub.id, "hub_name": hub.name, "locker_id": destination.id,
                "locker_code": destination.code, "locker_name": destination.name, "distance_km": round(dist, 1),
                "eta_minutes": round(dist * 1.4 / (COURIER_SPEED_KMH / difficulty) * 60 + 30, 1),
                "feasible": hub_ok, "reason": "ok" if hub_ok else "hub_out_of_stock",
            })

    feasible = [o for o in options if o["feasible"]]
    urgent = req.urgency in ("doctor_48h", "emergency")
    chosen = None
    if feasible:
        local = [o for o in feasible if o["type"] == "locker_stock"]
        if local:
            chosen = min(local, key=lambda o: o["distance_to_family_km"])  # no transport needed
        else:
            flying = [o for o in feasible if o["type"] == "drone"]
            ground = [o for o in feasible if o["type"] == "courier"]
            fastest = min(feasible, key=lambda o: o["eta_minutes"])
            # Drones are reserved for urgent cases or when the road trip is long (> 2 h).
            if flying and (urgent or (ground and min(g["eta_minutes"] for g in ground) > 120) or not ground):
                chosen = min(flying, key=lambda o: o["eta_minutes"])
            else:
                chosen = min(ground, key=lambda o: o["eta_minutes"]) if ground else fastest
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
        if chosen["type"] == "drone":
            drone = db.get(Drone, chosen["drone_id"])
            drone.status = "in_flight"
            dst = db.get(Locker, chosen["locker_id"])
            db.add(DroneDispatch(
                supply_request_id=req.id, drone_id=drone.id, origin_id=hub.id, destination_id=dst.id,
                distance_km=chosen["distance_km"], eta_minutes=chosen["eta_minutes"],
                battery_needed_pct=chosen["battery_needed_pct"], weather_risk=chosen["weather_risk"],
                payload_kg=chosen["payload_kg"], status="launched", launched_at=_now(),
                route=[[hub.lat, hub.lng], [dst.lat, dst.lng]],
            ))
        notify(db, req.child.caregiver_id, "supply_in_transit", {"id": "Paket gizi sedang dikirim", "en": "Package on the way"},
               {"id": f"Perkiraan tiba ~{eta_text(chosen['eta_minutes'])} di {chosen['locker_name']}.",
                "en": f"Arrives in about {eta_text(chosen['eta_minutes'], 'en')} at {chosen['locker_name']}."}, supply_request_id=req.id)
    audit(db, approver, "approve_supply", "supply_request", req.id, fulfillment=chosen["type"], locker=chosen.get("locker_code"))
    return req


def tick(db: Session, fast_forward_minutes: float = 0) -> dict:
    """Advance the simulation: land drones whose ETA passed, deliver couriers, recharge drones."""
    now = _now() + timedelta(minutes=fast_forward_minutes)
    landed, delivered, recharged = 0, 0, 0

    for dsp in db.scalars(select(DroneDispatch).where(DroneDispatch.status.in_(["launched", "delivered"]))).all():
        launched = _aware(dsp.launched_at)
        if dsp.status == "launched" and launched + timedelta(minutes=dsp.eta_minutes) <= now:
            req = db.get(SupplyRequest, dsp.supply_request_id)
            _move_stock(db, db.get(Locker, dsp.origin_id), db.get(Locker, dsp.destination_id), req.items)
            dsp.status, dsp.delivered_at = "delivered", launched + timedelta(minutes=dsp.eta_minutes)
            _issue_pickup(req)
            _notify_ready(db, req)
            landed += 1
        if dsp.status == "delivered" and _aware(dsp.delivered_at) + timedelta(minutes=dsp.eta_minutes) <= now:
            dsp.status = "returned"
            drone = dsp.drone
            drone.battery_pct = max(0.0, round(drone.battery_pct - dsp.battery_needed_pct, 1))
            drone.status = "charging"

    for req in db.scalars(select(SupplyRequest).where(SupplyRequest.status == "in_transit", SupplyRequest.fulfillment == "courier")).all():
        eta = req.decision.get("chosen", {}).get("eta_minutes", 60)
        if _aware(req.approved_at) + timedelta(minutes=eta) <= now:
            chosen = req.decision["chosen"]
            _move_stock(db, db.get(Locker, chosen["hub_id"]), db.get(Locker, chosen["locker_id"]), req.items)
            _issue_pickup(req)
            _notify_ready(db, req)
            delivered += 1

    for drone in db.scalars(select(Drone).where(Drone.status == "charging")).all():
        last = db.scalar(select(DroneDispatch).where(DroneDispatch.drone_id == drone.id).order_by(DroneDispatch.id.desc()))
        returned_at = _aware(last.delivered_at) + timedelta(minutes=last.eta_minutes) if last and last.delivered_at else now
        if returned_at + timedelta(minutes=CHARGE_MINUTES) <= now:
            drone.battery_pct, drone.status = 100.0, "idle"
            recharged += 1

    for req in db.scalars(select(SupplyRequest).where(SupplyRequest.status == "ready_for_pickup")).all():
        if _aware(req.expires_at) and _aware(req.expires_at) < now:
            inv = _inventory(req.locker)
            for it in req.items:
                inv[it["item_key"]].reserved -= it["quantity"]
            req.status = "expired"
            notify(db, req.child.caregiver_id, "pickup_expired", {"id": "Kode kedaluwarsa", "en": "Pickup expired"},
                   {"id": "Hubungi Kader untuk menjadwalkan ulang.", "en": "Contact your Kader to reschedule."}, supply_request_id=req.id)
    db.commit()
    return {"drones_landed": landed, "couriers_delivered": delivered, "drones_recharged": recharged}


def verify_pickup(db: Session, locker_code: str, pickup_code: str | None, qr_payload: str | None, actor: User | None) -> SupplyRequest:
    locker = db.scalar(select(Locker).where(Locker.code == locker_code))
    if locker is None:
        raise LookupError("Unknown locker")
    if qr_payload:
        try:
            _, rid, code, sig = qr_payload.split(":")
        except ValueError:
            raise PermissionError("Malformed QR code")
        if sign_payload(f"{rid}:{code}") != sig:
            raise PermissionError("QR signature invalid")
        pickup_code = code
        req = db.get(SupplyRequest, int(rid))
    else:
        req = db.scalar(select(SupplyRequest).where(SupplyRequest.locker_id == locker.id, SupplyRequest.pickup_code == pickup_code,
                                                    SupplyRequest.status == "ready_for_pickup"))
    if req is None or req.locker_id != locker.id or req.pickup_code != pickup_code:
        raise PermissionError("Invalid pickup code for this locker")
    if req.status != "ready_for_pickup":
        raise PermissionError(f"Package is {req.status}")
    if _aware(req.expires_at) < _now():
        raise PermissionError("Pickup code expired")

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
