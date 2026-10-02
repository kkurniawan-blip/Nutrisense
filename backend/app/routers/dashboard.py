"""Decision-support dashboard for health officers (heat map analytics, prioritisation, evaluation metrics)."""
import json
from collections import Counter
from pathlib import Path
from statistics import mean

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import serializers as S
from ..ai import kia, maternal as M, trend
from ..database import get_db
from ..deps import STAFF, can_access_child, require_roles
from ..models import (AncVisit, Case, Child, GrowthMeasurement, MaternalMeasurement, ModelRun, Pregnancy, Region, RiskAssessment,
                      SupplyRequest, User)
from ..services import logistics

router = APIRouter(prefix="/api/dashboard", tags=["dashboard & analytics"])

_PREVALENCE = Path(__file__).resolve().parent.parent / "ai" / "data" / "prevalence.json"


def app_source() -> dict:
    """Figures computed from records in this NutriSense instance (the seeded demo network unless real data is loaded)."""
    from datetime import date

    return {"label": {"id": "Data NutriSense (demo)", "en": "NutriSense data (demo)"}, "year": date.today().year}


# National reference values shown next to the app's own figures.
REFERENCE = {
    "stunting_ntt": {"value": 37.0, "label": "SSGI 2024, Kemenkes RI", "year": 2024},
    "kek_pregnant": {"value": 17.3, "label": "Riskesdas 2018, Kemenkes RI", "year": 2018},
    "anemia_pregnant": {"value": 48.9, "label": "Riskesdas 2018, Kemenkes RI", "year": 2018},
}


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
        "two_t": sum(1 for c in children if kia.not_gaining([(m.measured_at, m.age_months, m.weight_kg) for m in c.measurements]) >= 2),
        "source": app_source(),
        "reference": {"stunting_ntt": REFERENCE["stunting_ntt"]},
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
            "source": app_source(),
            "benchmark_source": {"label": "SSGI 2024 (NTT), Kemenkes RI", "year": 2024},
        })
    return out


@router.get("/priority")
def priority_list(limit: int = Query(50, ge=1, le=500), user: User = Depends(require_roles(*STAFF)), db: Session = Depends(get_db)):
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
def projection(series: str = "indonesia", until: int = Query(2030, ge=2024, le=2045), _: User = Depends(require_roles(*STAFF))):
    data = json.loads(_PREVALENCE.read_text())["series"]
    if series not in data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown series; choose one of {list(data)}")
    s = data[series]
    years, values = zip(*s["data"])
    return {"series": series, "label": s["label"], "source": s["source"], "target": s["target"],
            "years": [min(years), max(years)], "target_source": "RPJMN 2025-2029",
            **trend.fit_prevalence(list(years), list(values), until)}


@router.get("/model")
def model_info(_: User = Depends(require_roles(*STAFF)), db: Session = Depends(get_db)):
    run = db.scalar(select(ModelRun).where(ModelRun.name == "stunting_risk", ModelRun.is_active.is_(True)).order_by(ModelRun.id.desc()))
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No active model")
    from ..ai.risk_model import FEATURE_NAMES

    return {"id": run.id, "algorithm": run.algorithm, "version": run.version, "n_samples": run.n_samples, "metrics": run.metrics,
            "feature_importances": run.feature_importances, "trained_at": run.trained_at.isoformat(), "notes": run.notes,
            # Trained and tested on a synthetic cohort: these are demo numbers, not a clinical validation.
            "demo": True, "inputs": FEATURE_NAMES,
            "source": {"label": {"id": "Kohort sintetis NTT (data demo)", "en": "Synthetic NTT cohort (demo data)"},
                       "year": run.trained_at.year}}


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
    not_measured_days: int | None = Query(None, ge=0, le=3650),
    needs_visit: bool | None = None,
    q: str | None = None,
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
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


def _visible_pregnancies(db: Session, user: User) -> list[Pregnancy]:
    rows = db.scalars(select(Pregnancy)).all()
    if user.role == "kader":
        return [p for p in rows if p.kader_id == user.id or p.region_id in user.coverage()]
    return list(rows)


@router.get("/mothers")
def mothers(user: User = Depends(require_roles(*STAFF)), db: Session = Depends(get_db)):
    """Ibu hamil indicators: KEK and anaemia at the latest check, and K6 coverage (6+ antenatal visits)."""
    from datetime import date, timedelta

    today = date.today()
    preg = _visible_pregnancies(db, user)
    active = [p for p in preg if p.status == "active"]
    latest = {}
    for p in active:
        ms = db.scalars(select(MaternalMeasurement).where(MaternalMeasurement.pregnancy_id == p.id)
                        .order_by(MaternalMeasurement.measured_at, MaternalMeasurement.id)).all()
        muac = next((m.muac_cm for m in reversed(ms) if m.muac_cm is not None), None)
        hb = next((m.hb_g_dl for m in reversed(ms) if m.hb_g_dl is not None), None)
        latest[p.id] = (muac, hb)
    with_muac = [v for v in latest.values() if v[0] is not None]
    with_hb = [v for v in latest.values() if v[1] is not None]
    kek = sum(1 for m, _ in with_muac if m < M.KEK_MUAC_CM)
    anemia = sum(1 for _, h in with_hb if h < M.ANEMIA_HB)
    visits = Counter(v.pregnancy_id for v in db.scalars(select(AncVisit)).all())
    # K6 coverage: mothers who gave birth in the last 12 months, or are at 36+ weeks, with at least 6 visits.
    eligible = [p for p in preg if (p.delivered_at and p.delivered_at >= today - timedelta(days=365))
                or (p.status == "active" and M.gestational_days(p.hpht, today) >= 36 * 7)]
    k6 = sum(1 for p in eligible if visits.get(p.id, 0) >= 6)
    k1 = sum(1 for p in active if visits.get(p.id, 0) >= 1)

    def pct(n, d):
        return round(100 * n / d, 1) if d else None

    return {
        "active": len(active), "delivered_12m": sum(1 for p in preg if p.delivered_at and p.delivered_at >= today - timedelta(days=365)),
        "checked": len(with_muac),
        "kek": {"n": kek, "of": len(with_muac), "pct": pct(kek, len(with_muac)), "reference": REFERENCE["kek_pregnant"]},
        "anemia": {"n": anemia, "of": len(with_hb), "pct": pct(anemia, len(with_hb)), "reference": REFERENCE["anemia_pregnant"]},
        "k6": {"n": k6, "of": len(eligible), "pct": pct(k6, len(eligible))},
        "k1": {"n": k1, "of": len(active), "pct": pct(k1, len(active))},
        "not_checked": len(active) - len({pid for pid, v in latest.items() if v[0] is not None or v[1] is not None}),
        "source": app_source(),
    }


@router.get("/flagged")
def flagged(days: int = Query(60, ge=1, le=730), user: User = Depends(require_roles(*STAFF)), db: Session = Depends(get_db)):
    """Measurements that need a second look: oedema, 2T, severe z-scores (children); KEK or anaemia (mothers)."""
    from datetime import date, timedelta

    since = date.today() - timedelta(days=days)
    rows = []
    for c in _visible_children(db, user):
        ms = c.measurements
        if not ms or ms[-1].measured_at < since:
            continue
        m = ms[-1]
        flags = []
        if m.oedema:
            flags.append("oedema")
        if kia.not_gaining([(x.measured_at, x.age_months, x.weight_kg) for x in ms]) >= 2:
            flags.append("two_t")
        if m.whz is not None and m.whz < -3:
            flags.append("severe_wasting")
        if m.haz is not None and m.haz < -3:
            flags.append("severe_stunting")
        if flags:
            rows.append({"kind": "child", "id": c.id, "name": c.name, "region": c.region.name if c.region else None, "flags": flags,
                         "measured_at": m.measured_at.isoformat(), "measured_by": m.measured_by or ("kader" if m.source == "kader" else "mother"),
                         "urgent": "oedema" in flags or "severe_wasting" in flags})
    for p in _visible_pregnancies(db, user):
        if p.status != "active":
            continue
        m = db.scalar(select(MaternalMeasurement).where(MaternalMeasurement.pregnancy_id == p.id).order_by(MaternalMeasurement.measured_at.desc(),
                                                                                                       MaternalMeasurement.id.desc()))
        if m is None or m.measured_at < since:
            continue
        codes = [f["code"] for f in M.mother_flags(m.muac_cm, m.hb_g_dl, None)]
        if codes:
            by = db.get(User, m.recorded_by_id) if m.recorded_by_id else None
            rows.append({"kind": "mother", "id": p.id, "name": p.mother.full_name, "region": p.region.name if p.region else None,
                         "flags": codes, "measured_at": m.measured_at.isoformat(),
                         "measured_by": "kader" if by is not None and by.role == "kader" else "mother",
                         "urgent": "severe_anemia" in codes or {"kek", "anemia"} <= set(codes)})
    rows.sort(key=lambda r: r["measured_at"], reverse=True)
    rows.sort(key=lambda r: not r["urgent"])  # urgent first, newest first within each group
    return {"rows": rows, "source": app_source()}
