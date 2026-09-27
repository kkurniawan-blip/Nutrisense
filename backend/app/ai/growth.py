"""WHO Child Growth Standards z-score engine (computeZScore in the class diagram).

Uses the official WHO LMS parameters (0-60 months):
    z = ((y / M) ** L - 1) / (L * S)
with the WHO "restricted" adjustment beyond +/-3 SD for weight-based indicators.
"""
import json
from bisect import bisect_left
from dataclasses import dataclass
from datetime import date
from functools import lru_cache
from pathlib import Path

_DATA = Path(__file__).parent / "data" / "who_lms.json"

DAYS_PER_MONTH = 30.4375
MAX_AGE_MONTHS = 60.0


@lru_cache
def _tables() -> dict:
    raw = json.loads(_DATA.read_text())["tables"]
    tables: dict = {}
    for indicator, by_sex in raw.items():
        for sex, rows in by_sex.items():
            if indicator == "lhfa":
                # The WHO table repeats month 24: first row is recumbent length, second standing height.
                split = [i for i, r in enumerate(rows) if r[0] == 24.0][1]
                tables[("lfa", sex)] = rows[:split]
                tables[("hfa", sex)] = rows[split:]
            else:
                tables[(indicator, sex)] = rows
    return tables


def _lms(indicator: str, sex: str, x: float) -> tuple[float, float, float] | None:
    rows = _tables()[(indicator, sex)]
    xs = [r[0] for r in rows]
    if x < xs[0] or x > xs[-1]:
        return None
    i = bisect_left(xs, x)
    if xs[i] == x:
        return tuple(rows[i][1:4])  # type: ignore[return-value]
    lo, hi = rows[i - 1], rows[i]
    t = (x - lo[0]) / (hi[0] - lo[0])
    return tuple(lo[k] + t * (hi[k] - lo[k]) for k in (1, 2, 3))  # type: ignore[return-value]


def _value_at(l: float, m: float, s: float, z: float) -> float:
    if l == 0:
        import math

        return m * math.exp(s * z)
    return m * (1 + l * s * z) ** (1 / l)


def _z(y: float, lms: tuple[float, float, float], restricted: bool) -> float:
    import math

    l, m, s = lms
    z = math.log(y / m) / s if l == 0 else ((y / m) ** l - 1) / (l * s)
    if restricted and z > 3:
        sd3, sd2 = _value_at(l, m, s, 3), _value_at(l, m, s, 2)
        z = 3 + (y - sd3) / (sd3 - sd2)
    elif restricted and z < -3:
        sd3, sd2 = _value_at(l, m, s, -3), _value_at(l, m, s, -2)
        z = -3 + (y - sd3) / (sd2 - sd3)
    return round(z, 2)


def age_in_months(birth_date: date, on: date) -> float:
    return round((on - birth_date).days / DAYS_PER_MONTH, 2)


def adjust_height(height_cm: float, age_months: float, position: str) -> float:
    """WHO convention: length (lying) below 24 months, height (standing) from 24 months; 0.7 cm correction."""
    if age_months < 24 and position == "standing":
        return height_cm + 0.7
    if age_months >= 24 and position == "lying":
        return height_cm - 0.7
    return height_cm


@dataclass
class ZScores:
    haz: float | None
    waz: float | None
    whz: float | None
    height_used_cm: float

    def as_dict(self) -> dict:
        return {"haz": self.haz, "waz": self.waz, "whz": self.whz}


def compute_z_scores(sex: str, age_months: float, weight_kg: float, height_cm: float, position: str = "standing") -> ZScores:
    if sex not in ("male", "female"):
        raise ValueError("sex must be 'male' or 'female'")
    if age_months < 0 or age_months > MAX_AGE_MONTHS + 0.99:
        raise ValueError("WHO growth standards cover children aged 0-60 months")
    h = adjust_height(height_cm, age_months, position)

    lfa_key = "lfa" if age_months < 24 else "hfa"
    lms = _lms(lfa_key, sex, min(age_months, MAX_AGE_MONTHS))
    haz = _z(h, lms, restricted=False) if lms else None

    lms = _lms("wfa", sex, min(age_months, MAX_AGE_MONTHS))
    waz = _z(weight_kg, lms, restricted=True) if lms else None

    wh_key = "wfl" if age_months < 24 else "wfh"
    lms = _lms(wh_key, sex, h)
    whz = _z(weight_kg, lms, restricted=True) if lms else None
    return ZScores(haz=haz, waz=waz, whz=whz, height_used_cm=round(h, 1))


def reference_curve(sex: str, indicator: str = "hfa", z_values=(-3, -2, 0, 2)) -> dict:
    """Points for plotting WHO reference bands in the mobile growth chart (x = age in months)."""
    out: dict = {str(z): [] for z in z_values}
    if indicator == "hfa":
        rows = _tables()[("lfa", sex)] + _tables()[("hfa", sex)][1:]
    else:
        rows = _tables()[(indicator, sex)]
    for x, l, m, s in rows:
        for z in z_values:
            out[str(z)].append([x, round(_value_at(l, m, s, z), 2)])
    return out


def classify_haz(haz: float | None) -> str:
    if haz is None:
        return "unknown"
    if haz < -3:
        return "severely_stunted"
    if haz < -2:
        return "stunted"
    if haz < -1:
        return "at_risk"
    return "normal"


def classify_whz(whz: float | None) -> str:
    if whz is None:
        return "unknown"
    if whz < -3:
        return "severely_wasted"
    if whz < -2:
        return "wasted"
    if whz > 3:
        return "obese"
    if whz > 2:
        return "overweight"
    return "normal"


def classify_waz(waz: float | None) -> str:
    if waz is None:
        return "unknown"
    if waz < -3:
        return "severely_underweight"
    if waz < -2:
        return "underweight"
    return "normal"


def plausibility_errors(age_months: float, weight_kg: float, height_cm: float, z: ZScores) -> list[str]:
    """WHO flagging rules for biologically implausible values (likely data-entry errors)."""
    errors = []
    if not (0.5 <= weight_kg <= 40):
        errors.append("weight_out_of_range")
    if not (38 <= height_cm <= 130):
        errors.append("height_out_of_range")
    if z.haz is not None and not (-6 <= z.haz <= 6):
        errors.append("implausible_haz")
    if z.waz is not None and not (-6 <= z.waz <= 5):
        errors.append("implausible_waz")
    if z.whz is not None and not (-5 <= z.whz <= 5):
        errors.append("implausible_whz")
    return errors
