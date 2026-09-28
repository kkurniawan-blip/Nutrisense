"""NutriScan kitchen: from the foods a mother has (seen in a photo or picked by hand) to the most
nutritious easy dish she can cook for her child today, what little she still needs to buy, and how.

Ranking favours, in order: using what is already at home, nutrition for this child's age (and the
nutrients the child has been short of this week), a low extra cost, and a short cooking time.

Prices are rough estimates of one child portion at village markets and kiosks in East Nusa Tenggara,
rounded to Rp 500, and are shown to mothers as estimates only.
"""
from __future__ import annotations

from . import llm
from .nutrition import FOODS, NUTRIENT_LABELS, NUTRIENTS, PANTRY, _MENU_SCHEMA, _RECO_SYSTEM, _age_ok, recipe_view, requirements
from .recipes import RECIPES

# Estimated price (Rp) of one child portion, and where it is usually found.
PRICE_IDR = {
    "nasi": 1000, "bubur_beras": 1000, "jagung": 1000, "singkong": 1000, "roti": 2000, "mie": 3500, "pmt_biskuit": 0,
    "ubi_jalar": 1000, "telur": 2500, "ikan": 4000, "ikan_teri": 1500, "ayam": 5000, "hati_ayam": 2500,
    "daging_sapi": 9000, "daging_babi": 6000, "tempe": 1000, "tahu": 1000, "kacang_hijau": 1000, "kacang_tanah": 1000,
    "daun_kelor": 0, "bayam": 1000, "daun_singkong": 0, "wortel": 1000, "labu": 1000, "pepaya": 1000, "mangga": 1500,
    "pisang": 1000, "jeruk": 1500, "sayur_sop": 1500, "susu": 3500, "asi": 0, "biskuit": 2000,
}
_WHERE = {
    "daun_kelor": ("petik di kebun atau minta tetangga", "pick from a garden or ask a neighbour"),
    "daun_singkong": ("petik di kebun atau minta tetangga", "pick from a garden or ask a neighbour"),
    "pmt_biskuit": ("gratis dari Posyandu", "free from the Posyandu"),
    "ikan": ("pasar atau penjual ikan", "market or fish seller"),
    "ikan_teri": ("pasar atau warung", "market or kiosk"),
    "hati_ayam": ("pasar", "market"),
}
_DEFAULT_WHERE = ("warung atau pasar", "kiosk or market")

# Why a food is good for a growing child, in plain words.
BENEFIT = {
    "telur": ("Telur: protein untuk tumbuh tinggi dan otak", "Egg: protein for growing tall and for the brain"),
    "ikan": ("Ikan: protein dan lemak baik untuk tumbuh", "Fish: protein and good fats for growth"),
    "ikan_teri": ("Ikan teri: kalsium untuk tulang dan gigi", "Anchovy: calcium for bones and teeth"),
    "hati_ayam": ("Hati ayam: zat besi, mencegah kurang darah", "Chicken liver: iron, prevents anaemia"),
    "ayam": ("Ayam: protein untuk otot dan tumbuh", "Chicken: protein for muscles and growth"),
    "daging_sapi": ("Daging: zat besi dan zinc untuk tumbuh", "Meat: iron and zinc for growth"),
    "daging_babi": ("Daging: protein untuk tumbuh", "Meat: protein for growth"),
    "tempe": ("Tempe: protein murah dan bergizi", "Tempeh: cheap, nourishing protein"),
    "tahu": ("Tahu: protein dan kalsium", "Tofu: protein and calcium"),
    "kacang_hijau": ("Kacang hijau: protein dan tenaga", "Mung beans: protein and energy"),
    "kacang_tanah": ("Kacang: tenaga dan protein", "Peanuts: energy and protein"),
    "daun_kelor": ("Daun kelor: zat besi, kalsium dan vitamin A", "Moringa: iron, calcium and vitamin A"),
    "bayam": ("Bayam: zat besi dan vitamin A", "Spinach: iron and vitamin A"),
    "daun_singkong": ("Daun singkong: zat besi dan vitamin A", "Cassava leaves: iron and vitamin A"),
    "wortel": ("Wortel: vitamin A untuk mata dan daya tahan", "Carrot: vitamin A for eyes and immunity"),
    "labu": ("Labu kuning: vitamin A untuk daya tahan", "Pumpkin: vitamin A for immunity"),
    "ubi_jalar": ("Ubi oranye: tenaga dan vitamin A", "Orange sweet potato: energy and vitamin A"),
    "pepaya": ("Pepaya: vitamin A dan melancarkan BAB", "Papaya: vitamin A and helps digestion"),
    "pisang": ("Pisang: tenaga dan manis alami tanpa gula", "Banana: energy and natural sweetness"),
    "jagung": ("Jagung: tenaga untuk bermain", "Corn: energy for play"),
    "nasi": ("Nasi: tenaga", "Rice: energy"),
    "susu": ("Susu: kalsium untuk tulang", "Milk: calcium for bones"),
}
# Protein and iron sources first: they matter most for stunting.
_BENEFIT_ORDER = ["hati_ayam", "telur", "ikan", "ikan_teri", "daging_sapi", "ayam", "daging_babi", "tempe", "tahu", "daun_kelor",
                  "bayam", "daun_singkong", "kacang_hijau", "susu", "wortel", "labu", "ubi_jalar", "pepaya", "kacang_tanah",
                  "pisang", "jagung", "nasi"]

# Common but low-value foods, with a cheap better choice.
SWAPS = {
    "mie": ("Mi instan sedikit gizinya dan banyak garam untuk anak. Harga yang sama bisa untuk nasi atau jagung "
            "dengan telur atau tempe, yang jauh lebih bergizi.",
            "Instant noodles give a child little nutrition and a lot of salt. The same money buys rice or corn with an "
            "egg or tempeh, which is far more nourishing."),
    "biskuit": ("Biskuit dan jajanan manis membuat kenyang tapi sedikit gizinya. Untuk camilan, coba pisang, ubi rebus "
                "atau telur rebus.",
                "Biscuits and sweet snacks fill up a child without much nutrition. For snacks try banana, boiled sweet "
                "potato or a boiled egg."),
}

# Foods made from one another at home: rice porridge is cooked from rice.
_SAME_INGREDIENT = {"nasi": {"bubur_beras"}, "bubur_beras": {"nasi"}}

_HIGHLIGHT = {
    "protein_g": ("Tinggi protein", "High in protein"), "iron_mg": ("Kaya zat besi", "Rich in iron"),
    "vitamin_a_mcg": ("Kaya vitamin A", "Rich in vitamin A"), "calcium_mg": ("Tinggi kalsium", "High in calcium"),
    "zinc_mg": ("Kaya zinc", "Rich in zinc"), "energy_kcal": ("Banyak tenaga", "Energy-rich"),
}
# Protein, iron and zinc matter most for linear growth.
_WEIGHT = {"protein_g": 1.5, "iron_mg": 1.5, "zinc_mg": 1.2, "vitamin_a_mcg": 1.0, "calcium_mg": 1.0, "energy_kcal": 0.6}


def _name(key: str, L: str) -> str:
    f = FOODS[key]
    return f["name_id"] if L == "id" else f["name_en"]


def _share_of_need(r: dict, age: float) -> dict[str, float]:
    """Percent of the child's daily need that one portion of the recipe provides, per nutrient."""
    req = requirements(age)
    totals = {n: 0.0 for n in NUTRIENTS}
    for key in r["foods"]:
        f = FOODS.get(key)
        if not f or key == "asi":
            continue
        for n in NUTRIENTS:
            totals[n] += f["per100"][n] * f["portion_g"] / 100
    return {n: 100 * totals[n] / req[n] for n in NUTRIENTS if req[n]}


def _nutrition_score(share: dict[str, float], gaps: list[str]) -> float:
    return sum(min(share[n], 60) / 60 * (_WEIGHT[n] + (1.0 if n in gaps else 0.0)) for n in share)


def _card(r: dict, have: set[str], age: float, gaps: list[str], L: str) -> dict:
    i = 0 if L == "id" else 1
    foods = [f for f in r["foods"] if f in FOODS and f != "asi"]
    share = _share_of_need(r, age)
    need = [{"key": k, "name": _name(k, L), "price_idr": PRICE_IDR.get(k, 1000), "where": _WHERE.get(k, _DEFAULT_WHERE)[i]}
            for k in foods if k not in have]
    benefits = [{"key": k, "text": BENEFIT[k][i]} for k in _BENEFIT_ORDER if k in foods and k in BENEFIT][:3]
    highlights = [_HIGHLIGHT[n][i] for n in sorted(share, key=lambda n: -share[n] * _WEIGHT[n]) if share[n] >= 25][:3]
    return {
        **recipe_view(r, L),
        "have": [{"key": k, "name": _name(k, L)} for k in foods if k in have],
        "need": need,
        "need_cost_idr": sum(x["price_idr"] for x in need),
        "total_cost_idr": sum(PRICE_IDR.get(k, 1000) for k in foods),
        "benefits": benefits,
        "highlights": highlights,
        "nutrition_score": round(_nutrition_score(share, gaps), 2),
        "percent_of_daily_need": {NUTRIENT_LABELS[n][L]: round(v) for n, v in share.items()},
    }


def recipes_from_foods(food_keys: list[str], age_months: float, gaps: list[str] | None = None, lang: str = "id",
                       limit: int = 3, use_ai: bool = True) -> dict:
    """Best easy dishes for this child from the foods on hand. Unknown keys are ignored."""
    L = lang if lang in ("id", "en") else "en"
    i = 0 if L == "id" else 1
    gaps = gaps or []
    have = {k for k in food_keys if k in FOODS}
    for k in list(have):
        have |= _SAME_INGREDIENT.get(k, set())
    detected = [{"key": k, "name": _name(k, L)} for k in dict.fromkeys(food_keys) if k in FOODS]
    swaps = [{"key": k, "text": SWAPS[k][i]} for k in SWAPS if k in have]
    base = {"detected": detected, "swaps": swaps, "ai_ideas": [], "generated_by": "rules",
            "price_note": ("Harga perkiraan di pasar/warung NTT, bisa berbeda. Bumbu dapur (bawang, minyak, garam "
                           "sedikit) dianggap sudah ada.",
                           "Prices are rough estimates for NTT markets and kiosks and may differ. Kitchen basics "
                           "(shallot, oil, a little salt) are assumed.")[i]}
    if age_months < 6:
        return {**base, "best": None, "others": [],
                "age_note": ("Si kecil belum 6 bulan: cukup ASI saja, tanpa makanan atau minuman lain.",
                             "Under 6 months: breast milk only, no other food or drink.")[i]}

    def score(r: dict) -> float:
        foods = {f for f in r["foods"] if f in FOODS and f != "asi"}
        need = foods - have
        return (2.5 * len(foods & have) + _nutrition_score(_share_of_need(r, age_months), gaps)
                - 0.8 * len(need) - sum(PRICE_IDR.get(k, 1000) for k in need) / 3000 - r["minutes"] / 20)

    ranked = sorted((r for r in RECIPES if _age_ok(r, age_months)), key=score, reverse=True)[:limit]
    cards = [_card(r, have, age_months, gaps, L) for r in ranked]
    result = {**base, "age_note": None, "best": cards[0] if cards else None, "others": cards[1:]}

    if use_ai and have:
        on_hand = ", ".join(_name(k, "id") for k in have)
        ai = llm.complete_json(
            _RECO_SYSTEM,
            (
                f"Write in {'Bahasa Indonesia' if L == 'id' else 'English'}. Child age: {age_months:.0f} months. "
                f"A low-income mother has these foods at home: {on_hand}. Nutrients the child has been short of: "
                f"{', '.join(gaps) or 'unknown'}.\n"
                "Suggest 1 dish that uses mostly these foods and gives the child the most protein, iron and vitamin A. "
                f"Hard rules: at most 20 minutes; a pot, pan or steamer only; add at most one cheap everyday food; pantry "
                f"basics allowed: {PANTRY[L]}. Texture must suit the age, no honey under 12 months, no whole nuts, no added "
                "sugar, very little salt. Household measures. 3-4 short steps. `why` = one sentence a mother understands."
            ),
            _MENU_SCHEMA,
            max_tokens=2500,
        )
        if ai:
            result["ai_ideas"] = [x for x in ai.get("ideas", []) if x.get("minutes", 99) <= 25][:1]
            result["generated_by"] = "claude+rules" if result["ai_ideas"] else "rules"
    return result
