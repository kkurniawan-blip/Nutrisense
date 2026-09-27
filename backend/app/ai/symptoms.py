"""Symptom interpretation for caregiver free text in Bahasa Indonesia, English and common local terms.

The rule-based lexicon always runs. When Claude is configured it additionally reads the text,
and the two results are merged by union so that an AI miss can never hide a danger sign.
"""
from __future__ import annotations

import re

from . import llm

SYMPTOM_KEYS = [
    "diarrhea", "bloody_stool", "fever", "high_fever", "cough", "runny_nose", "fast_breathing", "vomiting",
    "vomits_everything", "convulsions", "lethargy", "unable_to_drink", "poor_appetite", "oedema",
    "weight_loss", "sunken_eyes", "rash", "worms", "repeated_illness",
]

# WHO IMCI general danger signs + signs that need same-day facility care.
DANGER_SIGNS = {"unable_to_drink", "vomits_everything", "convulsions", "lethargy", "fast_breathing", "bloody_stool", "oedema"}

LEXICON: dict[str, list[str]] = {
    "diarrhea": [r"diare", r"mencret", r"menceret", r"\bbab cair", r"berak (air|cair|encer)", r"buang air besar (cair|terus)", r"diarr?h?oea", r"diarrhea", r"loose stool", r"watery stool"],
    "bloody_stool": [r"(bab|berak|feses|tinja)\s*(ber)?darah", r"blood(y)? (in )?stool", r"darah (di|pada) (bab|tinja|feses)"],
    "fever": [r"demam", r"\bpanas\b", r"badan panas", r"meriang", r"fever", r"\bhot\b"],
    "high_fever": [r"panas tinggi", r"demam tinggi", r"high fever", r"\b(39|40|41)([.,]\d)?\s*(°|derajat|c\b)"],
    "cough": [r"batuk", r"cough"],
    "runny_nose": [r"pilek", r"ingus", r"hidung meler", r"runny nose", r"flu\b"],
    "fast_breathing": [r"sesak", r"napas cepat", r"nafas cepat", r"susah (bernapas|bernafas)", r"tarikan dinding dada", r"fast breathing", r"difficult(y)? breathing", r"short(ness)? of breath"],
    "vomiting": [r"muntah", r"vomit", r"throwing up"],
    "vomits_everything": [r"muntah (terus|semua|setiap)", r"semua (yang )?(dimakan|diminum) (dimuntahkan|keluar)", r"vomits everything", r"can'?t keep (anything|food) down"],
    "convulsions": [r"kejang", r"\bstep\b", r"stuip", r"convulsion", r"seizure", r"fits?\b"],
    "lethargy": [r"lemas sekali", r"sangat lemas", r"tidak sadar", r"susah dibangunkan", r"lemah sekali", r"letargi", r"letharg", r"unconscious", r"hard to wake", r"very weak"],
    "unable_to_drink": [r"tidak (mau|bisa) (minum|menyusu|netek)", r"tidak mau (asi|nyusu)", r"unable to (drink|breastfeed)", r"won'?t (drink|breastfeed)", r"refus(es|ing) to (drink|breastfeed)"],
    "poor_appetite": [r"(tidak|tak|kurang|ga|gak|nggak) (mau |nafsu |napsu )?makan", r"susah makan", r"nafsu makan (turun|kurang|berkurang|hilang)", r"napsu makan", r"(poor|loss of|no) appetite", r"won'?t eat", r"refus(es|ing) (to eat|food)", r"lepeh"],
    "oedema": [r"bengkak (di )?(kaki|kedua kaki|punggung kaki|wajah)", r"kaki bengkak", r"swollen (feet|legs)", r"oedema", r"edema"],
    "weight_loss": [r"(berat badan|bb) (turun|berkurang|tidak naik)", r"(makin|tambah) kurus", r"kurus", r"weight loss", r"losing weight", r"not gaining weight"],
    "sunken_eyes": [r"mata cekung", r"sunken eyes", r"ubun[- ]ubun cekung"],
    "rash": [r"ruam", r"bintik merah", r"campak", r"rash", r"measles"],
    "worms": [r"cacing", r"worms?\b"],
    "repeated_illness": [r"sering sakit", r"sakit terus", r"bolak[- ]balik sakit", r"keeps getting sick", r"often sick", r"frequently ill"],
}
_COMPILED = {k: [re.compile(p, re.IGNORECASE) for p in pats] for k, pats in LEXICON.items()}

_NUM_WORDS = {"satu": 1, "se": 1, "dua": 2, "tiga": 3, "empat": 4, "lima": 5, "enam": 6, "tujuh": 7,
              "one": 1, "a": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7}
_UNIT_DAYS = {"hari": 1, "day": 1, "days": 1, "minggu": 7, "week": 7, "weeks": 7}


def _duration_days(text: str) -> int | None:
    lower = text.lower()
    m = re.search(r"(\d+)\s*(hari|days?|minggu|weeks?)\b", lower)
    if m:
        return int(m.group(1)) * _UNIT_DAYS[m.group(2)]
    m = re.search(r"\b(satu|dua|tiga|empat|lima|enam|tujuh|one|two|three|four|five|six|seven|a)\s+(hari|days?|minggu|weeks?)\b", lower)
    if m:
        return _NUM_WORDS[m.group(1)] * _UNIT_DAYS[m.group(2)]
    m = re.search(r"\bse(hari|minggu)\b", lower)
    if m:
        return _UNIT_DAYS[m.group(1)]
    return None


def interpret_rules(text: str) -> dict:
    found = [k for k, pats in _COMPILED.items() if any(p.search(text) for p in pats)]
    if "vomits_everything" in found and "vomiting" not in found:
        found.append("vomiting")
    if "high_fever" in found and "fever" not in found:
        found.append("fever")
    # "tidak mau makan" must not be mistaken for inability to drink, and vice versa.
    return {"symptoms": sorted(set(found)), "duration_days": _duration_days(text), "appetite": "poor" if "poor_appetite" in found else None}


_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["symptoms", "duration_days", "appetite", "summary", "other_concerns"],
    "properties": {
        "symptoms": {"type": "array", "items": {"type": "string", "enum": SYMPTOM_KEYS}},
        "duration_days": {"anyOf": [{"type": "integer"}, {"type": "null"}]},
        "appetite": {"anyOf": [{"type": "string", "enum": ["good", "reduced", "poor"]}, {"type": "null"}]},
        "summary": {"type": "string"},
        "other_concerns": {"type": "array", "items": {"type": "string"}},
    },
}

_SYSTEM = (
    "You extract structured symptoms from a caregiver's description of a child under five, for a stunting-"
    "prevention app used by posyandu cadres in rural Indonesia (East Nusa Tenggara). Descriptions may be in "
    "Bahasa Indonesia, English, or mixed with local words (e.g. mencret = diarrhea, step = febrile convulsion, "
    "lepeh = spitting food out). Only report symptoms the text actually states or clearly implies; do not "
    "diagnose. `summary` is one neutral sentence restating what was reported, written in the language given "
    "in the request. `other_concerns` lists anything clinically relevant that the symptom list cannot express."
)


def interpret(text: str, extra_symptoms: list[str] | None = None, lang: str = "id") -> dict:
    """Returns {symptoms, danger_signs, duration_days, appetite, summary, interpreted_by, other_concerns}."""
    rules = interpret_rules(text or "")
    symptoms = set(rules["symptoms"]) | {s for s in (extra_symptoms or []) if s in SYMPTOM_KEYS}
    duration, appetite, summary, other, source = rules["duration_days"], rules["appetite"], None, [], "rules"

    if text and text.strip():
        ai = llm.complete_json(
            _SYSTEM,
            f"Language for summary: {'Bahasa Indonesia' if lang == 'id' else 'English'}\n\nCaregiver description:\n{text}",
            _SCHEMA,
            max_tokens=2000,
        )
        if ai:
            source = "claude+rules"
            symptoms |= {s for s in ai.get("symptoms", []) if s in SYMPTOM_KEYS}
            duration = duration if duration is not None else ai.get("duration_days")
            appetite = ai.get("appetite") or appetite
            summary = ai.get("summary")
            other = ai.get("other_concerns", [])

    if "poor_appetite" in symptoms:
        appetite = "poor"
    return {
        "symptoms": sorted(symptoms),
        "danger_signs": sorted(symptoms & DANGER_SIGNS),
        "duration_days": duration,
        "appetite": appetite,
        "summary": summary,
        "other_concerns": other,
        "interpreted_by": source,
    }
