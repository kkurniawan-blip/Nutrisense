"""Decision-support dashboard for health officers (heat map analytics, prioritisation, evaluation metrics)."""
import json
from collections import Counter
from pathlib import Path
from statistics import mean

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import serializers as S
from ..ai import trend
from ..database import get_db
from ..deps import STAFF, can_access_child, require_roles
from ..models import Case, Child, GrowthMeasurement, ModelRun, Region, RiskAssessment, SupplyRequest, User
from ..services import logistics

router = APIRouter(prefix="/api/dashboard", tags=["dashboard & analytics"])

_PREVALENCE = Path(__file__).resolve().parent.parent / "ai" / "data" / "prevalence.json"


def _latest_assessments(db: Session) -> dict[int, RiskAssessment]:
    sub = select(RiskAssessment.child_id, func.max(RiskAssessment.id).label("mid")).group_by(RiskAssessment.child_id).subquery()
    rows = db.scalars(select(RiskAssessment).join(sub, RiskAssessment.id == sub.c.mid)).all()
    return {a.child_id: a for a in rows}


def _visible_children(db: Session, user: User) -> list[Child]:
    return [c for c in db.scalars(select(Child)).all() if can_access_child(user, c)]


def _level(a: RiskAssessment) -> str:
    return a.reviewed_level or a.risk_level


@router.get("/summary")
def summary(user: User = Depends(require_roles(*STAFF)), db: Session = Depends(get_db)):
    logistics.tick(db)
    children = _visible_children(db, user)
    ids = {c.id for c in children}
    latest = {k: v for k, v in _latest_assessments(db).items() if k in ids}
    levels = Counter(_level(a) for a in latest.values())
    stunted = sum(1 for c in children if c.measurements and c.measurements[-1].haz is not None and c.measurements[-1].haz < -2)
    measured = sum(1 for c in children if c.measurements)
    cases = [c for c in db.scalars(select(Case)).all() if c.child_id in ids]
    reqs = [r for r in db.scalars(select(SupplyRequest)).all() if r.child_id in ids]
    return {
        "children": len(children),
        "measured_children": measured,
        "stunting_prevalence_pct": round(100 * stunted / measured, 1) if measured else None,
        "risk_distribution": {lvl: levels.get(lvl, 0) for lvl in ("low", "medium", "high")},
        "needs_review": sum(1 for a in latest.values() if a.needs_review and a.reviewed_at is None),
        "open_cases": sum(1 for c in cases if c.status in ("open", "in_progress", "referred")),
        "emergency_cases": sum(1 for c in cases if c.priority == "emergency" and c.status in ("open", "in_progress", "referred")),
        "supply": {s: sum(1 for r in reqs if r.status == s) for s in
                   ("pending_approval", "awaiting_stock", "in_transit", "ready_for_pickup", "picked_up")},
        "restock_alerts": len(logistics.restock_alerts(db)),
        "declining_trend": sum(1 for a in latest.values() if a.trend.get("status") in ("declining", "projected_stunting")),
    }


@router.get("/heatmap")
def heatmap(user: User = Depends(require_roles(*STAFF)), db: Session = Depends(get_db)):
    """Aggregate, de-identified risk per region (no child names), for the AI heat map."""
    latest = _latest_assessments(db)
    out = []
    for region in db.scalars(select(Region).order_by(Region.district, Region.name)).all():
        kids = db.scalars(select(Child).where(Child.region_id == region.id)).all()
        levels = Counter(_level(latest[c.id]) for c in kids if c.id in latest)
        hazs = [c.measurements[-1].haz for c in kids if c.measurements and c.measurements[-1].haz is not None]
        assessed = sum(levels.values())
        open_cases = db.scalar(select(func.count(Case.id)).join(Child).where(
            Child.region_id == region.id, Case.status.in_(["open", "in_progress", "referred"])))
        out.append({
            "region": S.region(region),
            "children": len(kids),
            "assessed": assessed,
            "risk": {lvl: levels.get(lvl, 0) for lvl in ("low", "medium", "high")},
            "risk_index": round((levels.get("high", 0) + 0.5 * levels.get("medium", 0)) / assessed, 3) if assessed else None,
            "measured_stunting_pct": round(100 * sum(1 for h in hazs if h < -2) / len(hazs), 1) if hazs else None,
            "mean_haz": round(mean(hazs), 2) if hazs else None,
            "benchmark_pct": region.prevalence_benchmark,
            "open_cases": open_cases,
        })
    return out


@router.get("/priority")
def priority_list(limit: int = 50, user: User = Depends(require_roles(*STAFF)), db: Session = Depends(get_db)):
    """Children ordered by urgency for Kader visits and officer follow-up."""
    order = {"emergency": 0, "doctor_48h": 1, "kader_7d": 2, "routine": 3}
    latest = _latest_assessments(db)
    rows = []
    for c in _visible_children(db, user):
        a = latest.get(c.id)
        if a is None:
            continue
        rows.append({"child_id": c.id, "name": c.name, "age_months": S.child(c)["age_months"], "region": c.region.name if c.region else None,
                     "risk_level": _level(a), "urgency": a.triage.get("urgency"), "confidence": a.confidence,
                     "needs_review": a.needs_review and a.reviewed_at is None, "trend": a.trend.get("status"),
                     "haz": a.features.get("haz"), "top_reason": a.reasons[0]["text"] if a.reasons else None,
                     "assessed_at": a.created_at.isoformat()})
    rows.sort(key=lambda r: (order.get(r["urgency"], 9), {"high": 0, "medium": 1, "low": 2}[r["risk_level"]], r["haz"] if r["haz"] is not None else 0))
    return rows[:limit]


@router.get("/projection")
def projection(series: str = "indonesia", until: int = 2030, _: User = Depends(require_roles(*STAFF))):
    data = json.loads(_PREVALENCE.read_text())["series"]
    if series not in data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown series; choose one of {list(data)}")
    s = data[series]
    years, values = zip(*s["data"])
    return {"series": series, "label": s["label"], "source": s["source"], "target": s["target"],
            **trend.fit_prevalence(list(years), list(values), until)}


@router.get("/model")
def model_info(_: User = Depends(require_roles(*STAFF)), db: Session = Depends(get_db)):
    run = db.scalar(select(ModelRun).where(ModelRun.name == "stunting_risk", ModelRun.is_active.is_(True)).order_by(ModelRun.id.desc()))
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No active model")
    return {"id": run.id, "algorithm": run.algorithm, "version": run.version, "n_samples": run.n_samples, "metrics": run.metrics,
            "feature_importances": run.feature_importances, "trained_at": run.trained_at.isoformat(), "notes": run.notes}


@router.get("/evaluation")
def evaluation_metrics(_: User = Depends(require_roles("officer", "doctor", "admin")), db: Session = Depends(get_db)):
    """Workflow-efficiency and decision-clarity metrics from Chapter III (Evaluation Measures)."""
    def minutes(a, b):
        if a is None or b is None:
            return None
        a = a if a.tzinfo else a.replace(tzinfo=b.tzinfo)
        b = b if b.tzinfo else b.replace(tzinfo=a.tzinfo)
        return (b - a).total_seconds() / 60

    meas = {m.id: m for m in db.scalars(select(GrowthMeasurement)).all()}
    assessments = db.scalars(select(RiskAssessment)).all()
    rec_times = [minutes(meas[a.measurement_id].created_at, a.created_at) for a in assessments if a.measurement_id in meas]
    reviewed = [a for a in assessments if a.reviewed_at is not None]
    cases = db.scalars(select(Case)).all()
    reqs = db.scalars(select(SupplyRequest)).all()

    def avg(xs):
        xs = [x for x in xs if x is not None and x >= 0]
        return round(mean(xs), 2) if xs else None

    return {
        "assessments": len(assessments),
        "avg_minutes_measurement_to_recommendation": avg(rec_times),
        "human_review_rate": round(len(reviewed) / len(assessments), 3) if assessments else None,
        "human_ai_agreement_rate": round(sum(1 for a in reviewed if a.reviewed_level == a.risk_level) / len(reviewed), 3) if reviewed else None,
        "flagged_low_confidence": sum(1 for a in assessments if a.needs_review),
        "avg_hours_case_resolution": avg([(minutes(c.created_at, c.resolved_at) or 0) / 60 if c.resolved_at else None for c in cases]),
        "avg_minutes_approval_to_ready": avg([minutes(r.approved_at, r.ready_at) for r in reqs]),
        "avg_hours_ready_to_pickup": avg([(minutes(r.ready_at, r.picked_up_at) or 0) / 60 if r.picked_up_at else None for r in reqs]),
        "fulfillment_mix": dict(Counter(r.fulfillment for r in reqs if r.fulfillment)),
        "pickups_completed": sum(1 for r in reqs if r.status == "picked_up"),
    }


GROUP_OF = {"high": "followup", "medium": "attention", "low": "monitored"}
_GROUP_ORDER = {"followup": 0, "attention": 1, "monitored": 2, "unassessed": 3}
_URGENCY_ORDER = {"emergency": 0, "doctor_48h": 1, "kader_7d": 2, "routine": 3}


@router.get("/children")
def area_children(
    filter: str = "all",
    region_id: int | None = None,
    risk: str | None = None,
    not_measured_days: int | None = None,
    needs_visit: bool | None = None,
    q: str | None = None,
    limit: int = 30,
    offset: int = 0,
    user: User = Depends(require_roles(*STAFF)),
    db: Session = Depends(get_db),
):
    """Scalable child list for Kaders/officers.

    filter: all | priority (needs follow-up or attention) | new (registered < 30 days or never assessed) | followup (open case)
    Extra filters: region_id, risk (low|medium|high), not_measured_days (last measured more than N days ago), needs_visit, q (name).
    Groups: followup = high risk (red), attention = medium (orange), monitored = low (green), unassessed.
    """
    from datetime import date, datetime, timedelta, timezone

    latest = _latest_assessments(db)
    open_case_ids = {c.child_id for c in db.scalars(select(Case).where(Case.status.in_(["open", "in_progress", "referred"]))).all()}
    now = datetime.now(timezone.utc)
    rows = []
    for c in _visible_children(db, user):
        a = latest.get(c.id)
        level = _level(a) if a else None
        group = GROUP_OF.get(level, "unassessed")
        last = c.measurements[-1] if c.measurements else None
        days = (date.today() - last.measured_at).days if last else None
        urgency = a.triage.get("urgency") if a else None
        visit = urgency in ("emergency", "doctor_48h", "kader_7d") or days is None or days > 35
        created = c.created_at if c.created_at.tzinfo else c.created_at.replace(tzinfo=timezone.utc)
        is_new = a is None or created >= now - timedelta(days=30)
        reason = None
        if urgency == "emergency":
            reason = a.reasons[0]["text"] if a and a.reasons else None
        elif days is None or days > 35:
            reason = "Belum diukur lebih dari sebulan" if user.language == "id" else "Not measured for over a month"
        elif a and a.reasons:
            reason = a.reasons[0]["text"]
        rows.append({
            "child_id": c.id, "name": c.name, "age_months": S.child(c)["age_months"], "sex": c.sex,
            "region": c.region.name if c.region else None, "region_id": c.region_id, "group": group, "risk_level": level,
            "urgency": urgency, "reason": reason, "last_measured_at": last.measured_at.isoformat() if last else None,
            "days_since_measured": days, "open_case": c.id in open_case_ids, "needs_visit": visit, "is_new": is_new,
        })

    counts = {g: sum(1 for r in rows if r["group"] == g) for g in _GROUP_ORDER}
    counts["total"] = len(rows)
    regions = sorted({(r["region_id"], r["region"]) for r in rows if r["region_id"]}, key=lambda x: x[1] or "")
    if filter == "priority":
        rows = [r for r in rows if r["group"] in ("followup", "attention")]
    elif filter == "new":
        rows = [r for r in rows if r["is_new"]]
    elif filter == "followup":
        rows = [r for r in rows if r["open_case"]]
    if region_id:
        rows = [r for r in rows if r["region_id"] == region_id]
    if risk:
        rows = [r for r in rows if r["risk_level"] == risk]
    if not_measured_days is not None:
        rows = [r for r in rows if r["days_since_measured"] is None or r["days_since_measured"] > not_measured_days]
    if needs_visit is not None:
        rows = [r for r in rows if r["needs_visit"] == needs_visit]
    if q:
        rows = [r for r in rows if q.lower() in r["name"].lower()]
    rows.sort(key=lambda r: (_URGENCY_ORDER.get(r["urgency"], 4), _GROUP_ORDER[r["group"]], -(999 if r["days_since_measured"] is None else r["days_since_measured"])))
    limit = max(1, min(limit, 100))
    return {"counts": counts, "matched": len(rows), "rows": rows[offset:offset + limit], "offset": offset, "limit": limit,
            "regions": [{"id": i, "name": n} for i, n in regions]}
