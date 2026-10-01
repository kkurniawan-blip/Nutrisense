"""Pregnancy (ibu hamil) rules, following the Buku KIA 2020 and Kemenkes antenatal care guidance.

* Gestational age from HPHT (first day of the last menstrual period); HPL = HPHT + 280 days (Naegele).
* Trimesters as in the Buku KIA: TM1 up to 12 weeks, TM2 above 12 to 24 weeks, TM3 above 24 weeks.
* Antenatal care: at least 6 visits (K6) - 1 in TM1, 2 in TM2, 3 in TM3; K1 and K5 with a doctor.
* Mother checks: LiLA < 23.5 cm = KEK (chronic energy deficiency); Hb < 11 g/dL = anaemia, < 7 g/dL severe.
* Postpartum (nifas) visits KF1-KF4 and newborn visits KN1-KN3.
These are schedules and screening thresholds, not a diagnosis.
"""
from __future__ import annotations

from datetime import date, timedelta

TERM_DAYS = 280
TERM_WEEKS = 37  # born before 37 completed weeks = premature (kurang bulan)
KEK_MUAC_CM = 23.5
ANEMIA_HB = 11.0
SEVERE_ANEMIA_HB = 7.0
SHORT_MOTHER_CM = 145.0

# K1..K6: trimester, the week window in which the visit belongs, a target week for the reminder, and who sees her.
ANC_VISITS = [
    {"number": 1, "trimester": 1, "from_week": 0, "to_week": 12, "target_week": 10, "doctor": True},
    {"number": 2, "trimester": 2, "from_week": 13, "to_week": 24, "target_week": 18, "doctor": False},
    {"number": 3, "trimester": 2, "from_week": 13, "to_week": 24, "target_week": 23, "doctor": False},
    {"number": 4, "trimester": 3, "from_week": 25, "to_week": 42, "target_week": 30, "doctor": False},
    {"number": 5, "trimester": 3, "from_week": 25, "to_week": 42, "target_week": 34, "doctor": True},
    {"number": 6, "trimester": 3, "from_week": 25, "to_week": 42, "target_week": 38, "doctor": False},
]

# Postpartum visits for the mother (KF) and the newborn (KN): days after birth.
NIFAS_VISITS = [
    {"code": "KF1", "who": "mother", "from_day": 0, "to_day": 2},
    {"code": "KN1", "who": "baby", "from_day": 0, "to_day": 2},
    {"code": "KF2", "who": "mother", "from_day": 3, "to_day": 7},
    {"code": "KN2", "who": "baby", "from_day": 3, "to_day": 7},
    {"code": "KF3", "who": "mother", "from_day": 8, "to_day": 28},
    {"code": "KN3", "who": "baby", "from_day": 8, "to_day": 28},
    {"code": "KF4", "who": "mother", "from_day": 29, "to_day": 42},
]

# Buku KIA: danger signs in pregnancy (go to the health facility now) and common complaints (advice only).
DANGER_SIGNS = ["bleeding", "waters_break", "swelling_headache", "convulsions", "high_fever", "less_movement", "vomiting_all",
                "breathless"]
COMMON_COMPLAINTS = ["nausea", "dizzy", "back_pain", "cramps", "sleepless", "constipation"]

EDUCATION = ["none", "sd", "smp", "sma", "higher"]


def hpl(hpht: date) -> date:
    return hpht + timedelta(days=TERM_DAYS)


def hpht_from_weeks(weeks: float, on: date) -> date:
    return on - timedelta(days=round(weeks * 7))


def gestational_days(hpht: date, on: date) -> int:
    return (on - hpht).days


def trimester(weeks: int) -> int:
    return 1 if weeks <= 12 else 2 if weeks <= 24 else 3


def anc_schedule(hpht: date, done: dict[int, dict], on: date) -> list[dict]:
    """Each K visit with its date window and status: done, due (in its window now), overdue, upcoming."""
    weeks = gestational_days(hpht, on) / 7
    out = []
    for v in ANC_VISITS:
        rec = done.get(v["number"])
        start = hpht + timedelta(weeks=v["from_week"])
        end = hpht + timedelta(weeks=v["to_week"], days=6)
        target = hpht + timedelta(weeks=v["target_week"])
        if rec:
            status = "done"
        elif weeks > v["to_week"] + 1:
            status = "overdue"
        elif weeks >= v["from_week"]:
            status = "due"
        else:
            status = "upcoming"
        out.append({**v, "window_start": start.isoformat(), "window_end": end.isoformat(), "target_date": target.isoformat(),
                    "status": status, "visit_date": rec["visit_date"] if rec else None, "place": rec.get("place") if rec else None})
    # Within a trimester, visits are taken in order: only the first open one is "due"; later ones wait.
    seen_due = set()
    for v in out:
        if v["status"] == "due":
            if v["trimester"] in seen_due:
                v["status"] = "upcoming"
            seen_due.add(v["trimester"])
    return out


def next_anc(schedule: list[dict]) -> dict | None:
    """The visit to go to next: the one due now, else a missed one still worth catching up, else the next upcoming."""
    for status in ("due", "overdue", "upcoming"):
        for v in schedule:
            if v["status"] == status:
                return v
    return None


def mother_flags(muac_cm: float | None, hb_g_dl: float | None, height_cm: float | None) -> list[dict]:
    """Screening flags with a status key for the app's status colours."""
    flags = []
    if muac_cm is not None and muac_cm < KEK_MUAC_CM:
        flags.append({"code": "kek", "status": "action", "value": muac_cm})
    if hb_g_dl is not None and hb_g_dl < SEVERE_ANEMIA_HB:
        flags.append({"code": "severe_anemia", "status": "urgent", "value": hb_g_dl})
    elif hb_g_dl is not None and hb_g_dl < ANEMIA_HB:
        flags.append({"code": "anemia", "status": "action", "value": hb_g_dl})
    if height_cm is not None and height_cm < SHORT_MOTHER_CM:
        flags.append({"code": "short_stature", "status": "monitor", "value": height_cm})
    return flags


def nifas_schedule(birth: date, done: list[str], on: date) -> list[dict]:
    age = (on - birth).days
    out = []
    for v in NIFAS_VISITS:
        if v["code"] in done:
            status = "done"
        elif age > v["to_day"]:
            status = "overdue"
        elif age >= v["from_day"]:
            status = "due"
        else:
            status = "upcoming"
        out.append({**v, "window_start": (birth + timedelta(days=v["from_day"])).isoformat(),
                    "window_end": (birth + timedelta(days=v["to_day"])).isoformat(), "status": status})
    return out


RISK_LEVELS = ["ok", "monitor", "action", "urgent"]
RISK_LABEL = {
    "unknown": {"id": "Belum dicek", "en": "Not checked yet"},
    "ok": {"id": "Risiko rendah", "en": "Low risk"},
    "monitor": {"id": "Perlu dipantau", "en": "Keep an eye on"},
    "action": {"id": "Risiko sedang", "en": "Medium risk"},
    "urgent": {"id": "Risiko tinggi", "en": "High risk"},
}
_REASON = {
    "kek": {"id": "Lengan kecil (KEK)", "en": "Thin arm (CED)"},
    "anemia": {"id": "Kurang darah (anemia)", "en": "Low blood (anaemia)"},
    "severe_anemia": {"id": "Sangat kurang darah", "en": "Severe anaemia"},
    "short_stature": {"id": "Tinggi < 145 cm", "en": "Height < 145 cm"},
    "danger": {"id": "Tanda bahaya", "en": "Danger sign"},
    "not_checked": {"id": "Lengan & darah belum dicek", "en": "Arm & blood not checked"},
}


def mother_risk(flags: list[dict], checked: bool, missed_visits: int, recent_danger: bool, lang: str) -> dict:
    """One level for the mother, from the Buku KIA screening and the check-ups.

    Risiko tinggi: KEK and anaemia together, severe anaemia, or a danger sign in the last 3 days.
    Risiko sedang: KEK or anaemia. Perlu dipantau: short stature. Each missed K visit lowers the status one step
    (two at most). With no LiLA/Hb yet the status is "Belum dicek", never "healthy"."""
    L = "id" if lang == "id" else "en"
    codes = {f["code"] for f in flags}
    reasons = [_REASON[c][L] for c in ("severe_anemia", "kek", "anemia", "short_stature") if c in codes]
    if recent_danger or "severe_anemia" in codes or {"kek", "anemia"} <= codes:
        base = 3
    elif codes & {"kek", "anemia"}:
        base = 2
    elif "short_stature" in codes:
        base = 1
    else:
        base = 0
    if recent_danger:
        reasons.insert(0, _REASON["danger"][L])
    if missed_visits:
        reasons.append({"id": f"{missed_visits} kunjungan terlewat", "en": f"{missed_visits} missed visit{'s' if missed_visits > 1 else ''}"}[L])
    if not checked and base == 0 and not missed_visits:
        return {"key": "unknown", "label": RISK_LABEL["unknown"][L], "reasons": [_REASON["not_checked"][L]], "contact": False}
    if not checked:
        reasons.append(_REASON["not_checked"][L])
    level = min(3, base + min(missed_visits, 2))
    key = RISK_LEVELS[level]
    return {"key": key, "label": RISK_LABEL[key][L], "reasons": reasons, "contact": level >= 2}
