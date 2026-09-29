"""Buku KIA rules for the child: immunisation, vitamin A and deworming schedule, minimum weight gain (2T) and ASI.

Sources: Buku KIA (Kemenkes RI, 2020, revised 2023); national immunisation schedule (Permenkes 12/2017, with PCV and
rotavirus added in 2022-2023); minimum weight gain (KBM) from the KMS in Buku KIA 2020; vitamin A every February and
August (Kemenkes 2016); deworming twice a year from 12 months (Permenkes 15/2017).
"""
from __future__ import annotations

from datetime import date, timedelta

from .growth import age_in_months

SOURCE = "Buku KIA 2020 (rev. 2023) · Kemenkes RI"

# One posyandu/puskesmas visit per age, with the vaccines given at that visit.
IMMUNIZATION = [
    {"key": "imm_0", "age": 0, "vaccines": ["HB0"]},
    {"key": "imm_1", "age": 1, "vaccines": ["BCG", "Polio 1"]},
    {"key": "imm_2", "age": 2, "vaccines": ["DPT-HB-Hib 1", "Polio 2", "PCV 1", "RV 1"]},
    {"key": "imm_3", "age": 3, "vaccines": ["DPT-HB-Hib 2", "Polio 3", "PCV 2", "RV 2"]},
    {"key": "imm_4", "age": 4, "vaccines": ["DPT-HB-Hib 3", "Polio 4", "IPV 1", "RV 3"]},
    {"key": "imm_9", "age": 9, "vaccines": ["Campak-Rubela 1", "IPV 2"]},
    {"key": "imm_12", "age": 12, "vaccines": ["PCV 3"]},
    {"key": "imm_18", "age": 18, "vaccines": ["DPT-HB-Hib lanjutan", "Campak-Rubela 2"]},
]
# Vitamin A: a blue capsule (100,000 IU) once at 6-11 months, then a red one (200,000 IU) every 6 months to 59 months.
VITAMIN_A = [{"key": "vita_6", "age": 6, "dose": "biru"}] + [{"key": f"vita_{a}", "age": a, "dose": "merah"} for a in range(12, 60, 6)]
# Deworming (obat cacing) every 6 months from 12 months.
DEWORMING = [{"key": f"worm_{a}", "age": a} for a in range(12, 60, 6)]
ALL_KEYS = {i["key"] for i in IMMUNIZATION + VITAMIN_A + DEWORMING}

# Minimum monthly weight gain (Kenaikan Berat Minimal, grams) by age in months, KMS / Buku KIA 2020.
KBM_G = {1: 800, 2: 900, 3: 800, 4: 600, 5: 500, 6: 400, 7: 300, 8: 300, 9: 300, 10: 300, 11: 200}
KBM_OLDER_G = 200  # 12-60 months
ASI_EXCLUSIVE_MONTHS = 6


def _window_end(items: list[dict], i: int, default_months: int) -> int:
    return items[i + 1]["age"] if i + 1 < len(items) else items[i]["age"] + default_months


def schedule(birth: date, given: dict[str, date], on: date | None = None) -> dict:
    """Each KIA item with its target date and status: done, due (in its window now), overdue, upcoming."""
    on = on or date.today()
    age = age_in_months(birth, on)

    def row(item: dict, end_age: float) -> dict:
        target = birth + timedelta(days=round(item["age"] * 30.44))
        if item["key"] in given:
            st = "done"
        elif age >= end_age:
            st = "overdue"
        elif age >= item["age"]:
            st = "due"
        else:
            st = "upcoming"
        return {**item, "target_date": target.isoformat(), "status": st,
                "given_at": given[item["key"]].isoformat() if item["key"] in given else None}

    imm = [row(v, _window_end(IMMUNIZATION, i, 2)) for i, v in enumerate(IMMUNIZATION)]
    vita = [row(v, v["age"] + 6) for v in VITAMIN_A]
    worm = [row(v, v["age"] + 6) for v in DEWORMING]
    return {"age_months": age, "immunization": imm, "vitamin_a": vita, "deworming": worm, "source": SOURCE,
            "next": next((r for r in sorted(imm + vita + worm, key=lambda r: r["age"]) if r["status"] in ("due", "overdue")), None)
            or next((r for r in sorted(imm + vita + worm, key=lambda r: r["age"]) if r["status"] == "upcoming"), None)}


def immunization_complete(birth: date, given: dict[str, date], on: date | None = None) -> float | None:
    """1 if every vaccine visit whose window has closed was given, 0 if one was missed, None if nothing is recorded."""
    if not given:
        return None
    s = schedule(birth, given, on)
    return 0.0 if any(r["status"] == "overdue" for r in s["immunization"]) else 1.0


def kbm_g(age_months: float) -> int:
    m = max(1, int(age_months))
    return KBM_G.get(m, KBM_OLDER_G)


def weighings(points: list[tuple[date, float, float]]) -> list[dict]:
    """N (naik) or T (tidak naik) for each weighing after the first, from (date, age_months, weight_kg) in date order.

    T when the monthly gain is below the KBM for the age. Weighings less than 2 weeks or more than 2.5 months apart
    are not judged (O)."""
    out = []
    for (d0, _, w0), (d1, a1, w1) in zip(points, points[1:]):
        months = (d1 - d0).days / 30.44
        if months < 0.5 or months > 2.5:
            out.append({"date": d1.isoformat(), "result": "O", "gain_g": round((w1 - w0) * 1000), "kbm_g": kbm_g(a1)})
            continue
        gain = (w1 - w0) * 1000
        out.append({"date": d1.isoformat(), "result": "T" if gain / months < kbm_g(a1) else "N", "gain_g": round(gain),
                    "kbm_g": kbm_g(a1)})
    return out


def not_gaining(points: list[tuple[date, float, float]]) -> int:
    """How many of the last two weighings were T in a row, ending with the latest: 0, 1 or 2 (2T)."""
    res = [w["result"] for w in weighings(points)]
    n = 0
    for r in reversed(res[-2:]):
        if r != "T":
            break
        n += 1
    return n


def asi_status(birth: date, logs: list[dict], on: date | None = None) -> dict:
    """ASI eksklusif: days logged, days with ASI only, and whether anything else was given."""
    on = on or date.today()
    age = age_in_months(birth, on)
    only = [g for g in logs if g["asi_only"]]
    return {"age_months": age, "in_window": age < ASI_EXCLUSIVE_MONTHS, "days_logged": len(logs), "days_asi_only": len(only),
            "broken": any(not g["asi_only"] for g in logs),
            "until": (birth + timedelta(days=round(ASI_EXCLUSIVE_MONTHS * 30.44))).isoformat()}
