"""NutriScan kitchen: from foods on hand to the best easy, cheap dish for the child."""
from app.ai import kitchen
from app.ai.recipes import RECIPES


def test_best_dish_uses_what_the_mother_has():
    r = kitchen.recipes_from_foods(["telur", "bayam", "nasi"], age_months=20, lang="id", use_ai=False)
    best = r["best"]
    assert {h["key"] for h in best["have"]} >= {"telur", "bayam"}
    assert best["need_cost_idr"] <= 1000  # little or nothing extra to buy
    assert best["steps"] and best["ingredients"]
    assert any("Telur" in b["text"] for b in best["benefits"])
    assert len(r["others"]) == 2 and all(o["key"] != best["key"] for o in r["others"])


def test_protein_rich_dish_beats_a_plain_one():
    # With only rice and a banana at home, the suggestion should still add an affordable protein.
    best = kitchen.recipes_from_foods(["nasi", "pisang"], age_months=24, use_ai=False)["best"]
    protein_sources = {"telur", "ikan", "ikan_teri", "hati_ayam", "tempe", "tahu", "kacang_hijau"}
    assert protein_sources & set(best["foods"])
    assert best["need"] and all(n["price_idr"] <= 5000 for n in best["need"])


def test_only_age_appropriate_recipes():
    by_key = {r["key"]: r for r in RECIPES}
    r = kitchen.recipes_from_foods(["tempe", "tahu", "bayam"], age_months=8, use_ai=False)
    for card in [r["best"], *r["others"]]:
        assert by_key[card["key"]]["min_age"] <= 8


def test_baby_gets_a_dish_from_the_same_foods_in_baby_texture():
    best = kitchen.recipes_from_foods(["tempe", "bayam", "nasi"], age_months=7, use_ai=False)["best"]
    assert {"tempe", "bayam"} <= {h["key"] for h in best["have"]}
    assert best["need"] == []  # rice porridge is cooked from the rice she has


def test_under_six_months_is_breast_milk_only():
    r = kitchen.recipes_from_foods(["telur"], age_months=4, use_ai=False)
    assert r["best"] is None and "ASI" in r["age_note"]


def test_instant_noodles_get_a_better_cheap_choice():
    r = kitchen.recipes_from_foods(["mie", "telur"], age_months=30, use_ai=False)
    assert r["swaps"] and r["swaps"][0]["key"] == "mie"
    assert "mie" not in r["best"]["foods"]


def test_unknown_foods_are_ignored_and_free_greens_cost_nothing():
    r = kitchen.recipes_from_foods(["pizza", "daun_kelor"], age_months=18, lang="en", use_ai=False)
    assert [d["key"] for d in r["detected"]] == ["daun_kelor"]
    kelor = [n for c in [r["best"], *r["others"]] for n in c["need"] if n["key"] == "daun_kelor"]
    assert all(n["price_idr"] == 0 for n in kelor)
    assert "estimates" in r["price_note"]


def test_endpoint_returns_ranked_recipes(client, auth):
    h = auth("ibu.maria@nutrisense.id")
    kid = client.get("/api/children", headers=h).json()[0]
    r = client.post(f"/api/children/{kid['id']}/nutriscan/recipes", headers=h, json={"food_keys": ["telur", "daun_kelor", "nasi"]})
    assert r.status_code == 200
    body = r.json()
    assert body["child_name"] == kid["name"].split(" ")[0]
    assert body["best"]["have"] and body["best"]["steps"]
    assert body["generated_by"] in ("rules", "claude+rules")
