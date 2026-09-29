"""AI-assisted triage engine: turns a risk prediction + symptoms into urgency, next steps and supply needs.

Urgency tiers
  emergency   - danger signs: go to Puskesmas / hospital now
  doctor_48h  - high risk: doctor consultation within 48 hours
  kader_7d    - medium risk: Kader home visit within 7 days
  routine     - low risk: continue monthly Posyandu monitoring
"""
from __future__ import annotations

SUPPLY_CATALOG = {
    "pmt_biscuit": {"name": {"id": "Paket PMT biskuit (7 hari)", "en": "PMT supplementary biscuit pack (7 days)"}, "weight_kg": 0.6, "needs_doctor": False},
    "rutf": {"name": {"id": "RUTF (7 hari)", "en": "RUTF therapeutic food (7 days)"}, "weight_kg": 0.7, "needs_doctor": True},
    "ors_zinc": {"name": {"id": "Oralit + Zinc", "en": "ORS + zinc kit"}, "weight_kg": 0.2, "needs_doctor": False},
    "mnp_taburia": {"name": {"id": "Taburia (bubuk multivitamin, 30 sachet)", "en": "Micronutrient powder (30 sachets)"}, "weight_kg": 0.1, "needs_doctor": False},
    "kelor_powder": {"name": {"id": "Bubuk daun kelor 100 g", "en": "Moringa leaf powder 100 g"}, "weight_kg": 0.1, "needs_doctor": False},
    "vitamin_a": {"name": {"id": "Kapsul vitamin A", "en": "Vitamin A capsule"}, "weight_kg": 0.01, "needs_doctor": False},
    "deworming": {"name": {"id": "Obat cacing (albendazol)", "en": "Deworming tablet (albendazole)"}, "weight_kg": 0.01, "needs_doctor": True},
}

_ACTIONS = {
    "go_facility_now": {"id": "Segera bawa anak ke Puskesmas atau rumah sakit terdekat sekarang.", "en": "Take the child to the nearest Puskesmas or hospital now."},
    "keep_breastfeeding": {"id": "Tetap berikan ASI/minum sedikit-sedikit tapi sering selama perjalanan.", "en": "Keep breastfeeding / giving small frequent sips on the way."},
    "doctor_48h": {"id": "Jadwalkan konsultasi dokter dalam 48 jam. Kader akan membantu rujukan.", "en": "Book a doctor consultation within 48 hours. The Kader will help with the referral."},
    "kader_visit": {"id": "Kader akan melakukan kunjungan rumah dalam 7 hari untuk pengukuran ulang dan konseling gizi.", "en": "A Kader will visit within 7 days to re-measure and give feeding counselling."},
    "posyandu_monthly": {"id": "Lanjutkan penimbangan dan pengukuran rutin setiap bulan di Posyandu.", "en": "Continue monthly weighing and measuring at the Posyandu."},
    "follow_nutrition_plan": {"id": "Ikuti rencana gizi mingguan di aplikasi.", "en": "Follow the weekly nutrition plan in the app."},
    "ors_zinc": {"id": "Berikan oralit setiap kali BAB cair dan zinc 1x sehari selama 10 hari.", "en": "Give ORS after every loose stool and zinc once daily for 10 days."},
    "remeasure_2w": {"id": "Ukur ulang tinggi dan berat dalam 2 minggu untuk memastikan tren.", "en": "Re-measure height and weight in 2 weeks to confirm the trend."},
    "pickup_supplies": {"id": "Paket gizi akan disiapkan di loker N.E.X.U.S. terdekat. Anda akan menerima kode pengambilan.", "en": "A nutrition package will be prepared at the nearest N.E.X.U.S. locker. You will receive a pickup code."},
}


def _a(code: str, lang: str) -> dict:
    return {"code": code, "text": _ACTIONS[code]["id" if lang == "id" else "en"]}


def triage(
    risk_level: str,
    danger_signs: list[str],
    symptoms: list[str],
    z: dict,
    trend: dict,
    age_months: float,
    intake: dict | None = None,
    lang: str = "id",
) -> dict:
    intake = intake or {}
    # Oedema of both feet is a sign of severe acute malnutrition (IMCI): refer now, like a danger sign.
    if danger_signs or z.get("oedema"):
        urgency, referral = "emergency", "emergency"
    elif risk_level == "high":
        urgency, referral = "doctor_48h", "doctor"
    elif risk_level == "medium":
        urgency, referral = "kader_7d", "kader"
    else:
        urgency, referral = "routine", "none"

    actions: list[dict] = []
    if urgency == "emergency":
        actions += [_a("go_facility_now", lang), _a("keep_breastfeeding", lang)]
    elif urgency == "doctor_48h":
        actions.append(_a("doctor_48h", lang))
    elif urgency == "kader_7d":
        actions.append(_a("kader_visit", lang))
    else:
        actions.append(_a("posyandu_monthly", lang))
    if "diarrhea" in symptoms:
        actions.append(_a("ors_zinc", lang))
    if trend.get("status") in ("declining", "projected_stunting"):
        actions.append(_a("remeasure_2w", lang))
    actions.append(_a("follow_nutrition_plan", lang))

    supplies: list[dict] = []
    whz, haz = z.get("whz"), z.get("haz")
    if "diarrhea" in symptoms:
        supplies.append({"item_key": "ors_zinc", "quantity": 1})
    if whz is not None and whz < -3:
        supplies.append({"item_key": "rutf", "quantity": 2})
    elif (whz is not None and whz < -2) or risk_level == "high":
        supplies.append({"item_key": "pmt_biscuit", "quantity": 2})
    elif risk_level == "medium":
        supplies.append({"item_key": "pmt_biscuit", "quantity": 1})
    if risk_level in ("medium", "high") and 6 <= age_months < 24 and (intake.get("mdd_met") is False or intake.get("days_logged", 0) == 0):
        supplies.append({"item_key": "mnp_taburia", "quantity": 1})
    if risk_level in ("medium", "high") and age_months >= 6 and "kelor_powder" not in [s["item_key"] for s in supplies]:
        supplies.append({"item_key": "kelor_powder", "quantity": 1})
    if supplies and urgency != "emergency":
        actions.insert(1, _a("pickup_supplies", lang))

    return {
        "urgency": urgency,
        "referral": referral,
        "escalate": urgency != "routine",
        "actions": actions,
        "supplies": [
            {**s, "name": SUPPLY_CATALOG[s["item_key"]]["name"]["id" if lang == "id" else "en"],
             "needs_doctor": SUPPLY_CATALOG[s["item_key"]]["needs_doctor"]}
            for s in supplies
        ],
        "disclaimer": {
            "id": "Hasil ini adalah dukungan keputusan, bukan diagnosis medis. Keputusan akhir ada pada tenaga kesehatan.",
            "en": "This is decision support, not a medical diagnosis. Final decisions rest with a health professional.",
        }["id" if lang == "id" else "en"],
    }
