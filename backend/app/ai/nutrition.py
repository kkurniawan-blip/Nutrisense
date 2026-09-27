"""Nutrition intelligence: local food database, NutriScan (photo -> foods), dietary-diversity and
nutrient-gap analysis against Indonesian AKG 2019, and personalised recommendations.

Food composition values are per 100 g edible portion and are approximations compiled from the
Indonesian Food Composition Table (TKPI) and USDA FoodData Central; they are intended for
education and screening, not for clinical dietetics.
"""
from __future__ import annotations

import base64
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from . import llm

# WHO minimum dietary diversity (MDD) food groups for children 6-23 months.
FOOD_GROUPS = {
    "breast_milk": {"id": "ASI", "en": "Breast milk"},
    "grains_roots": {"id": "Serealia, umbi", "en": "Grains, roots, tubers"},
    "pulses_nuts": {"id": "Kacang-kacangan", "en": "Pulses, nuts, seeds"},
    "dairy": {"id": "Susu & olahannya", "en": "Dairy"},
    "flesh": {"id": "Daging, ikan, jeroan", "en": "Meat, fish, organ meat"},
    "eggs": {"id": "Telur", "en": "Eggs"},
    "vita_fruit_veg": {"id": "Buah & sayur kaya vitamin A", "en": "Vitamin-A rich fruit & veg"},
    "other_fruit_veg": {"id": "Buah & sayur lain", "en": "Other fruit & veg"},
}

NUTRIENTS = ["energy_kcal", "protein_g", "iron_mg", "zinc_mg", "vitamin_a_mcg", "calcium_mg"]

# key: (name_id, name_en, group, kcal, protein, iron, zinc, vitA RAE, calcium, typical toddler portion g)
_FOODS = [
    ("nasi", "Nasi putih", "Cooked white rice", "grains_roots", 130, 2.7, 0.2, 0.5, 0, 10, 100),
    ("bubur_beras", "Bubur nasi", "Rice porridge", "grains_roots", 50, 1.0, 0.1, 0.2, 0, 3, 150),
    ("jagung", "Jagung rebus / jagung bose", "Boiled corn", "grains_roots", 96, 3.4, 0.5, 0.6, 9, 3, 80),
    ("singkong", "Singkong rebus", "Boiled cassava", "grains_roots", 160, 1.4, 0.3, 0.3, 1, 16, 80),
    ("roti", "Roti", "Bread", "grains_roots", 265, 8.0, 2.5, 0.8, 0, 150, 40),
    ("mie", "Mi instan (matang)", "Instant noodles (cooked)", "grains_roots", 138, 3.0, 1.1, 0.3, 0, 10, 80),
    ("pmt_biskuit", "Biskuit PMT Kemenkes", "Government PMT biscuit (fortified)", "grains_roots", 450, 10.0, 7.0, 4.0, 400, 300, 40),
    ("ubi_jalar", "Ubi jalar oranye", "Orange sweet potato", "vita_fruit_veg", 86, 1.6, 0.6, 0.3, 709, 30, 80),
    ("telur", "Telur ayam rebus", "Boiled egg", "eggs", 155, 12.6, 1.2, 1.1, 149, 50, 50),
    ("ikan", "Ikan (tongkol/kembung)", "Fish (mackerel/tuna)", "flesh", 150, 22.0, 1.0, 0.7, 30, 30, 40),
    ("ikan_teri", "Ikan teri", "Dried anchovy", "flesh", 330, 33.0, 3.9, 3.0, 47, 1200, 10),
    ("ayam", "Daging ayam", "Chicken", "flesh", 239, 27.0, 1.3, 1.9, 13, 15, 40),
    ("hati_ayam", "Hati ayam", "Chicken liver", "flesh", 167, 24.0, 11.6, 4.0, 3980, 11, 25),
    ("daging_sapi", "Daging sapi", "Beef", "flesh", 250, 26.0, 2.6, 6.3, 0, 18, 40),
    ("daging_babi", "Daging babi", "Pork", "flesh", 242, 27.0, 0.9, 2.4, 2, 19, 40),
    ("tempe", "Tempe", "Tempeh", "pulses_nuts", 193, 19.0, 2.7, 1.1, 0, 111, 40),
    ("tahu", "Tahu", "Tofu", "pulses_nuts", 80, 8.0, 1.6, 0.8, 0, 200, 50),
    ("kacang_hijau", "Kacang hijau", "Mung beans", "pulses_nuts", 105, 7.0, 1.4, 0.8, 1, 27, 50),
    ("kacang_tanah", "Kacang tanah", "Peanuts", "pulses_nuts", 567, 26.0, 4.6, 3.3, 0, 92, 15),
    ("daun_kelor", "Daun kelor", "Moringa leaves", "vita_fruit_veg", 64, 9.4, 4.0, 0.6, 378, 185, 30),
    ("bayam", "Bayam", "Spinach", "vita_fruit_veg", 23, 3.0, 2.7, 0.5, 469, 99, 40),
    ("daun_singkong", "Daun singkong", "Cassava leaves", "vita_fruit_veg", 73, 6.2, 2.0, 0.5, 300, 165, 40),
    ("wortel", "Wortel", "Carrot", "vita_fruit_veg", 41, 0.9, 0.3, 0.2, 835, 33, 30),
    ("labu", "Labu kuning", "Pumpkin", "vita_fruit_veg", 26, 1.0, 0.8, 0.3, 426, 21, 50),
    ("pepaya", "Pepaya", "Papaya", "vita_fruit_veg", 43, 0.5, 0.3, 0.1, 47, 20, 80),
    ("mangga", "Mangga", "Mango", "vita_fruit_veg", 60, 0.8, 0.2, 0.1, 54, 11, 80),
    ("pisang", "Pisang", "Banana", "other_fruit_veg", 89, 1.1, 0.3, 0.2, 3, 5, 80),
    ("jeruk", "Jeruk", "Orange", "other_fruit_veg", 47, 0.9, 0.1, 0.1, 11, 40, 80),
    ("sayur_sop", "Sayur sop (kol, buncis)", "Vegetable soup", "other_fruit_veg", 30, 1.5, 0.5, 0.2, 60, 30, 80),
    ("susu", "Susu sapi / UHT", "Cow's milk", "dairy", 61, 3.2, 0.03, 0.4, 46, 113, 200),
    ("asi", "ASI (menyusu)", "Breast milk (feed)", "breast_milk", 70, 1.0, 0.03, 0.17, 61, 32, 120),
    ("biskuit", "Biskuit / camilan", "Biscuit / snack", "grains_roots", 450, 7.0, 2.0, 0.5, 0, 50, 20),
]
FOODS: dict[str, dict] = {
    k: {"key": k, "name_id": nid, "name_en": nen, "group": g, "portion_g": p,
        "per100": dict(zip(NUTRIENTS, (kcal, prot, fe, zn, va, ca)))}
    for k, nid, nen, g, kcal, prot, fe, zn, va, ca, p in _FOODS
}

# Angka Kecukupan Gizi (Permenkes No. 28/2019) per day.
AKG = [
    (0, 6, {"energy_kcal": 550, "protein_g": 9, "iron_mg": 0.3, "zinc_mg": 1.1, "vitamin_a_mcg": 375, "calcium_mg": 200}),
    (6, 12, {"energy_kcal": 800, "protein_g": 15, "iron_mg": 11, "zinc_mg": 3, "vitamin_a_mcg": 400, "calcium_mg": 270}),
    (12, 48, {"energy_kcal": 1350, "protein_g": 20, "iron_mg": 7, "zinc_mg": 3, "vitamin_a_mcg": 400, "calcium_mg": 650}),
    (48, 61, {"energy_kcal": 1400, "protein_g": 25, "iron_mg": 10, "zinc_mg": 5, "vitamin_a_mcg": 450, "calcium_mg": 1000}),
]

RECIPES = [
    {"key": "bubur_jagung_kelor", "min_age": 6, "foods": ["jagung", "daun_kelor", "telur"], "targets": ["iron_mg", "protein_g", "vitamin_a_mcg"],
     "name": {"id": "Bubur jagung kelor telur", "en": "Corn porridge with moringa and egg"},
     "steps": {"id": "Rebus jagung pipil hingga lunak, haluskan. Masukkan segenggam daun kelor dan 1 butir telur kocok, aduk hingga matang. Saring/haluskan untuk bayi 6-8 bulan.",
               "en": "Boil corn kernels until soft and mash. Stir in a handful of moringa leaves and one beaten egg until cooked. Strain or mash smooth for babies 6-8 months."}},
    {"key": "puree_ubi", "min_age": 6, "foods": ["ubi_jalar", "asi"], "targets": ["vitamin_a_mcg", "energy_kcal"],
     "name": {"id": "Puree ubi jalar oranye", "en": "Orange sweet potato puree"},
     "steps": {"id": "Kukus ubi jalar oranye, haluskan dengan sedikit ASI atau air matang hingga lembut.",
               "en": "Steam orange sweet potato and mash with a little breast milk or boiled water until smooth."}},
    {"key": "nasi_tim_hati", "min_age": 8, "foods": ["nasi", "hati_ayam", "wortel"], "targets": ["iron_mg", "zinc_mg", "vitamin_a_mcg", "protein_g"],
     "name": {"id": "Nasi tim hati ayam wortel", "en": "Steamed rice with chicken liver and carrot"},
     "steps": {"id": "Tim beras dengan kaldu ayam. Tumis hati ayam cincang dan wortel parut dengan sedikit minyak, campurkan ke nasi tim. Hati ayam cukup 1-2 kali seminggu.",
               "en": "Steam rice in chicken broth. Sauté minced chicken liver and grated carrot in a little oil, then mix in. Liver 1-2 times a week is enough."}},
    {"key": "bubur_kacang_hijau", "min_age": 8, "foods": ["kacang_hijau", "susu"], "targets": ["protein_g", "energy_kcal", "calcium_mg"],
     "name": {"id": "Bubur kacang hijau", "en": "Mung bean porridge"},
     "steps": {"id": "Rendam kacang hijau semalam, rebus hingga pecah dan lunak. Haluskan, tambahkan sedikit santan atau susu. Kurangi gula.",
               "en": "Soak mung beans overnight, boil until soft, mash, and add a little coconut milk or milk. Keep sugar low."}},
    {"key": "telur_dadar_kelor", "min_age": 9, "foods": ["telur", "daun_kelor"], "targets": ["protein_g", "iron_mg", "vitamin_a_mcg"],
     "name": {"id": "Telur dadar kelor", "en": "Moringa omelette"},
     "steps": {"id": "Kocok 1 telur dengan daun kelor cincang, masak dengan sedikit minyak hingga matang sempurna. Potong kecil-kecil.",
               "en": "Beat one egg with chopped moringa leaves and cook through in a little oil. Cut into small pieces."}},
    {"key": "jagung_bose_ikan", "min_age": 12, "foods": ["jagung", "kacang_hijau", "ikan"], "targets": ["protein_g", "energy_kcal", "zinc_mg"],
     "name": {"id": "Jagung bose dengan ikan", "en": "Jagung bose (NTT corn & bean stew) with fish"},
     "steps": {"id": "Masak jagung bose (jagung tumbuk dan kacang) seperti biasa hingga lunak. Sajikan dengan ikan kuah atau ikan bakar yang durinya sudah dibuang.",
               "en": "Cook jagung bose (pounded corn with beans) until soft. Serve with boneless fish in broth or grilled fish."}},
    {"key": "tempe_tahu_bayam", "min_age": 12, "foods": ["tempe", "tahu", "bayam", "nasi"], "targets": ["protein_g", "iron_mg", "calcium_mg"],
     "name": {"id": "Nasi, tempe-tahu kukus dan sayur bayam", "en": "Rice with steamed tempeh-tofu and spinach"},
     "steps": {"id": "Kukus tempe dan tahu, potong kecil. Masak bayam bening. Sajikan dengan nasi lembek.",
               "en": "Steam tempeh and tofu and cut small. Cook a clear spinach soup. Serve with soft rice."}},
    {"key": "sup_ikan_labu", "min_age": 12, "foods": ["ikan", "labu", "nasi"], "targets": ["protein_g", "vitamin_a_mcg"],
     "name": {"id": "Sup ikan kuah kuning dengan labu", "en": "Yellow fish soup with pumpkin"},
     "steps": {"id": "Rebus ikan dengan bumbu kuning (kunyit, bawang) dan potongan labu kuning hingga lunak. Pastikan duri dibuang.",
               "en": "Simmer fish with turmeric-shallot spice and pumpkin pieces until soft. Remove all bones."}},
]

NUTRIENT_LABELS = {
    "energy_kcal": {"id": "Energi", "en": "Energy", "unit": "kkal"},
    "protein_g": {"id": "Protein", "en": "Protein", "unit": "g"},
    "iron_mg": {"id": "Zat besi", "en": "Iron", "unit": "mg"},
    "zinc_mg": {"id": "Zinc", "en": "Zinc", "unit": "mg"},
    "vitamin_a_mcg": {"id": "Vitamin A", "en": "Vitamin A", "unit": "mcg"},
    "calcium_mg": {"id": "Kalsium", "en": "Calcium", "unit": "mg"},
}


def requirements(age_months: float) -> dict:
    for lo, hi, req in AKG:
        if lo <= age_months < hi:
            return dict(req)
    return dict(AKG[-1][2])


def food_list(lang: str = "id") -> list[dict]:
    return [
        {"key": f["key"], "name": f["name_id"] if lang == "id" else f["name_en"], "group": f["group"],
         "group_name": FOOD_GROUPS[f["group"]][lang if lang in ("id", "en") else "en"], "portion_g": f["portion_g"], "per100": f["per100"]}
        for f in FOODS.values()
    ]


def compute_meal(items: list[dict]) -> tuple[list[dict], dict, list[str]]:
    """items: [{food_key, grams?}] -> (normalised items, nutrient totals, food groups)."""
    totals = {n: 0.0 for n in NUTRIENTS}
    groups: set[str] = set()
    out = []
    for it in items:
        food = FOODS.get(it.get("food_key", ""))
        if not food:
            out.append({"food_key": it.get("food_key", "other"), "name": it.get("name") or "?", "grams": it.get("grams") or 0, "known": False})
            continue
        grams = float(it.get("grams") or food["portion_g"])
        for n in NUTRIENTS:
            totals[n] += food["per100"][n] * grams / 100
        groups.add(food["group"])
        out.append({"food_key": food["key"], "name": food["name_id"], "grams": round(grams), "known": True})
    return out, {n: round(v, 1) for n, v in totals.items()}, sorted(groups)


def analyse_intake(meals: list, age_months: float, days: int = 7, lang: str = "id") -> dict:
    """meals: MealLog-like objects (eaten_at, nutrients, food_groups) from the last `days` days."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    per_day_nutrients: dict = defaultdict(lambda: {n: 0.0 for n in NUTRIENTS})
    per_day_groups: dict = defaultdict(set)
    for m in meals:
        eaten = m.eaten_at if m.eaten_at.tzinfo else m.eaten_at.replace(tzinfo=timezone.utc)
        if eaten < since:
            continue
        day = eaten.date().isoformat()
        for n in NUTRIENTS:
            per_day_nutrients[day][n] += float((m.nutrients or {}).get(n, 0))
        per_day_groups[day].update(m.food_groups or [])

    req = requirements(age_months)
    n_days = len(per_day_nutrients)
    if n_days == 0:
        return {"days_logged": 0, "requirements": req, "average": None, "percent_of_need": None, "gaps": [],
                "dietary_diversity": None, "mdd_met": None}
    avg = {n: round(sum(d[n] for d in per_day_nutrients.values()) / n_days, 1) for n in NUTRIENTS}
    pct = {n: round(100 * avg[n] / req[n]) if req[n] else None for n in NUTRIENTS}
    diversity = round(sum(len(g) for g in per_day_groups.values()) / n_days, 1)
    gaps = [n for n in NUTRIENTS if pct[n] is not None and pct[n] < 70]
    return {
        "days_logged": n_days,
        "requirements": req,
        "average": avg,
        "percent_of_need": pct,
        "gaps": gaps,
        "gap_labels": [NUTRIENT_LABELS[g][lang if lang in ("id", "en") else "en"] for g in gaps],
        "dietary_diversity": diversity,
        "mdd_met": diversity >= 5,
        "animal_source_days": sum(1 for g in per_day_groups.values() if g & {"flesh", "eggs", "dairy"}),
    }


def _foods_for(nutrient: str, limit: int = 4) -> list[str]:
    ranked = sorted(
        (f for f in FOODS.values() if f["key"] not in ("asi", "biskuit", "mie", "pmt_biskuit")),
        key=lambda f: -f["per100"][nutrient] * f["portion_g"] / 100,
    )
    return [f["key"] for f in ranked[:limit]]


_RECO_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["headline", "tips", "meal_plan", "cautions"],
    "properties": {
        "headline": {"type": "string"},
        "tips": {"type": "array", "items": {"type": "string"}},
        "meal_plan": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["meal", "menu", "why"],
                "properties": {"meal": {"type": "string"}, "menu": {"type": "string"}, "why": {"type": "string"}},
            },
        },
        "cautions": {"type": "array", "items": {"type": "string"}},
    },
}

_RECO_SYSTEM = (
    "You are a paediatric nutrition educator supporting caregivers and posyandu cadres in rural East Nusa "
    "Tenggara, Indonesia. Write practical, affordable advice using foods available locally (corn, cassava, "
    "moringa/kelor, fish, eggs, tempeh, mung beans, pumpkin, papaya). Follow WHO infant and young child "
    "feeding guidance: continued breastfeeding to 2 years, age-appropriate texture and frequency, responsive "
    "feeding, hygiene, and no promotion of breast-milk substitutes. Do not diagnose or prescribe medicine; when "
    "risk is high, remind the caregiver to follow up with the Kader or health worker. Keep each tip to one "
    "or two short sentences a caregiver with basic literacy can follow."
)


def recommend(child_ctx: dict, intake: dict, risk_level: str | None, lang: str = "id", use_ai: bool = True) -> dict:
    """Rule-based recommendation, optionally personalised by Claude. child_ctx: {age_months, sex, name, haz, whz, symptoms}."""
    age = child_ctx["age_months"]
    L = lang if lang in ("id", "en") else "en"
    gaps = intake.get("gaps") or []
    focus = gaps or ["protein_g", "iron_mg", "vitamin_a_mcg"]

    priority_foods = []
    for n in focus:
        for k in _foods_for(n):
            if k not in priority_foods:
                priority_foods.append(k)
    recipes = [r for r in RECIPES if r["min_age"] <= age and (set(r["targets"]) & set(focus))][:4]

    tips: list[str] = []
    if age < 6:
        tips.append({"id": "Berikan ASI eksklusif sampai usia 6 bulan, sesering yang bayi mau (minimal 8x sehari).",
                     "en": "Exclusively breastfeed until 6 months, on demand (at least 8 times a day)."}[L])
    else:
        meals_per_day = "2-3" if age < 9 else "3-4"
        tips.append({"id": f"Berikan makan {meals_per_day} kali sehari ditambah 1-2 selingan, dan lanjutkan ASI sampai 2 tahun.",
                     "en": f"Give {meals_per_day} meals a day plus 1-2 snacks, and continue breastfeeding to 2 years."}[L])
        tips.append({"id": "Setiap hari usahakan ada sumber protein hewani: telur, ikan, atau hati ayam.",
                     "en": "Include an animal-source food every day: egg, fish, or chicken liver."}[L])
    if intake.get("dietary_diversity") is not None and not intake.get("mdd_met"):
        tips.append({"id": f"Keragaman makanan baru {intake['dietary_diversity']} dari 8 kelompok. Targetkan minimal 5 kelompok per hari.",
                     "en": f"Dietary diversity is {intake['dietary_diversity']} of 8 groups. Aim for at least 5 groups a day."}[L])
    if "diarrhea" in (child_ctx.get("symptoms") or []):
        tips.append({"id": "Saat diare, teruskan makan dan ASI, berikan oralit dan zinc 10 hari sesuai anjuran petugas.",
                     "en": "During diarrhoea keep feeding and breastfeeding, and give ORS and zinc for 10 days as advised."}[L])
    if (child_ctx.get("whz") is not None and child_ctx["whz"] < -2) or risk_level == "high":
        tips.append({"id": "Anak perlu pemeriksaan petugas kesehatan. Ikuti jadwal PMT/RUTF yang diberikan.",
                     "en": "The child needs a health-worker check. Follow the PMT/RUTF plan you are given."}[L])
    tips.append({"id": "Cuci tangan dengan sabun sebelum menyiapkan makanan dan sebelum menyuapi anak.",
                 "en": "Wash hands with soap before preparing food and before feeding the child."}[L])

    result = {
        "headline": {"id": "Rencana gizi untuk minggu ini", "en": "This week's nutrition plan"}[L],
        "daily_targets": requirements(age),
        "intake": intake,
        "focus_nutrients": [{"key": n, "label": NUTRIENT_LABELS[n][L]} for n in focus],
        "priority_foods": [{"key": k, "name": FOODS[k]["name_id"] if L == "id" else FOODS[k]["name_en"],
                            "portion_g": FOODS[k]["portion_g"]} for k in priority_foods[:8]],
        "recipes": [{"key": r["key"], "name": r["name"][L], "steps": r["steps"][L], "min_age_months": r["min_age"],
                     "foods": r["foods"], "targets": [NUTRIENT_LABELS[t][L] for t in r["targets"]]} for r in recipes],
        "tips": tips,
        "meal_plan": [],
        "cautions": [],
        "generated_by": "rules",
    }

    if not use_ai:
        return result
    ai = llm.complete_json(
        _RECO_SYSTEM,
        (
            f"Write in {'Bahasa Indonesia' if L == 'id' else 'English'}.\n"
            f"Child: {child_ctx.get('sex')} aged {age:.0f} months. HAZ={child_ctx.get('haz')}, WHZ={child_ctx.get('whz')}. "
            f"Stunting risk level: {risk_level or 'unknown'}. Recent symptoms: {', '.join(child_ctx.get('symptoms') or []) or 'none'}.\n"
            f"Last 7 days intake analysis: {intake}.\n"
            f"Nutrients to prioritise: {', '.join(focus)}. Locally available priority foods: "
            f"{', '.join(FOODS[k]['name_id'] for k in priority_foods[:8])}.\n"
            "Give a short headline, 3-5 personalised tips, a one-day meal plan appropriate for the child's age "
            "(meal, menu, why), and any cautions (choking hazards, allergy, hygiene, when to see a health worker)."
        ),
        _RECO_SCHEMA,
        max_tokens=3000,
    )
    if ai:
        result.update({"headline": ai["headline"], "tips": ai["tips"] + tips[-1:], "meal_plan": ai["meal_plan"],
                       "cautions": ai["cautions"], "generated_by": "claude+rules"})
    return result


_SCAN_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["is_food", "items", "notes"],
    "properties": {
        "is_food": {"type": "boolean"},
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["food_key", "name", "estimated_grams", "confidence"],
                "properties": {
                    "food_key": {"type": "string", "enum": list(FOODS.keys()) + ["other"]},
                    "name": {"type": "string"},
                    "estimated_grams": {"type": "number"},
                    "confidence": {"type": "number"},
                },
            },
        },
        "notes": {"type": "string"},
    },
}


def scan_image(image_bytes: bytes, media_type: str, age_months: float, lang: str = "id") -> dict | None:
    """NutriScan: identify foods and portion sizes in a meal photo. Returns None when AI is unavailable."""
    if not llm.is_enabled():
        return None
    foods_hint = "; ".join(f"{k} = {v['name_id']} / {v['name_en']}" for k, v in FOODS.items())
    ai = llm.complete_json(
        "You analyse photos of meals served to young children in Indonesia for a nutrition screening app. "
        "Identify each visible food, map it to the closest key in the provided food list (use 'other' when none "
        "fits), and estimate the edible portion in grams using the plate, bowl, spoon or hand for scale. "
        "Confidence is 0-1. If the image is not food, set is_food=false and return no items.",
        [
            {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": base64.standard_b64encode(image_bytes).decode()}},
            {"type": "text", "text": f"Child age: {age_months:.0f} months. Write `notes` and `name` in "
             f"{'Bahasa Indonesia' if lang == 'id' else 'English'}; notes = one short observation about the meal's "
             f"texture/portion for this age.\nFood list keys: {foods_hint}"},
        ],
        _SCAN_SCHEMA,
        max_tokens=3000,
    )
    if ai is None:
        return None
    items = [{"food_key": it["food_key"], "name": it["name"], "grams": max(0.0, float(it["estimated_grams"])),
              "confidence": it["confidence"]} for it in ai.get("items", [])]
    norm, totals, groups = compute_meal(items)
    for n, raw in zip(norm, items):
        n["confidence"] = raw["confidence"]
        if not n["known"]:
            n["name"] = raw["name"]
    return {"is_food": ai.get("is_food", True), "items": norm, "nutrients": totals, "food_groups": groups, "notes": ai.get("notes", "")}
