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

# Plain words for reasons and notifications (the app has its own copy for the symptom tiles).
LABELS: dict[str, tuple[str, str]] = {
    "diarrhea": ("diare", "diarrhoea"), "bloody_stool": ("BAB berdarah", "blood in stool"), "fever": ("demam", "fever"),
    "high_fever": ("demam tinggi", "high fever"), "cough": ("batuk", "cough"), "runny_nose": ("pilek", "runny nose"),
    "fast_breathing": ("napas cepat / sesak", "fast or difficult breathing"), "vomiting": ("muntah", "vomiting"),
    "vomits_everything": ("muntah terus", "vomits everything"), "convulsions": ("kejang", "convulsions"),
    "lethargy": ("sangat lemas / sulit dibangunkan", "very weak or hard to wake"),
    "unable_to_drink": ("tidak bisa minum / menyusu", "unable to drink or breastfeed"), "poor_appetite": ("tidak mau makan", "poor appetite"),
    "oedema": ("bengkak kedua kaki", "swelling of both feet"), "weight_loss": ("berat badan turun", "weight loss"),
    "sunken_eyes": ("mata cekung", "sunken eyes"), "rash": ("ruam", "rash"), "worms": ("cacingan", "worms"),
    "repeated_illness": ("sering sakit", "repeated illness"),
}


def symptom_label(key: str, lang: str = "id") -> str:
    pair = LABELS.get(key)
    return (pair[0] if lang == "id" else pair[1]) if pair else key.replace("_", " ")

# ---------------------------------------------------------------------------------------------
# Rule layer. Text is normalised first (lower case, "-nya" and hyphens removed, slang and spelling
# variants unified), then matched two ways:
#   * PHRASES: fixed expressions ("mencret", "tidak sadar", "can't breathe");
#   * NEAR: a body word and a state word close together in either order, so "napasnya cepat
#     sekali", "cepat sekali napasnya" and "BAB-nya cair" are all understood.
# A finding is dropped when it is negated just before it ("tidak sesak", "no fever") or, for
# non-danger symptoms only, reported as resolved just after it ("diarenya sudah sembuh").
# A convulsion that has stopped is still a danger sign, so danger signs are never "resolved".
# ---------------------------------------------------------------------------------------------

_STOOL = r"bab|berak|pup|pups|poop|poo|eek|beol|feses|tinja|stools?|bowel|poos"
_NEG = r"tidak|bukan|tanpa|belum|no|not|without|never|isn't|doesn't|didn't|hasn't|don't|aren't|wasn't"

PHRASES: dict[str, list[str]] = {
    "diarrhea": [r"diare", r"mencret", r"menceret", r"diarr?h?oea", r"diarrh?ea", r"the runs"],
    "bloody_stool": [r"darah (di|pada|dalam) (bab|tinja|feses)"],
    "fever": [r"demam", r"\bpanas\b", r"meriang", r"sumeng", r"badan (terasa )?hangat", r"suhu (tinggi|naik)", r"fever", r"feverish", r"\bhot\b",
              r"temperature"],
    "high_fever": [r"high fever"],
    "cough": [r"batuk", r"cough"],
    "runny_nose": [r"pilek", r"ingus", r"hidung (meler|tersumbat|mampet)", r"runny nose", r"stuffy nose", r"flu\b"],
    "fast_breathing": [r"sesak", r"ngos ngosan", r"tersengal", r"megap", r"tarikan dinding dada", r"dada (tertarik|cekung)",
                       r"(tidak bisa|susah|sulit|kesulitan) (ber)?napas", r"can't breathe", r"cannot breathe", r"shortness of breath",
                       r"short of breath", r"chest (in )?drawing", r"wheez"],
    "vomiting": [r"muntah", r"vomit", r"throwing up", r"throws up", r"threw up"],
    "vomits_everything": [r"semua (yang )?(dimakan|diminum|masuk) (dimuntahkan|keluar)", r"can't keep (anything|food|water) down"],
    "convulsions": [r"kejang", r"\bstep\b", r"stuip", r"kelojotan", r"mata (mendelik|melotot|ke atas)", r"convuls", r"seizure", r"\bfits?\b", r"fitting"],
    "lethargy": [r"tidak sadar", r"pingsan", r"(susah|sulit|tidak bisa) dibangunkan", r"tidak (mau |bisa )?bangun", r"tidak (respon|merespon|bereaksi)",
                 r"letargi", r"letharg", r"unconscious", r"unresponsive", r"hard to wake", r"won't wake", r"not waking", r"floppy"],
    "unable_to_drink": [r"(tidak|susah|sulit) (mau |bisa )?makan (dan|atau|maupun|ataupun) minum", r"tidak (mau|bisa) (asi|susu)", r"menolak (asi|susu)",
                        r"unable to (drink|breastfeed)"],
    "poor_appetite": [r"\bgtm\b", r"lepeh", r"nafsu makan (turun|kurang|berkurang|hilang|menurun)", r"makan (cuma |hanya )?sedikit",
                      r"(poor|loss of|no) appetite", r"eats? (very )?little"],
    "oedema": [r"oedema", r"edema"],
    "weight_loss": [r"(berat badan|bb|berat) (turun|berkurang|tidak naik|menurun)", r"(makin|tambah|semakin) kurus", r"kurus", r"weight loss",
                    r"losing weight", r"lost weight", r"not gaining weight"],
    "sunken_eyes": [r"mata cekung", r"sunken eyes", r"ubun ubun cekung"],
    "rash": [r"ruam", r"bintik (bintik )?merah", r"campak", r"rash", r"measles"],
    "worms": [r"cacing", r"worms?\b"],
    "repeated_illness": [r"sering sakit", r"sakit terus", r"bolak balik sakit", r"keeps getting sick", r"often sick", r"frequently ill"],
}

# (symptom, body/subject word, state word, max tokens apart, exclude-if-next-token)
NEAR: list[tuple[str, str, str, int, str | None]] = [
    ("fast_breathing", r"(ber)?napas|breath|breathe|breathes|breathing",
     r"cepat|sesak|susah|sulit|berat|pendek|fast|faster|quick|quickly|rapid|rapidly|hard|heavy|heavily|difficult|laboured|labored|struggling|struggles",
     3, None),
    ("diarrhea", _STOOL, r"cair|encer|air|lembek|watery|loose|runny|liquid", 3, None),
    ("diarrhea", _STOOL, r"terus|sering|berkali|terus menerus", 2, None),
    ("bloody_stool", _STOOL, r"darah|berdarah|blood|bloody", 4, None),
    ("high_fever", r"panas|demam|suhu|fever|temperature", r"tinggi|high|very", 3, None),
    ("vomits_everything", r"muntah|vomit|vomits|vomiting|throws|throwing",
     r"terus|semua|setiap|tiap|everything|all|constantly|nonstop", 3, None),
    ("convulsions", r"badan|tubuh|body", r"kaku|kelojotan|stiff|jerking|shaking", 2, None),
    ("lethargy", r"lemas|lemah|lesu|loyo|lunglai|weak|limp", r"sekali|sangat|very|really|extremely", 2, None),
    ("lethargy", r"tidur|sleeping|sleepy|sleeps", r"terus|very|all|unusually", 2, None),
    ("unable_to_drink", r"tidak|susah|sulit|menolak|ogah|refuses|refusing|won't|can't|cannot|unable|not",
     r"minum|menyusu|nyusu|netek|nenen|mimik|drink|drinks|drinking|breastfeed|breastfeeding|nurse|nursing", 2,
     r"obat|vitamin|sirup|puyer|medicine|medicines|syrup"),
    ("poor_appetite", r"tidak|susah|sulit|kurang|menolak|ogah|malas|males|won't|refuses|refusing|not|doesn't|don't|hardly",
     r"makan|eat|eats|eating|food", 2, None),
    ("oedema", r"bengkak|sembab|swollen|swelling|puffy",
     r"kaki|telapak|punggung|wajah|muka|kelopak|feet|foot|leg|legs|face|ankle|ankles|eyelids", 3, None),
]

_SLANG = {
    "gak": "tidak", "ga": "tidak", "nggak": "tidak", "ngga": "tidak", "enggak": "tidak", "engga": "tidak", "gk": "tidak",
    "tdk": "tidak", "tak": "tidak", "ndak": "tidak", "nda": "tidak", "g": "tidak",
    "bgt": "sekali", "banget": "sekali", "amat": "sekali",
    "nafas": "napas", "bernafas": "bernapas", "nafasnya": "napas", "yg": "yang", "sdh": "sudah", "udah": "sudah",
    "blm": "belum", "dgn": "dengan", "trs": "terus", "terusan": "terus", "hr": "hari", "anget": "hangat", "lemes": "lemas", "cepet": "cepat", "cpt": "cepat", "lemess": "lemas", "sesek": "sesak", "mencrett": "mencret",
    "cant": "can't", "wont": "won't", "doesnt": "doesn't", "dont": "don't", "isnt": "isn't",
}
_PHRASE_NORMALISE = [(r"buang air besar", "bab"), (r"buang air (cair|encer)", "bab cair"), (r"b\.a\.b", "bab")]
_BREAKS = re.compile(r"[.,;!?\n()]+|\b(?:tapi|tetapi|namun|but|however|walaupun|meskipun|although)\b")
_STOP_BACK = {"dan", "and", "serta", "juga", "lalu", "kemudian", "then", "also"}
_RESOLVED = re.compile(r"^(sudah |already |has |have )?(sembuh|hilang|reda|turun|berhenti|membaik|stopped|gone|resolved|better)\b")
_BREASTFEED = re.compile(r"menyusu|nyusu|netek|nenen|breastfeed|breastfeeding|nursing")
_TEMP_HIGH = re.compile(r"\b(39|4[0-2])([.,]\d)?\s*(°|derajat|c\b)", re.IGNORECASE)

_COMPILED = {k: [re.compile(p) for p in pats] for k, pats in PHRASES.items()}
_NEAR = [(k, re.compile(rf"(?:{a})"), re.compile(rf"(?:{b})"), w, re.compile(rf"(?:{x})") if x else None) for k, a, b, w, x in NEAR]
_NEG_RE = re.compile(rf"(?:{_NEG})")


def _tokens(clause: str) -> list[str]:
    out = []
    for tok in re.findall(r"[a-z0-9°']+", clause):
        tok = _SLANG.get(tok, tok)
        if tok in ("nya", "lah", "kah"):
            continue
        if len(tok) > 5 and tok.endswith("nya"):
            tok = _SLANG.get(tok[:-3], tok[:-3])
        out.extend(tok.split())
    return out


def _clauses(text: str) -> list[list[str]]:
    t = re.sub(r"(\w)\1{2,}", r"\1", text.lower())  # "panaaas" -> "panas"
    t = t.replace("-", " ").replace("’", "'")
    for pat, rep in _PHRASE_NORMALISE:
        t = re.sub(pat, rep, t)
    return [toks for part in _BREAKS.split(t) if part and (toks := _tokens(part))]


def _negated_before(toks: list[str], start: int) -> bool:
    for i in range(start - 1, max(-1, start - 4), -1):
        if toks[i] in _STOP_BACK:
            return False
        if _NEG_RE.fullmatch(toks[i]):
            return True
    return False


def _resolved_after(toks: list[str], end: int) -> bool:
    return bool(_RESOLVED.match(" ".join(toks[end:end + 3])))


def _accept(key: str, toks: list[str], start: int, end: int) -> bool:
    if _negated_before(toks, start):
        return False
    return key in DANGER_SIGNS or not _resolved_after(toks, end)


def _match_clause(toks: list[str]) -> set[str]:
    found: set[str] = set()
    joined = " ".join(toks)
    offsets = [0]
    for tok in toks:
        offsets.append(offsets[-1] + len(tok) + 1)
    def token_at(char: int) -> int:
        return max(i for i, o in enumerate(offsets[:-1]) if o <= char)

    for key, pats in _COMPILED.items():
        for p in pats:
            if any(_accept(key, toks, token_at(m.start()), token_at(m.end() - 1) + 1) for m in p.finditer(joined)):
                found.add(key)
                break
    for key, a, b, window, exclude in _NEAR:
        a_idx = [i for i, t in enumerate(toks) if a.fullmatch(t)]
        if not a_idx:
            continue
        b_idx = [i for i, t in enumerate(toks) if b.fullmatch(t)]
        for i in a_idx:
            for j in b_idx:
                if i == j or abs(i - j) > window:
                    continue
                lo, hi = min(i, j), max(i, j)
                if exclude and hi + 1 < len(toks) and exclude.fullmatch(toks[hi + 1]):
                    continue
                negation_is_the_concept = bool(_NEG_RE.fullmatch(toks[i]))
                between_negated = not negation_is_the_concept and any(_NEG_RE.fullmatch(t) for t in toks[lo + 1:hi])
                if between_negated or (not negation_is_the_concept and not _accept(key, toks, lo, hi + 1)):
                    continue
                if negation_is_the_concept and _negated_before(toks, lo):
                    continue  # "bukan tidak mau makan": double negation
                if key == "unable_to_drink" and j == i + 1 and i > 0 and toks[i - 1] == "sudah" and _BREASTFEED.fullmatch(toks[j]):
                    continue  # "sudah tidak menyusu" = weaned, not a danger sign ("sudah tidak mau menyusu" still counts)
                found.add(key)
    return found


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
    if re.search(r"kemarin lusa|two days ago", lower):
        return 2
    if re.search(r"sejak kemarin|dari kemarin|since yesterday", lower):
        return 1
    return None


def interpret_rules(text: str) -> dict:
    found: set[str] = set()
    for toks in _clauses(text or ""):
        found |= _match_clause(toks)
    if _TEMP_HIGH.search(text or ""):
        found.add("high_fever")
    if "vomits_everything" in found:
        found.add("vomiting")
    if "high_fever" in found:
        found.add("fever")
    if "bloody_stool" in found:
        found.add("diarrhea")
    return {"symptoms": sorted(found), "duration_days": _duration_days(text or ""), "appetite": "poor" if "poor_appetite" in found else None}


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
