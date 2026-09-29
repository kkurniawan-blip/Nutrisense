"""Local services for a village: the nearest Puskesmas (phone and distance), the ambulance number and the next posyandu day."""
from __future__ import annotations

from datetime import date, timedelta

from ..models import Region

AMBULANCE = "119"  # national emergency medical number (PSC 119)


def facility(region: Region | None) -> dict | None:
    if region is None:
        return None
    return {"name": region.puskesmas_name or f"Puskesmas {region.name}", "phone": region.puskesmas_phone,
            "distance_km": region.facility_km, "transport_difficulty": region.transport_difficulty, "ambulance": AMBULANCE}


def next_posyandu(region: Region | None, on: date | None = None) -> dict | None:
    """The next monthly posyandu day on or after `on` (days past the month's end fall on its last day)."""
    if region is None or not region.posyandu_day:
        return None
    on = on or date.today()

    def in_month(y: int, m: int) -> date:
        first_next = date(y + (m == 12), m % 12 + 1, 1)
        return min(date(y, m, 1) + timedelta(days=region.posyandu_day - 1), first_next - timedelta(days=1))

    d = in_month(on.year, on.month)
    if d < on:
        d = in_month(on.year + (on.month == 12), on.month % 12 + 1)
    return {"date": d.isoformat(), "days": (d - on).days, "place": f"Posyandu {region.name.split(' (')[0]}"}
