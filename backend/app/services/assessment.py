"""End-to-end assessment pipeline (process flow, Figure 3.3.2):

measurement / symptoms -> z-scores -> growth trend -> features -> classify() -> guardrails
-> triage -> nutrition recommendation -> case escalation -> supply request -> notifications -> audit.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..ai import kia, nutrition, risk_model, trend
from ..ai.symptoms import symptom_label
from ..ai.growth import age_in_months, classify_haz, classify_whz
from ..ai.triage import triage
from ..config import get_settings
from ..models import (BreastfeedingLog, Case, Child, KiaRecord, MaternalMeasurement, MealLog, NutritionRecommendation, Pregnancy,
                      RiskAssessment, SupplyRequest, SymptomReport, User)
from . import model_registry
from .common import audit, notify, notify_roles

settings = get_settings()

ILLNESS = {"diarrhea", "fever", "high_fever", "cough", "fast_breathing", "vomiting", "rash", "bloody_stool"}


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _slope(points: list[tuple[float, float]]) -> float:
    pts = [(a, v) for a, v in points if v is not None]
    if len(pts) < 2:
        return 0.0
    recent = [(a, v) for a, v in pts if pts[-1][0] - a <= 12][-6:]
    if len(recent) < 2 or recent[-1][0] - recent[0][0] < 1:
        return 0.0
    return float(np.polyfit([a for a, _ in recent], [v for _, v in recent], 1)[0])


def build_context(db: Session, child: Child, lang: str = "id") -> dict:
    ms = child.measurements
    latest = ms[-1] if ms else None
    now = datetime.now(timezone.utc)
    reports = db.scalars(
        select(SymptomReport).where(SymptomReport.child_id == child.id, SymptomReport.created_at >= now - timedelta(days=90))
        .order_by(SymptomReport.created_at.desc())
    ).all()
    recent = [r for r in reports if _aware(r.created_at) >= now - timedelta(days=14)]
    recent_symptoms = sorted({s for r in recent for s in r.symptoms})
    danger = sorted({s for r in recent[:1] for s in r.danger_signs})  # only the newest report can trigger an emergency
    illness_reports = sum(1 for r in reports if set(r.symptoms) & ILLNESS)
    meals = db.scalars(select(MealLog).where(MealLog.child_id == child.id, MealLog.eaten_at >= now - timedelta(days=7))).all()
    age_now = age_in_months(child.birth_date, date.today())
    intake = nutrition.analyse_intake(meals, age_now, lang=lang)

    points_haz = [(m.age_months, m.haz) for m in ms]
    growth_trend = trend.growth_trend(points_haz, child.sex) if ms else {"status": "no_data"}
    region = child.region
    days = intake["days_logged"]

    # Birth, feeding, immunisation and the mother: known before any measurement of the child's size.
    given = {r.item_key: r.given_at for r in db.scalars(select(KiaRecord).where(KiaRecord.child_id == child.id)).all()}
    asi_logs = db.scalars(select(BreastfeedingLog).where(BreastfeedingLog.child_id == child.id)).all()
    if asi_logs and age_now < kia.ASI_EXCLUSIVE_MONTHS:
        ebf = 0.0 if any(not g.asi_only for g in asi_logs) else 1.0
    else:
        ebf = None if child.exclusive_breastfeeding is None else float(child.exclusive_breastfeeding)
    preg = db.scalar(select(Pregnancy).where(Pregnancy.child_id == child.id))
    mother_short = mother_kek = None
    if preg is not None:
        mother_short = None if preg.mother_height_cm is None else float(preg.mother_height_cm < 150)
        muacs = [m.muac_cm for m in db.scalars(select(MaternalMeasurement).where(MaternalMeasurement.pregnancy_id == preg.id)).all()
                 if m.muac_cm is not None]
        mother_kek = float(any(v < 23.5 for v in muacs)) if muacs else None
    weights = [(m.measured_at, m.age_months, m.weight_kg) for m in ms]

    # Model inputs only. The child's height and z-scores are NOT here (see risk_model.py); they are kept in `who`.
    features = {
        "age_months": latest.age_months if latest else age_now,
        "sex_male": 1.0 if child.sex == "male" else 0.0,
        "low_birth_weight": None if child.birth_weight_kg is None else float(child.birth_weight_kg < 2.5),
        "premature": None if child.birth_gestational_weeks is None else float(child.birth_gestational_weeks < 37),
        "exclusive_breastfeeding": ebf,
        "weight_not_gaining": float(kia.not_gaining(weights)),
        "diarrhea": float(bool({"diarrhea", "bloody_stool"} & set(recent_symptoms))),
        "fever": float(bool({"fever", "high_fever"} & set(recent_symptoms))),
        "respiratory": float(bool({"cough", "fast_breathing"} & set(recent_symptoms))),
        "repeated_infection": float(illness_reports >= 2 or "repeated_illness" in recent_symptoms),
        "poor_appetite": float("poor_appetite" in recent_symptoms),
        "dietary_diversity": intake["dietary_diversity"] if days else None,
        "animal_protein_days": round(intake["animal_source_days"] / days * 7, 1) if days else None,
        "immunization_complete": kia.immunization_complete(child.birth_date, given),
        "mother_short": mother_short,
        "mother_kek": mother_kek,
        "clean_water": float(child.clean_water_access),
        "sanitation": float(child.sanitation_access),
        "rural": float(region.rural) if region else 1.0,
    }
    imputed = [k for k, v in features.items() if v is None]
    who = {"haz": latest.haz if latest else None, "waz": latest.waz if latest else None, "whz": latest.whz if latest else None,
           "haz_velocity": round(_slope(points_haz), 4), "oedema": bool(latest and latest.oedema)}
    return {"features": features, "who": who, "imputed": imputed, "latest": latest, "trend": growth_trend, "intake": intake,
            "recent_symptoms": recent_symptoms, "danger_signs": danger, "age_now": age_now}


_R = {
    "haz_severe": ("Tinggi badan menurut umur sangat pendek (TB/U {v:+.1f} SD)", "Height-for-age is severely low (HAZ {v:+.1f})"),
    "haz_stunted": ("Tinggi badan menurut umur di bawah -2 SD / stunting (TB/U {v:+.1f})", "Height-for-age is below -2 SD / stunted (HAZ {v:+.1f})"),
    "haz_risk": ("Tinggi badan di bawah rata-rata, mendekati batas stunting (TB/U {v:+.1f})", "Height is below average and approaching the stunting line (HAZ {v:+.1f})"),
    "whz_wasted": ("Berat badan menurut tinggi rendah / gizi kurang (BB/TB {v:+.1f})", "Weight-for-height is low / wasted (WHZ {v:+.1f})"),
    "waz_under": ("Berat badan menurut umur rendah (BB/U {v:+.1f})", "Weight-for-age is low (WAZ {v:+.1f})"),
    "velocity": ("Pertumbuhan tinggi melambat ({v:+.2f} SD per bulan)", "Height growth is slowing ({v:+.2f} SD per month)"),
    "projected": ("Diproyeksikan turun di bawah -2 SD dalam 6 bulan jika tren berlanjut", "Projected to fall below -2 SD within 6 months if the trend continues"),
    "diarrhea": ("Diare dalam 2 minggu terakhir", "Diarrhoea in the last 2 weeks"),
    "fever": ("Demam dalam 2 minggu terakhir", "Fever in the last 2 weeks"),
    "repeated": ("Sakit berulang dalam 3 bulan terakhir", "Repeated illness in the last 3 months"),
    "appetite": ("Nafsu makan menurun", "Poor appetite"),
    "diversity": ("Keragaman makanan rendah ({v:.1f} dari 8 kelompok)", "Low dietary diversity ({v:.1f} of 8 food groups)"),
    "protein": ("Protein hewani jarang ({v:.0f} hari/minggu)", "Animal-source food is infrequent ({v:.0f} days/week)"),
    "water": ("Akses air bersih terbatas", "Limited access to clean water"),
    "sanitation": ("Sanitasi/jamban belum layak", "No improved sanitation"),
    "lbw": ("Berat lahir rendah (< 2,5 kg)", "Low birth weight (< 2.5 kg)"),
    "premature": ("Lahir kurang bulan (< 37 minggu)", "Born early (< 37 weeks)"),
    "no_ebf": ("Belum ASI eksklusif", "Not exclusively breastfed"),
    "two_t": ("Berat tidak naik 2 kali berturut-turut (2T)", "No weight gain at two weighings in a row (2T)"),
    "one_t": ("Berat tidak naik di penimbangan terakhir (T)", "No weight gain at the last weighing (T)"),
    "imm": ("Imunisasi belum lengkap", "Immunisation not complete"),
    "mother_kek": ("Ibu KEK saat hamil", "Mother had KEK in pregnancy"),
    "mother_short": ("Tinggi ibu < 150 cm", "Mother's height < 150 cm"),
    "oedema": ("Bengkak di kedua kaki (tanda gizi buruk)", "Swelling of both feet (a sign of severe malnutrition)"),
    "danger": ("Ada tanda bahaya: {v}", "Danger signs reported: {v}"),
    "none": ("Pertumbuhan dalam batas normal", "Growth is within the normal range"),
}


def _reason(key: str, lang: str, v=None) -> dict:
    text = _R[key][0 if lang == "id" else 1]
    return {"code": key, "text": text.format(v=v) if v is not None else text}


def reasons(ctx: dict, lang: str) -> list[dict]:
    f, w, out = ctx["features"], ctx["who"], []
    if ctx["danger_signs"]:
        out.append(_reason("danger", lang, ", ".join(symptom_label(k, lang) for k in ctx["danger_signs"])))
    if w.get("oedema"):
        out.append(_reason("oedema", lang))
    haz, whz, waz = w["haz"], w["whz"], w["waz"]
    if haz is not None:
        if haz < -3:
            out.append(_reason("haz_severe", lang, haz))
        elif haz < -2:
            out.append(_reason("haz_stunted", lang, haz))
        elif haz < -1:
            out.append(_reason("haz_risk", lang, haz))
    if whz is not None and whz < -2:
        out.append(_reason("whz_wasted", lang, whz))
    if waz is not None and waz < -2:
        out.append(_reason("waz_under", lang, waz))
    if ctx["trend"].get("status") == "projected_stunting":
        out.append(_reason("projected", lang))
    elif w["haz_velocity"] < trend.DECLINE_THRESHOLD:
        out.append(_reason("velocity", lang, w["haz_velocity"]))
    if f["weight_not_gaining"] >= 2:
        out.append(_reason("two_t", lang))
    elif f["weight_not_gaining"] == 1:
        out.append(_reason("one_t", lang))
    if f["diarrhea"]:
        out.append(_reason("diarrhea", lang))
    if f["fever"]:
        out.append(_reason("fever", lang))
    if f["repeated_infection"]:
        out.append(_reason("repeated", lang))
    if f["poor_appetite"]:
        out.append(_reason("appetite", lang))
    if f["dietary_diversity"] is not None:
        if f["dietary_diversity"] < 4:
            out.append(_reason("diversity", lang, f["dietary_diversity"]))
        if f["animal_protein_days"] < 3:
            out.append(_reason("protein", lang, f["animal_protein_days"]))
    if f["exclusive_breastfeeding"] == 0:
        out.append(_reason("no_ebf", lang))
    if f["immunization_complete"] == 0:
        out.append(_reason("imm", lang))
    if not f["clean_water"]:
        out.append(_reason("water", lang))
    if not f["sanitation"]:
        out.append(_reason("sanitation", lang))
    if f["low_birth_weight"]:
        out.append(_reason("lbw", lang))
    if f["premature"]:
        out.append(_reason("premature", lang))
    if f["mother_kek"]:
        out.append(_reason("mother_kek", lang))
    if f["mother_short"]:
        out.append(_reason("mother_short", lang))
    return out or [_reason("none", lang)]


PRIORITY = {"emergency": "emergency", "doctor_48h": "high", "kader_7d": "medium", "routine": "low"}


def run_assessment(db: Session, child: Child, actor: User, lang: str = "id", measurement_id: int | None = None,
                   symptom_report_id: int | None = None, use_ai: bool = True) -> RiskAssessment:
    ctx = build_context(db, child, lang)
    if ctx["latest"] is None and not ctx["danger_signs"]:
        raise ValueError("Record at least one growth measurement before running a risk assessment")

    model = model_registry.get_active(db)
    pred = model.predict(ctx["features"], ctx["danger_signs"], settings.review_confidence_threshold, who_status=ctx["who"])
    z = {k: ctx["who"][k] for k in ("haz", "waz", "whz", "oedema")}
    tri = triage(pred.risk_level, ctx["danger_signs"], ctx["recent_symptoms"], z, ctx["trend"], ctx["age_now"], ctx["intake"], lang)

    assessment = RiskAssessment(
        child_id=child.id,
        measurement_id=measurement_id or (ctx["latest"].id if ctx["latest"] else None),
        symptom_report_id=symptom_report_id,
        model_run_id=model.model_run_id,
        risk_level=pred.risk_level,
        probabilities=pred.probabilities,
        confidence=pred.confidence,
        needs_review=pred.needs_review,
        guardrail=pred.guardrail,
        explanation=pred.contributions,
        reasons=reasons(ctx, lang),
        triage=tri,
        trend=ctx["trend"],
        # Model inputs, plus the WHO status shown next to the risk (never fed to the model).
        features={**ctx["features"], **z, "imputed": ctx["imputed"], "model_level": pred.model_level,
                  "model_inputs": list(risk_model.FEATURE_NAMES), "haz_class": classify_haz(z["haz"]), "whz_class": classify_whz(z["whz"])},
    )
    db.add(assessment)
    db.flush()

    reco = nutrition.recommend(
        {"age_months": ctx["age_now"], "sex": child.sex, "name": child.name, "haz": z["haz"], "whz": z["whz"],
         "symptoms": ctx["recent_symptoms"]},
        ctx["intake"], pred.risk_level, lang, use_ai=use_ai,
    )
    db.add(NutritionRecommendation(child_id=child.id, assessment_id=assessment.id, content=reco, generated_by=reco["generated_by"]))

    case = None
    if tri["escalate"] or pred.needs_review:
        case = db.scalar(select(Case).where(Case.child_id == child.id, Case.status.in_(["open", "in_progress", "referred"])))
        priority = PRIORITY[tri["urgency"]] if tri["escalate"] else "low"
        if case is None:
            case = Case(child_id=child.id, assessment_id=assessment.id, status="open", priority=priority,
                        urgency=tri["urgency"], assigned_to_id=child.kader_id)
            db.add(case)
        else:
            case.assessment_id, case.urgency = assessment.id, tri["urgency"]
            order = ["low", "medium", "high", "emergency"]
            case.priority = max(case.priority, priority, key=order.index)
        db.flush()
        title = {"emergency": ("DARURAT", "EMERGENCY"), "high": ("Risiko tinggi", "High risk"), "medium": ("Perlu kunjungan", "Visit needed"),
                 "low": ("Perlu tinjauan", "Review needed")}[case.priority]
        notify_roles(db, ["kader", "officer", "doctor"] if case.priority in ("high", "emergency") else ["kader", "officer"],
                     child.region_id, "case_escalated", {"id": f"{title[0]}: {child.name}", "en": f"{title[1]}: {child.name}"},
                     {code: "; ".join(r["text"] for r in reasons(ctx, code)[:3]) for code in ("id", "en")}, case_id=case.id, child_id=child.id)

    if tri["supplies"] and tri["urgency"] != "emergency":
        open_req = db.scalar(select(SupplyRequest).where(
            SupplyRequest.child_id == child.id,
            SupplyRequest.status.in_(["pending_approval", "awaiting_stock", "in_transit", "ready_for_pickup"])))
        if open_req is None:
            db.add(SupplyRequest(child_id=child.id, case_id=case.id if case else None, requested_by_id=actor.id,
                                 items=[{"item_key": s["item_key"], "quantity": s["quantity"]} for s in tri["supplies"]],
                                 urgency=tri["urgency"], status="pending_approval"))

    first_step = {code: triage(pred.risk_level, ctx["danger_signs"], ctx["recent_symptoms"], z, ctx["trend"], ctx["age_now"],
                               ctx["intake"], code)["actions"][0]["text"] for code in ("id", "en")}
    notify(db, child.caregiver_id, "assessment", {"id": f"Hasil pemeriksaan {child.name}", "en": f"{child.name}'s assessment"},
           first_step, assessment_id=assessment.id, child_id=child.id, risk_level=pred.risk_level)
    audit(db, actor, "risk_assessment", "child", child.id, assessment_id=assessment.id, risk=pred.risk_level,
          confidence=pred.confidence, guardrail=pred.guardrail, model_run_id=model.model_run_id)
    db.commit()
    db.refresh(assessment)
    return assessment
