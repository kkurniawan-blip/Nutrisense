"""Buku KIA for the child: immunisation / vitamin A / deworming schedule, the ASI eksklusif tracker (0-5 months),
and the family's local services (next posyandu, Puskesmas phone and distance, 119)."""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..ai import kia
from ..database import get_db
from ..deps import get_child, get_current_user
from ..models import BreastfeedingLog, Child, KiaRecord, Region, User
from ..schemas import AsiIn, KiaIn
from ..services.common import audit, notify
from ..services.local import facility, next_posyandu

router = APIRouter(prefix="/api", tags=["buku KIA"])

ASI_OTHER = {"water", "formula", "honey", "rice_water", "food", "other"}


def _given(db: Session, child_id: int) -> dict[str, date]:
    return {r.item_key: r.given_at for r in db.scalars(select(KiaRecord).where(KiaRecord.child_id == child_id)).all()}


@router.get("/children/{child_id}/kia")
def kia_schedule(child_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    child = get_child(child_id, db, user)
    return kia.schedule(child.birth_date, _given(db, child.id))


@router.post("/children/{child_id}/kia")
def kia_mark(child_id: int, body: KiaIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    child = get_child(child_id, db, user)
    if body.item_key not in kia.ALL_KEYS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown KIA item")
    on = body.given_at or date.today()
    if on > date.today() or on < child.birth_date:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Date must be between birth and today")
    r = db.scalar(select(KiaRecord).where(KiaRecord.child_id == child.id, KiaRecord.item_key == body.item_key))
    if r is None:
        db.add(KiaRecord(child_id=child.id, item_key=body.item_key, given_at=on, recorded_by_id=user.id))
    else:
        r.given_at = on
    audit(db, user, "kia_record", "child", child.id, item=body.item_key)
    db.commit()
    return kia.schedule(child.birth_date, _given(db, child.id))


@router.delete("/children/{child_id}/kia/{item_key}")
def kia_undo(child_id: int, item_key: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    child = get_child(child_id, db, user)
    r = db.scalar(select(KiaRecord).where(KiaRecord.child_id == child.id, KiaRecord.item_key == item_key))
    if r:
        db.delete(r)
        db.commit()
    return kia.schedule(child.birth_date, _given(db, child.id))


def asi_view(db: Session, child: Child, today: date | None = None) -> dict:
    today = today or date.today()
    logs = {g.day: g for g in db.scalars(select(BreastfeedingLog).where(BreastfeedingLog.child_id == child.id)).all()}
    rows = [{"day": d.isoformat(), "asi_only": g.asi_only, "feeds": g.feeds, "other": g.other or []} for d, g in sorted(logs.items())]
    week = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        g = logs.get(d)
        week.append({"day": d.isoformat(), "asi_only": g.asi_only if g else None, "feeds": g.feeds if g else None})
    streak, d = 0, today if today in logs else today - timedelta(days=1)
    while d in logs and logs[d].asi_only:
        streak, d = streak + 1, d - timedelta(days=1)
    t = logs.get(today)
    return {**kia.asi_status(child.birth_date, rows, today), "week": week, "streak": streak,
            "today": {"asi_only": t.asi_only, "feeds": t.feeds, "other": t.other or []} if t else None}


@router.get("/children/{child_id}/asi")
def asi_get(child_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return asi_view(db, get_child(child_id, db, user))


@router.post("/children/{child_id}/asi")
def asi_log(child_id: int, body: AsiIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """One day of the ASI tracker. Anything besides breast milk (water, formula, honey...) ends exclusive breastfeeding."""
    child = get_child(child_id, db, user)
    day = body.day or date.today()
    if day > date.today() or day < child.birth_date or (date.today() - day).days > 30:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Day must be within the last 30 days")
    other = [o for o in body.other if o in ASI_OTHER] if not body.asi_only else []
    g = db.scalar(select(BreastfeedingLog).where(BreastfeedingLog.child_id == child.id, BreastfeedingLog.day == day))
    if g is None:
        g = BreastfeedingLog(child_id=child.id, day=day)
        db.add(g)
    g.asi_only, g.feeds, g.other, g.client_uuid = body.asi_only, body.feeds, other, body.client_uuid
    in_window = kia.asi_status(child.birth_date, [], day)["in_window"]
    if in_window and not body.asi_only:
        if child.exclusive_breastfeeding is not False and child.kader_id:
            notify(db, child.kader_id, "asi", {"id": "ASI eksklusif terputus", "en": "Exclusive breastfeeding interrupted"},
                   {"id": f"{child.name} diberi selain ASI sebelum 6 bulan. Kunjungi untuk konseling menyusui.",
                    "en": f"{child.name} was given something besides breast milk before 6 months. Visit for breastfeeding counselling."},
                   child_id=child.id)
        child.exclusive_breastfeeding = False
    elif in_window and child.exclusive_breastfeeding is None:
        child.exclusive_breastfeeding = True
    db.commit()
    return asi_view(db, child)


@router.get("/local")
def local_services(region_id: int | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The family's nearest Puskesmas (phone, distance), the ambulance number (119) and the next posyandu day."""
    region = db.get(Region, region_id) if region_id else user.region
    return {"region": region.name if region else None, "facility": facility(region), "posyandu": next_posyandu(region)}
