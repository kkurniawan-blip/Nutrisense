import pytest

from app.ai import llm, nutrition, symptoms
from app.ai.risk_model import RiskModel, generate_synthetic_cohort, train
from app.ai.triage import triage


@pytest.fixture(scope="module")
def trained():
    return train()


def test_model_quality(trained):
    m = trained.metrics
    # Predicting from risk factors alone (no height, no z-scores) is harder than re-reading height-for-age.
    assert m["f1_macro"] > 0.65
    assert m["false_negative_rate_high"] < 0.3
    assert len(m["confusion_matrix"]["matrix"]) == 3


def test_model_never_uses_child_size_or_region():
    from app.ai.risk_model import EXCLUDED_INPUTS, FEATURE_NAMES

    assert not EXCLUDED_INPUTS & set(FEATURE_NAMES)
    assert "regional_prevalence" not in FEATURE_NAMES


def test_cohort_resembles_ntt():
    X, y, haz = generate_synthetic_cohort(n=3000, return_haz=True)
    stunted = (haz < -2).mean()
    assert 0.25 < stunted < 0.45
    assert X.shape[1] == len(RiskModel.vectorize({}))


HEALTHY = {"age_months": 20, "sex_male": 1, "low_birth_weight": 0, "premature": 0, "exclusive_breastfeeding": 1, "weight_not_gaining": 0,
           "diarrhea": 0, "fever": 0, "respiratory": 0, "repeated_infection": 0, "poor_appetite": 0, "dietary_diversity": 6,
           "animal_protein_days": 6, "immunization_complete": 1, "mother_short": 0, "mother_kek": 0, "clean_water": 1, "sanitation": 1,
           "rural": 0}


def test_guardrails_raise_level(trained):
    model = RiskModel(trained.model)
    healthy = HEALTHY
    assert model.predict(healthy).risk_level == "low"
    p = model.predict(healthy, danger_signs=["convulsions"])
    assert p.risk_level == "high" and p.guardrail == "danger_signs_present" and p.needs_review
    # The WHO status raises the level after the model; it is not a model input.
    assert model.predict(healthy, who_status={"haz": -3.4}).risk_level == "high"
    assert model.predict(healthy, who_status={"oedema": True}).risk_level == "high"
    assert model.predict({**healthy, "haz": -3.4}).risk_level == "low"


@pytest.mark.parametrize("who,extra,level,guardrail", [
    # WHO 2006 / Permenkes 2/2020: WHZ < -2 wasted, < -3 severely wasted; HAZ < -3 severely stunted.
    ({"whz": -2.4}, {}, "medium", "wasted_minimum_medium"),
    ({"whz": -3.2}, {}, "high", "severe_stunting_or_wasting"),
    ({"haz": -3.1}, {}, "high", "severe_stunting_or_wasting"),
    ({"haz": -2.5}, {}, "medium", "stunted_minimum_medium"),
    # WHO 2013 / Kemenkes 2019: child MUAC (6-59 months) < 12.5 cm moderate, < 11.5 cm severe.
    ({"muac_cm": 12.0}, {}, "medium", "wasted_minimum_medium"),
    ({"muac_cm": 11.2}, {}, "high", "severe_stunting_or_wasting"),
    ({"muac_cm": 11.2}, {"age_months": 4}, "low", None),  # MUAC cut-offs apply from 6 months
    # Kemenkes 2020 (Buku KIA): 2T, no weight gain at two weighings in a row.
    ({}, {"weight_not_gaining": 2}, None, None),
])
def test_who_overrides(trained, who, extra, level, guardrail):
    model = RiskModel(trained.model)
    p = model.predict({**HEALTHY, **extra}, who_status=who)
    if level is None:  # 2T: at least medium, whatever the model says
        assert p.risk_level in ("medium", "high") and "2t" in p.overrides
        return
    assert p.risk_level == level and p.guardrail == guardrail
    if guardrail:
        assert p.overrides and p.needs_review


def test_overrides_never_lower(trained):
    model = RiskModel(trained.model)
    sick = {**HEALTHY, "low_birth_weight": 1, "weight_not_gaining": 2, "diarrhea": 1, "repeated_infection": 1, "dietary_diversity": 1,
            "animal_protein_days": 0, "mother_kek": 1, "mother_short": 1, "sanitation": 0, "clean_water": 0}
    assert model.predict(sick).risk_level == "high"
    assert model.predict(sick, who_status={"whz": -2.5, "haz": 0.5}).risk_level == "high"


def test_missing_and_impossible_inputs_are_explicit(trained):
    from app.ai.risk_model import clean_features, population_mean

    clean, missing, rejected = clean_features({**HEALTHY, "dietary_diversity": 9, "animal_protein_days": -1, "age_months": 75,
                                               "low_birth_weight": None})
    assert set(rejected) == {"dietary_diversity", "animal_protein_days", "age_months"} and missing == ["low_birth_weight"]
    assert clean["dietary_diversity"] is None
    assert clean_features({**HEALTHY, "age_months": 60.4})[0]["age_months"] == 60.0  # a few days past 5 years: clipped
    # Missing is imputed with the cohort average, never as zero or "healthy".
    v = RiskModel.vectorize({})
    assert (v == population_mean()).all() and v[2] > 0
    model = RiskModel(trained.model)
    p = model.predict({**HEALTHY, "dietary_diversity": None, "animal_protein_days": None})
    assert p.incomplete and "dietary_diversity" in p.missing_inputs
    assert all(c["feature"] not in ("dietary_diversity", "animal_protein_days") for c in p.contributions)
    # Review is needed when plausible values for the missing key inputs would change the level.
    unknown = {k: None for k in ("dietary_diversity", "animal_protein_days", "low_birth_weight", "exclusive_breastfeeding")}
    p = model.predict({**HEALTHY, **unknown})
    assert p.incomplete and p.missing_changes_level and p.needs_review
    p = model.predict({**HEALTHY, "dietary_diversity": 12})
    assert p.needs_review and p.rejected_inputs == ["dietary_diversity"]
    assert not model.predict(HEALTHY).incomplete


def test_model_comparison_is_stored(trained):
    m = trained.metrics
    c = m["model_comparison"]
    for name in ("logistic_regression", "random_forest"):
        assert {"mean", "sd"} <= set(c[name]["f1_macro"]) and c[name]["false_negative_rate_high"]["mean"] < 0.3
    # The shipped model wins on macro F1 and is calibrated; the decision rule for "high" is unchanged (argmax).
    assert c["logistic_regression"]["f1_macro"]["mean"] >= c["random_forest"]["f1_macro"]["mean"]
    assert c["logistic_regression"]["ece"]["mean"] < 0.05 and m["selection"]["holds"]
    assert m["baseline"]["name"] == "random_forest" and "baseline_logistic_regression" in m
    assert len(m["high_threshold_options"]) == 2 and set(m["groups"]) >= {"rural", "urban", "boys", "girls"}


def test_model_card_notes_are_honest(trained):
    from app.ai.risk_model import model_card_notes

    notes = model_card_notes(trained.metrics)
    assert "Synthetic data" in notes and "assumptions" in notes and "not evidence" in notes and "random forest" in notes and "±" in notes


def test_explanations_point_to_drivers(trained):
    model = RiskModel(trained.model)
    p = model.predict({"age_months": 24, "low_birth_weight": 1, "weight_not_gaining": 2, "diarrhea": 1, "repeated_infection": 1,
                       "clean_water": 0, "sanitation": 0, "dietary_diversity": 2, "animal_protein_days": 1, "mother_kek": 1})
    assert p.risk_level == "high"
    assert p.contributions[0]["contribution"] > 0
    assert {c["feature"] for c in p.contributions[:4]} & {"weight_not_gaining", "dietary_diversity", "low_birth_weight"}


@pytest.mark.parametrize("text,expected", [
    ("Anak saya mencret 3 hari dan tidak mau makan", {"diarrhea", "poor_appetite"}),
    ("demam tinggi dan kejang tadi malam", {"fever", "high_fever", "convulsions"}),
    ("batuk pilek, napas cepat", {"cough", "runny_nose", "fast_breathing"}),
    ("kaki bengkak dan makin kurus", {"oedema", "weight_loss"}),
    ("my child has diarrhea and won't drink", {"diarrhea", "unable_to_drink"}),
])
def test_symptom_lexicon(text, expected):
    assert expected <= set(symptoms.interpret_rules(text)["symptoms"])


# How mothers actually write: "-nya" suffixes, slang, word order, hyphens, English.
@pytest.mark.parametrize("text,expected", [
    ("badannya panas sejak kemarin dan napasnya cepat sekali", {"fever", "fast_breathing"}),
    ("napasnya cepet bgt", {"fast_breathing"}),
    ("cepat sekali napasnya dari tadi", {"fast_breathing"}),
    ("nafasnya berat dan ngos-ngosan", {"fast_breathing"}),
    ("anak saya susah bernafas", {"fast_breathing"}),
    ("tidak demam tapi sesak", {"fast_breathing"}),
    ("he is breathing very fast", {"fast_breathing"}),
    ("my daughter struggles to breathe", {"fast_breathing"}),
    ("dia rewel terus dan BAB-nya cair", {"diarrhea"}),
    ("pupnya encer 5x sehari", {"diarrhea"}),
    ("buang air besar terus dari pagi", {"diarrhea"}),
    ("pupnya encer dan ada darahnya", {"diarrhea", "bloody_stool"}),
    ("his poop is watery", {"diarrhea"}),
    ("kejangnya sudah berhenti tapi tadi lama", {"convulsions"}),
    ("tadi malam badannya kaku dan matanya mendelik", {"convulsions"}),
    ("anaknya lemas sekali dan susah dibangunkan", {"lethargy"}),
    ("dia gak mau makan, lemes bgt", {"poor_appetite", "lethargy"}),
    ("tidak mau makan dan minum sejak kemarin", {"poor_appetite", "unable_to_drink"}),
    ("sudah tidak mau menyusu", {"unable_to_drink"}),
    ("dia tidak mau ASI", {"unable_to_drink"}),
    ("muntah terus setiap habis minum", {"vomiting", "vomits_everything"}),
    ("kakinya bengkak dua-duanya", {"oedema"}),
    ("mukanya sembab", {"oedema"}),
    ("suhu 39,5 derajat", {"fever", "high_fever"}),
    ("demamnya tinggi sekali", {"fever", "high_fever"}),
    ("anak GTM seminggu ini", {"poor_appetite"}),
    ("panaaas badannya", {"fever"}),
])
def test_symptom_real_phrasings(text, expected):
    assert expected <= set(symptoms.interpret_rules(text)["symptoms"])


# Negated, resolved or unrelated statements must not raise a finding (least of all a danger sign).
@pytest.mark.parametrize("text,absent", [
    ("tidak demam, tidak sesak", {"fever", "fast_breathing"}),
    ("napasnya tidak cepat", {"fast_breathing"}),
    ("anak tidak napas cepat", {"fast_breathing"}),
    ("tidak pernah kejang", {"convulsions"}),
    ("no fever, eating well", {"fever", "poor_appetite"}),
    ("he is not breathing fast", {"fast_breathing"}),
    ("sudah tidak ASI lagi, sekarang minum susu sapi", {"unable_to_drink"}),
    ("sudah tidak menyusu, makannya banyak", {"unable_to_drink", "poor_appetite"}),
    ("susah minum obat", {"unable_to_drink"}),
    ("tidak rewel dan makan lahap", {"poor_appetite"}),
    ("demamnya sudah turun", {"fever"}),
    ("diarenya sudah sembuh", {"diarrhea"}),
    ("tidak ada batuk pilek", {"cough", "runny_nose"}),
    ("berat badannya naik, tidak kurus", {"weight_loss"}),
])
def test_symptom_negation_and_resolution(text, absent):
    assert not absent & set(symptoms.interpret_rules(text)["symptoms"])


@pytest.mark.parametrize("text,days", [
    ("mencret sejak kemarin", 1), ("demam dua hari", 2), ("batuk seminggu", 7), ("fever for 3 days", 3), ("diare dari kemarin lusa", 2),
])
def test_symptom_duration(text, days):
    assert symptoms.interpret_rules(text)["duration_days"] == days


def test_danger_sign_from_free_text_reaches_the_report():
    r = symptoms.interpret("badannya panas sejak kemarin dan napasnya cepat sekali")
    assert "fast_breathing" in r["danger_signs"] and r["interpreted_by"] == "rules"


def test_symptom_duration_and_danger():
    r = symptoms.interpret("BAB cair sudah dua hari, anak lemas sekali", lang="id")
    assert r["duration_days"] == 2
    assert "lethargy" in r["danger_signs"]
    assert r["interpreted_by"] == "rules"


def test_claude_output_is_merged_not_trusted_alone(monkeypatch):
    monkeypatch.setattr(llm, "complete_json", lambda *a, **k: {
        "symptoms": ["cough"], "duration_days": None, "appetite": "reduced", "summary": "Batuk.", "other_concerns": []})
    r = symptoms.interpret("anak kejang dan batuk")
    # Claude missed the convulsion; the rule layer still catches the danger sign.
    assert {"cough", "convulsions"} <= set(r["symptoms"])
    assert "convulsions" in r["danger_signs"]
    assert r["interpreted_by"] == "claude+rules"


def test_triage_tiers():
    z = {"haz": -2.4, "waz": -1.8, "whz": -1.0}
    assert triage("high", ["convulsions"], ["convulsions"], z, {}, 20)["urgency"] == "emergency"
    t = triage("high", [], ["diarrhea"], z, {"status": "declining"}, 20)
    assert t["urgency"] == "doctor_48h"
    assert {"ors_zinc", "pmt_biscuit"} <= {s["item_key"] for s in t["supplies"]}
    assert triage("low", [], [], {"haz": 0, "whz": 0}, {}, 20)["escalate"] is False
    assert triage("medium", [], [], {"haz": -1.5, "whz": -3.2}, {}, 30)["supplies"][0]["item_key"] == "rutf"


def test_meal_nutrients_and_diversity():
    items, totals, groups = nutrition.compute_meal([{"food_key": "telur"}, {"food_key": "nasi", "grams": 100}])
    assert totals["protein_g"] == pytest.approx(12.6 * 0.5 + 2.7, abs=0.1)
    assert set(groups) == {"eggs", "grains_roots"}


def test_recommendation_rule_based_offline():
    r = nutrition.recommend({"age_months": 14, "sex": "female", "haz": -2.2, "whz": -1.0, "symptoms": ["diarrhea"]},
                            {"gaps": ["iron_mg"], "dietary_diversity": 3, "mdd_met": False}, "high", "en")
    assert r["generated_by"] == "rules"
    assert r["recipes"] and all(x["min_age_months"] <= 14 for x in r["recipes"])
    assert any("ORS" in t for t in r["tips"])


def test_llm_disabled_without_key():
    assert llm.is_enabled() is False
    assert llm.complete_json("s", "u", {"type": "object"}) is None


def test_recipes_are_easy_and_use_everyday_foods():
    from app.ai.recipes import RECIPES

    assert len(RECIPES) >= 15
    for r in RECIPES:
        assert all(f in nutrition.FOODS for f in r["foods"]), r["key"]
        assert r["cost"] in (1, 2) and r["minutes"] <= 40
        assert len(r["steps"]["id"]) <= 3 and len(r["steps"]["en"]) == len(r["steps"]["id"])
        assert r["ingredients"]["id"] and len(r["ingredients"]["id"]) == len(r["ingredients"]["en"])
        # No expensive or instant foods in the menu suggester.
        assert not {"mie", "biskuit", "daging_sapi"} & set(r["foods"])


def test_menu_suggester_fills_missing_groups():
    r = nutrition.suggest_menus(14, ["grains_roots"], ["iron_mg"], "en", use_ai=False)
    assert len(r["suggestions"]) == 3
    added = {g for s in r["suggestions"] for g in s["adds_groups"]}
    assert len(added) >= 4  # suggestions are diverse, not three variants of the same dish
    assert all(s["min_age_months"] <= 14 and s["minutes"] <= 40 for s in r["suggestions"])
    assert nutrition.suggest_menus(4, [], [], "en", use_ai=False)["suggestions"] == []
    baby = nutrition.suggest_menus(7, [], [], "en", use_ai=False)
    assert all(s["min_age_months"] <= 7 for s in baby["suggestions"])


def test_eta_text_reads_as_hours():
    from app.services.logistics import eta_text
    assert eta_text(45.4) == "45 menit"
    assert eta_text(755) == "12 jam 35 menit"
    assert eta_text(120) == "2 jam"


def test_triage_uses_child_muac():
    t = triage("high", [], [], {"muac_cm": 11.0}, {}, 18)
    assert any(s["item_key"] == "rutf" for s in t["supplies"])
    t = triage("medium", [], [], {"muac_cm": 12.2}, {}, 18)
    assert any(s["item_key"] == "pmt_biscuit" and s["quantity"] == 2 for s in t["supplies"])
    assert not any(s["item_key"] == "rutf" for s in triage("low", [], [], {"muac_cm": 11.0}, {}, 4)["supplies"])


def test_override_and_missing_data_reasons_are_plain(trained):
    from app.ai.risk_model import clean_features
    from app.services.assessment import reasons

    model = RiskModel(trained.model)
    feats = {**HEALTHY, "dietary_diversity": None, "animal_protein_days": None, "low_birth_weight": None, "exclusive_breastfeeding": None}
    who = {"haz": -1.0, "whz": -2.4, "waz": -1.5, "muac_cm": 12.1, "oedema": False, "haz_velocity": 0.0}
    pred = model.predict(feats, who_status=who)
    clean, _, rejected = clean_features(feats)
    ctx = {"features": feats, "clean": clean, "rejected": rejected, "who": who, "trend": {}, "danger_signs": []}
    codes = {r["code"]: r["text"] for r in reasons(ctx, "id", pred)}
    assert pred.risk_level == "medium" and pred.model_level == "low"
    assert "raised" in codes and "BB/TB di bawah -2 SD" in codes["raised"] and "LiLA" in codes["raised"]
    assert {"whz_wasted", "muac_low", "incomplete"} <= set(codes)
    assert codes["incomplete"].startswith("Data belum lengkap") and "catatan makan" in codes["incomplete"]
    assert "Data incomplete" in {r["code"]: r["text"] for r in reasons(ctx, "en", pred)}["incomplete"]
