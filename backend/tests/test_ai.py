import pytest

from app.ai import llm, nutrition, symptoms
from app.ai.risk_model import RiskModel, generate_synthetic_cohort, train
from app.ai.triage import triage


@pytest.fixture(scope="module")
def trained():
    return train()


def test_model_quality(trained):
    m = trained.metrics
    assert m["f1_macro"] > 0.8
    assert m["false_negative_rate_high"] < 0.2
    assert len(m["confusion_matrix"]["matrix"]) == 3
    assert "haz" in list(trained.feature_importances)[:3]


def test_cohort_resembles_ntt():
    X, y = generate_synthetic_cohort(n=3000)
    stunted = (X[:, 2] < -2).mean()
    assert 0.25 < stunted < 0.45


def test_guardrails_raise_level(trained):
    model = RiskModel(trained.model)
    healthy = {"age_months": 20, "haz": 0.3, "waz": 0.2, "whz": 0.1, "dietary_diversity": 6, "animal_protein_days": 6}
    assert model.predict(healthy).risk_level == "low"
    p = model.predict(healthy, danger_signs=["convulsions"])
    assert p.risk_level == "high" and p.guardrail == "danger_signs_present" and p.needs_review
    severe = model.predict({**healthy, "haz": -3.4, "waz": -2.5})
    assert severe.risk_level == "high"


def test_explanations_point_to_drivers(trained):
    model = RiskModel(trained.model)
    p = model.predict({"age_months": 24, "haz": -2.5, "waz": -2.0, "whz": -0.9, "haz_velocity": -0.08, "diarrhea": 1,
                       "clean_water": 0, "sanitation": 0, "dietary_diversity": 2, "animal_protein_days": 1})
    assert p.risk_level == "high"
    assert p.contributions[0]["contribution"] > 0
    assert {c["feature"] for c in p.contributions[:3]} & {"haz", "waz", "haz_velocity"}


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
