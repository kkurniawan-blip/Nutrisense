"""Predictive growth tracker and prevalence projection.

* Child level: least-squares regression of HAZ on age over recent visits -> growth velocity
  and a projected HAZ 3 and 6 months ahead, so a child sliding toward the -2 SD line is flagged
  before the height gap is visible.
* Population level: linear / quadratic / cubic polynomial fits of stunting prevalence compared by
  RMSE, as in Appendix B (the cubic was selected in the DataMinions analysis).
"""
from __future__ import annotations

import numpy as np

from .growth import _lms, _value_at

DECLINE_THRESHOLD = -0.05  # HAZ units per month


def growth_trend(points: list[tuple[float, float]], sex: str, horizon_months: tuple[int, ...] = (3, 6)) -> dict:
    """points: [(age_months, haz)] ordered by age. Uses the last 6 visits within 12 months."""
    pts = [(a, z) for a, z in points if z is not None]
    if not pts:
        return {"status": "no_data"}
    latest_age, latest_haz = pts[-1]
    recent = [(a, z) for a, z in pts if latest_age - a <= 12][-6:]
    if len(recent) < 2 or recent[-1][0] - recent[0][0] < 1:
        return {"status": "insufficient_history", "current_haz": latest_haz, "visits": len(pts)}

    ages = np.array([a for a, _ in recent])
    hazs = np.array([z for _, z in recent])
    slope, intercept = np.polyfit(ages, hazs, 1)
    fitted = slope * ages + intercept
    rmse = float(np.sqrt(np.mean((hazs - fitted) ** 2)))

    projections = []
    for h in horizon_months:
        age = min(latest_age + h, 60.0)
        z = float(np.clip(latest_haz + slope * (age - latest_age), -6, 6))
        key = "lfa" if age < 24 else "hfa"
        lms = _lms(key, sex, age)
        projections.append({
            "age_months": round(age, 1),
            "haz": round(z, 2),
            "expected_height_cm": round(_value_at(*lms, z), 1) if lms else None,
            "median_height_cm": round(lms[1], 1) if lms else None,
        })

    declining = slope < DECLINE_THRESHOLD
    will_cross = latest_haz >= -2 and any(p["haz"] < -2 for p in projections)
    if will_cross:
        status = "projected_stunting"
    elif declining:
        status = "declining"
    elif slope > abs(DECLINE_THRESHOLD):
        status = "catching_up"
    else:
        status = "stable"
    return {
        "status": status,
        "current_haz": latest_haz,
        "haz_velocity_per_month": round(float(slope), 4),
        "fit_rmse": round(rmse, 3),
        "visits_used": len(recent),
        "projections": projections,
    }


def haz_velocity(points: list[tuple[float, float]]) -> float:
    trend = growth_trend(points, "male")  # sex does not affect the slope
    return float(trend.get("haz_velocity_per_month", 0.0) or 0.0)


def _loocv_rmse(x: np.ndarray, y: np.ndarray, degree: int) -> float:
    errors = []
    for i in range(len(x)):
        mask = np.arange(len(x)) != i
        coef = np.polyfit(x[mask], y[mask], degree)
        errors.append(np.polyval(coef, x[i]) - y[i])
    return float(np.sqrt(np.mean(np.square(errors))))


def fit_prevalence(years: list[int], values: list[float], until: int = 2030) -> dict:
    """Compare polynomial degrees 1-3 and project with the best one.

    In-sample RMSE always favours the most flexible curve (a cubic through 4 points has RMSE 0 and
    extrapolates wildly), so the degree is selected by leave-one-out cross-validated RMSE, and a
    degree is only considered when there are at least degree + 3 observations.
    """
    x = np.array(years, dtype=float)
    y = np.array(values, dtype=float)
    x0 = x.min()
    xs = x - x0
    models = {}
    for degree in (1, 2, 3):
        if len(x) < degree + 3:
            continue
        coef = np.polyfit(xs, y, degree)
        rmse = float(np.sqrt(np.mean((np.polyval(coef, xs) - y) ** 2)))
        models[degree] = (coef, rmse, _loocv_rmse(xs, y, degree))
    if not models:  # too few points for any fit: carry the last value forward
        models[0] = (np.array([y[-1]]), 0.0, float("nan"))
    best = min(models, key=lambda d: (models[d][2] if not np.isnan(models[d][2]) else 0))
    coef = models[best][0]
    future = list(range(int(x.max()) + 1, until + 1))
    return {
        "rmse": {f"degree_{d}": round(r, 3) for d, (_, r, _) in models.items()},
        "cv_rmse": {f"degree_{d}": round(cv, 3) for d, (_, _, cv) in models.items() if not np.isnan(cv)},
        "selected_degree": best,
        "history": [{"year": int(a), "value": float(b)} for a, b in zip(x, y)],
        "projection": [{"year": yr, "value": round(float(np.clip(np.polyval(coef, yr - x0), 0, 100)), 2)} for yr in future],
        "caveat": "Short-series polynomial trend selected by leave-one-out cross-validation; "
        "treat as a short-horizon trend, not a forecast (see Appendix B limitations).",
    }
