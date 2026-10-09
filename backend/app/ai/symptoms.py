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
    "jaundice", "cord_infection", "hypothermia", "grunting",
]

# WHO IMCI general danger signs + signs that need same-day facility care (children aged 2-59 months).
DANGER_SIGNS = {"unable_to_drink", "vomits_everything", "convulsions", "lethargy", "fast_breathing", "bloody_stool", "oedema"}

# Young infant: birth up to (not including) 2 months = 60 days of age.
# WHO IMCI chart booklet 2014, "Sick young infant age up to 2 months": not feeding well, fever (37.5 C or above) or
# low body temperature (below 35.5 C), and severe jaundice (palms and soles yellow, or any jaundice in the first 24 h)
# mean "refer urgently"; grunting is in the 2008 young-infant chart and the WHO Pocket Book 2013. Buku KIA 2020,
# "Tanda bahaya pada bayi baru lahir", adds yellow skin and eyes and a red, smelly or pus-filled cord, and says go to a
# health facility at once. A parent cannot measure palms and soles or 35.5 C reliably, so every report of yellow skin,
# a cold body, a red / pus-filled cord or grunting counts as a danger sign before 60 days (safety first: a missed
# sick newborn costs more than an extra visit). To verify (clinical sign-off): the Kemenkes MTBM wording and whether
# "any jaundice" and "red cord without spreading redness" should stay danger signs rather than same-day visits.
YOUNG_INFANT_DAYS = 60
YOUNG_INFANT_DANGER_SIGNS = DANGER_SIGNS | {"fever", "high_fever", "poor_appetite", "jaundice", "cord_infection", "hypothermia", "grunting"}


def is_young_infant(age_days: int | None) -> bool:
    """True for a baby under 2 months. Unknown or impossible (negative) age: False, so the 2-59 month set applies."""
    return age_days is not None and 0 <= age_days < YOUNG_INFANT_DAYS


def danger_set(age_days: int | None) -> set[str]:
    return YOUNG_INFANT_DANGER_SIGNS if is_young_infant(age_days) else DANGER_SIGNS


def danger_signs_for(symptoms: list[str] | set[str], age_days: int | None) -> list[str]:
    """The danger signs among `symptoms` for a child of this age (days, from the child's record)."""
    return sorted(set(symptoms) & danger_set(age_days))


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
    # Young-infant signs (Buku KIA 2020 wording, to verify).
    "jaundice": ("kulit atau mata kuning", "yellow skin or eyes"),
    "cord_infection": ("tali pusat merah, bernanah atau bau", "red, pus-filled or smelly cord"),
    "hypothermia": ("badan teraba dingin", "body feels cold"), "grunting": ("napas merintih", "grunting breathing"),
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
                      r"(poor|loss of|no) appetite", r"eats? (very )?little",
                      # a young infant "not feeding well" (WHO IMCI 2014): weak suck, lazy or short feeds
                      r"isapan (\w+ )?lemah", r"(malas|males|lemah|kurang) (menyusu|nyusu|netek|nenen|mimik)",
                      r"(menyusu|nyusu|netek|nenen) (\w+ )?(lemah|sebentar sebentar|malas)", r"(feeding|feeds|sucking) (poorly|weakly)",
                      r"not feeding well", r"weak suck"],
    "oedema": [r"oedema", r"edema"],
    "weight_loss": [r"(berat badan|bb|berat) (turun|berkurang|tidak naik|menurun)", r"(makin|tambah|semakin) kurus", r"kurus", r"weight loss",
                    r"losing weight", r"lost weight", r"not gaining weight"],
    "sunken_eyes": [r"mata cekung", r"sunken eyes", r"ubun ubun cekung"],
    "rash": [r"ruam", r"bintik (bintik )?merah", r"campak", r"rash", r"measles"],
    "worms": [r"cacing", r"worms?\b"],
    "repeated_illness": [r"sering sakit", r"sakit terus", r"bolak balik sakit", r"keeps getting sick", r"often sick", r"frequently ill"],
    # Young-infant signs. A bare "kuning" is a colour (yellow stool is normal for a breastfed baby, "kuning langsat" is
    # a skin tone), so jaundice needs a body word (NEAR below) or one of these fixed phrases.
    "jaundice": [r"\bbayi (tampak |terlihat |jadi |menjadi |agak |sangat )?kuning\b(?! langsat)", r"(penyakit|sakit) kuning", r"ikterus",
                 r"jaundice", r"yellow (skin|eyes)", r"(skin|eyes) (is |are |look |looks |turned |turning )?yellow"],
    "cord_infection": [r"omfalitis", r"omphalitis"],
    "hypothermia": [r"hipotermi", r"hypotherm", r"feels? (very )?cold", r"cold to (the )?touch"],
    "grunting": [r"merintih", r"\brintih", r"mengerang", r"grunt"],
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
    # Young-infant signs ("badannya kuning", "kuning sampai telapak kaki", "tali pusatnya bernanah", "badannya dingin sekali").
    ("jaundice", r"badan|tubuh|kulit|mata|putih|wajah|muka|telapak|seluruh|dada|skin|eyes|body|face|palms|soles",
     r"kuning|kekuningan|menguning|yellow|yellowish", 3, None),
    ("cord_infection", r"talipusat|pusat|pusar|puser|udel|umbilical|umbilicus|navel|cord",
     r"merah|kemerahan|bengkak|bernanah|nanah|berbau|bau|busuk|infeksi|red|redness|pus|smelly|smells|swollen|oozing|infected", 3, None),
    ("hypothermia", r"badan|tubuh|kulit|bayi|kaki|tangan|body|skin|baby|feet|hands",
     r"dingin|cold", 3, None),
]

# A NEAR pair is ignored when one of these words sits between the two words or right next to them:
# "BAB-nya kuning" or "kulit pisang kuning" is not jaundice, "badan panas dingin" (chills) or "keringat dingin" is
# not a cold body.
_NEAR_BLOCK = {
    "jaundice": r"bab|berak|pup|poop|eek|beol|feses|tinja|stools?|pipis|kencing|urin|ingus|dahak|nanah|bernanah|langsat|pisang|telur|jagung"
                r"|labu|pepaya|mangga|baju|kain|selimut|cat",
    "hypothermia": r"keringat|panas|demam|meriang|menggigil|air|cuaca|udara|angin|hujan|malam|pagi|lantai|kamar|ruangan|es|ac|kipas"
                   r"|minum|minuman|makanan|sweat|weather|water|room|air|fever",
}

_SLANG = {
    "gak": "tidak", "ga": "tidak", "nggak": "tidak", "ngga": "tidak", "enggak": "tidak", "engga": "tidak", "gk": "tidak",
    "tdk": "tidak", "tak": "tidak", "ndak": "tidak", "nda": "tidak", "g": "tidak",
    "bgt": "sekali", "banget": "sekali", "amat": "sekali",
    "nafas": "napas", "bernafas": "bernapas", "nafasnya": "napas", "yg": "yang", "sdh": "sudah", "udah": "sudah",
    "blm": "belum", "dgn": "dengan", "trs": "terus", "terusan": "terus", "hr": "hari", "anget": "hangat", "lemes": "lemas", "cepet": "cepat", "cpt": "cepat", "lemess": "lemas", "sesek": "sesak", "mencrett": "mencret",
    "cant": "can't", "wont": "won't", "doesnt": "doesn't", "dont": "don't", "isnt": "isn't",
}
_PHRASE_NORMALISE = [(r"buang air besar", "bab"), (r"buang air (cair|encer)", "bab cair"), (r"b\.a\.b", "bab"),
                     (r"tali (pusat|pusar|puser)", "talipusat")]
_BREAKS = re.compile(r"[.,;!?\n()]+|\b(?:tapi|tetapi|namun|but|however|walaupun|meskipun|although)\b")
_STOP_BACK = {"dan", "and", "serta", "juga", "lalu", "kemudian", "then", "also"}
_RESOLVED = re.compile(r"^(sudah |already |has |have )?(sembuh|hilang|reda|turun|berhenti|membaik|stopped|gone|resolved|better)\b")
_BREASTFEED = re.compile(r"menyusu|nyusu|netek|nenen|breastfeed|breastfeeding|nursing")
_TEMP_HIGH = re.compile(r"\b(39|4[0-2])([.,]\d)?\s*(°|derajat|c\b)", re.IGNORECASE)
# A body temperature: after "suhu" / "temperature" (any value), or a number with a unit. Fever is 37.5 C or above
# (WHO IMCI 2014); low body temperature is below 35.5 C (WHO IMCI 2014, young infant), and is only read after "suhu"
# because "35 derajat" alone is usually the weather in NTT.
_TEMP_AFTER_WORD = re.compile(r"\b(?:suhu\w*|temperature|temp)\s+(?:\w+\s+){0,3}?(\d{2}(?:[.,]\d)?)(?![.,]?\d)", re.IGNORECASE)
_TEMP_WITH_UNIT = re.compile(r"\b(\d{2}(?:[.,]\d)?)\s*(?:°|derajat|c\b)", re.IGNORECASE)
_NOT_BODY_TEMP = re.compile(r"\b(cuaca|udara|ruangan|ruang|kamar|air|luar|siang|weather|room|outside|water)\b", re.IGNORECASE)

_COMPILED = {k: [re.compile(p) for p in pats] for k, pats in PHRASES.items()}
_NEAR = [(k, re.compile(rf"(?:{a})"), re.compile(rf"(?:{b})"), w, re.compile(rf"(?:{x})") if x else None) for k, a, b, w, x in NEAR]
_NEAR_BLOCK_RE = {k: re.compile(rf"(?:{v})") for k, v in _NEAR_BLOCK.items()}
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
                block = _NEAR_BLOCK_RE.get(key)
                if block and any(block.fullmatch(t) for t in toks[max(0, lo - 1):hi + 2] if t not in (toks[i], toks[j])):
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


# "bayi 2 minggu", "umurnya baru 10 hari", "usia bayi 3 minggu", "lahir 5 hari lalu", "my 2 week old": that number is the
# baby's age, not how long the illness has lasted.
_AGE_BEFORE = re.compile(r"\b(?:bayi\w*|umur\w*|usia\w*|berumur|berusia|lahir|aged?|baby)"
                         r"(?:\s+(?:saya|aku|ku|kami|kita|baru|sudah|masih|kini|sekarang|bayi\w*|anak\w*|yang|ini|sekitar|kira kira|hampir"
                         r"|kurang|lebih|dari|is|just|only|about|my|our))*\s*$")
_AGE_AFTER = re.compile(r"^\s*old\b")


def _is_age(lower: str, m: re.Match) -> bool:
    return bool(_AGE_BEFORE.search(lower[max(0, m.start() - 60):m.start()]) or _AGE_AFTER.match(lower[m.end():]))


def _first_duration(lower: str, pattern: str) -> re.Match | None:
    return next((m for m in re.finditer(pattern, lower) if not _is_age(lower, m)), None)


def _duration_days(text: str) -> int | None:
    lower = text.lower().replace("-", " ")
    m = _first_duration(lower, r"(\d+)\s*(hari|days?|minggu|weeks?)\b")
    if m:
        return int(m.group(1)) * _UNIT_DAYS[m.group(2)]
    m = _first_duration(lower, r"\b(satu|dua|tiga|empat|lima|enam|tujuh|one|two|three|four|five|six|seven|a)\s+(hari|days?|minggu|weeks?)\b")
    if m:
        return _NUM_WORDS[m.group(1)] * _UNIT_DAYS[m.group(2)]
    m = _first_duration(lower, r"\bse(hari|minggu)\b")
    if m:
        return _UNIT_DAYS[m.group(1)]
    if re.search(r"kemarin lusa|two days ago", lower):
        return 2
    if re.search(r"sejak kemarin|dari kemarin|since yesterday", lower):
        return 1
    return None


def stated_age_days(text: str) -> int | None:
    """The baby's age when the text states it ("bayi 2 minggu", "umur 1 bulan", "baru lahir"), else None.

    Only for Nuri, which has no child record. The symptom checker takes the age from the child's record."""
    lower = (text or "").lower().replace("-", " ")
    for m in re.finditer(r"\b(\d+|satu|dua|tiga|empat|lima|enam|tujuh|se|one|two|three|four|five|six|seven|a)\s*(hari|days?|minggu|weeks?|bulan|months?)\b",
                         lower):
        if not _is_age(lower, m):
            continue
        n = int(m.group(1)) if m.group(1).isdigit() else _NUM_WORDS[m.group(1)]
        return n * (30 if m.group(2).startswith(("bulan", "month")) else _UNIT_DAYS[m.group(2)])
    if re.search(r"\bbaru (saja )?lahir|\bnewborn|\bneonat", lower):
        return 0
    return None


def _temperatures(text: str) -> set[str]:
    found: set[str] = set()
    for pattern, low_ok in ((_TEMP_AFTER_WORD, True), (_TEMP_WITH_UNIT, False)):
        for m in pattern.finditer(text):
            if _NOT_BODY_TEMP.search(text[max(0, m.start() - 25):m.start(1)]):
                continue  # the weather or the room, not the child
            v = float(m.group(1).replace(",", "."))
            if 37.5 <= v <= 42.5:
                found.add("fever")
            if 39 <= v <= 42.5:
                found.add("high_fever")
            if low_ok and 30 <= v < 35.5:
                found.add("hypothermia")
    return found


def interpret_rules(text: str) -> dict:
    found: set[str] = set()
    for toks in _clauses(text or ""):
        found |= _match_clause(toks)
    if _TEMP_HIGH.search(text or ""):
        found.add("high_fever")
    found |= _temperatures(text or "")
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
    "in the request. `other_concerns` lists anything clinically relevant that the symptom list cannot express. "
    "Young-infant signs: kuning = yellow skin or eyes (jaundice; not yellow stool, not a 'kuning langsat' skin tone), "
    "tali pusat / pusar merah, bernanah or bau = cord_infection, badan teraba dingin = hypothermia, merintih = grunting; "
    "'tidak mau menyusu' = unable_to_drink, 'malas menyusu' or 'isapan lemah' = poor_appetite. "
    "`duration_days` is how long the illness has lasted, never the baby's age ('bayi 2 minggu' is the age)."
)


def interpret(text: str, extra_symptoms: list[str] | None = None, lang: str = "id", age_days: int | None = None) -> dict:
    """Returns {symptoms, danger_signs, duration_days, appetite, summary, interpreted_by, other_concerns}.

    `age_days` is the child's age from the child's record. Under 60 days the young-infant danger set applies
    (YOUNG_INFANT_DANGER_SIGNS); unknown age keeps the 2-59 month set."""
    rules = interpret_rules(text or "")
    symptoms = set(rules["symptoms"]) | {s for s in (extra_symptoms or []) if s in SYMPTOM_KEYS}
    duration, appetite, summary, other, source = rules["duration_days"], rules["appetite"], None, [], "rules"

    if text and text.strip():
        age_line = f"Child's age: {age_days} days{' (young infant, under 2 months)' if is_young_infant(age_days) else ''}\n" \
            if age_days is not None and age_days >= 0 else ""
        ai = llm.complete_json(
            _SYSTEM,
            f"Language for summary: {'Bahasa Indonesia' if lang == 'id' else 'English'}\n{age_line}\nCaregiver description:\n{text}",
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
        "danger_signs": danger_signs_for(symptoms, age_days),
        "duration_days": duration,
        "appetite": appetite,
        "summary": summary,
        "other_concerns": other,
        "interpreted_by": source,
    }
