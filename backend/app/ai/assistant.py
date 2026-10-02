"""Nuri: conversational assistant for mothers and Kaders (Claude, with an offline FAQ fallback).

Order of every reply:
  1. A fixed danger check runs first, on every message, whatever path answers. A child danger sign
     (WHO IMCI, via symptoms.interpret_rules), a pregnancy / postpartum danger sign (Buku KIA, keys of
     maternal.DANGER_SIGNS) or a newborn danger sign makes the answer START with the fixed urgent line
     (URGENT), so the app can show it as urgent (`is_urgent(text)`), and the AI cannot drop it.
  2. Claude, when configured and consented, writes the rest of the answer.
  3. Otherwise (no key, timeout, refusal, truncated answer) the offline FAQ answers, by topic.
"""
from __future__ import annotations

import re

from . import llm
from .maternal import DANGER_SIGNS as PREGNANCY_DANGER_KEYS
from .symptoms import DANGER_SIGNS as CHILD_DANGER_KEYS, interpret_rules, symptom_label

# ---------------------------------------------------------------------------------------------
# 1. Danger check
# ---------------------------------------------------------------------------------------------
URGENT_MARK = "⚠️"
URGENT = {
    "id": f"{URGENT_MARK} Ini tanda bahaya. Segera ke Puskesmas atau telepon 119 sekarang.",
    "en": f"{URGENT_MARK} This is a danger sign. Go to the Puskesmas now or call 119.",
}

# The message is about a pregnancy or the weeks after birth (nifas).
_PREGNANT = re.compile(r"\bhamil|\bkehamilan|\bkandungan|\bjanin|\bbumil\b|\bpregnan|\btrimester|\bmelahirkan|\bnifas|\bpersalinan"
                       r"|\bpostpartum|\bgave birth|\bafter (the )?birth|\bketuban", re.IGNORECASE)
_BABY = re.compile(r"\bbayi|\bbaby|\bnewborn|\bbaru lahir", re.IGNORECASE)

# Buku KIA 2020 (Kemenkes RI), "Tanda bahaya pada ibu hamil" and "ibu nifas"; keys from maternal.DANGER_SIGNS.
# (key, pattern, needs pregnancy context). Child-lexicon hits (kejang, sesak, muntah terus) cover the rest.
_PREG_RULES: list[tuple[str, str, bool]] = [
    ("bleeding", r"darah (keluar )?(dari|di) (jalan lahir|vagina|kemaluan)|perdarahan|pendarahan|vaginal bleeding", False),
    ("bleeding", r"keluar (lendir )?(bercampur )?darah|lendir (bercampur )?darah|\bflek|bercak darah|\bberdarah|\bbleed|\bspotting", True),
    ("waters_break", r"ketuban (sudah |telah )?(pecah|keluar|rembes|merembes)|air ketuban|pecah ketuban"
                     r"|keluar (banyak )?air (dari|di) (jalan lahir|vagina|kemaluan)|waters? (has |have )?(broke|break|breaking|broken)", False),
    ("less_movement", r"gera(k|kan) (bayi|janin|anak|dedek|adik)( (dalam|di) (kandungan|perut))? (\w+ )?(berkurang|kurang|melemah|jarang|tidak terasa|hilang)"
                      r"|(bayi|janin|dedek)( (dalam|di) (kandungan|perut))? (\w+ )?(tidak|kurang|jarang|jarang sekali|tidak lagi) (bergerak|gerak|menendang|nendang)"
                      r"|(baby|fetus)( is)? (moving|moves|kicking|kicks) less|less (fetal |baby )?movement|(baby|fetus) (is )?not moving|reduced (fetal )?movement", False),
    ("swelling_headache", r"(bengkak|sembab|swollen|swelling|puffy).*(sakit kepala|pusing|kepala (pusing|sakit|berat)|pandangan (kabur|gelap)|mata (kabur|berkunang)|headache|blurr?ed vision)"
                          r"|(sakit kepala|pusing|kepala (pusing|sakit|berat)|pandangan (kabur|gelap)|mata (kabur|berkunang)|headache|blurr?ed vision).*(bengkak|sembab|swollen|swelling|puffy)", False),
    ("swelling_headache", r"(bengkak|sembab|swollen|swelling|puffy) (di |pada )?(\w+ )?(tangan|wajah|muka|hands?|face)"
                          r"|(pandangan|penglihatan) (kabur|gelap)|blurr?ed vision", True),
    ("high_fever", r"demam|\bpanas\b|meriang|\bfever", True),  # any fever in pregnancy or nifas: check today
    ("vomiting_all", r"muntah (terus|setiap|semua)|tidak bisa makan (dan|atau) minum|vomit(s|ing)? (everything|all the time)", True),
    ("severe_pain", r"(sakit|nyeri|mules|kram) (perut )?(\w+ )?(hebat|sekali|parah|tidak tertahan|terus menerus)|severe (abdominal |belly |stomach )?pain", True),
    ("breathless", r"sesak|susah (ber)?napas|short(ness)? of breath|can'?t breathe", True),
]
# Buku KIA 2020, "Tanda bahaya pada bayi baru lahir" (to verify: wording of the jaundice sign).
_NEWBORN_RULES: list[tuple[str, str]] = [
    ("jaundice", r"(kulit|mata|badan|tubuh|wajah)\w*( bayi)? (\w+ )?kuning|kuning (di |pada )?(kulit|mata|badan|seluruh)|jaundice|yellow (skin|eyes)"),
    ("cord_infection", r"(tali )?pusa[rt]\w* (\w+ )?(merah|bengkak|bernanah|nanah|berbau|bau)|umbilic\w* .*(red|pus|smell)"),
    ("grunting", r"merintih|grunting"),
    ("cold", r"(badan|tubuh|kaki|tangan)( bayi)? (teraba |terasa )?dingin|feels? cold"),
    ("eye_pus", r"mata (\w+ )?(bernanah|nanah)|pus (from|in) (the |his |her )?eyes?"),
]
_PREG_LABELS = {
    "bleeding": ("perdarahan", "bleeding"), "waters_break": ("air ketuban keluar", "waters breaking"),
    "less_movement": ("gerak janin berkurang", "baby moving less"), "swelling_headache": ("bengkak dan sakit kepala / pandangan kabur",
                                                                                         "swelling with headache or blurred vision"),
    "high_fever": ("demam saat hamil / nifas", "fever in pregnancy or after birth"), "vomiting_all": ("muntah terus", "vomiting everything"),
    "severe_pain": ("sakit perut hebat", "severe pain"), "breathless": ("sesak napas", "difficulty breathing"),
    "convulsions": ("kejang", "convulsions"),
    "jaundice": ("bayi kuning", "yellow skin or eyes"), "cord_infection": ("tali pusat merah / bernanah", "red or pus-filled cord"),
    "grunting": ("bayi merintih", "grunting"), "cold": ("bayi teraba dingin", "baby feels cold"), "eye_pus": ("mata bernanah", "pus from the eyes"),
}
_PREG_COMPILED = [(k, re.compile(p, re.IGNORECASE), ctx) for k, p, ctx in _PREG_RULES]
_NEWBORN_COMPILED = [(k, re.compile(p, re.IGNORECASE)) for k, p in _NEWBORN_RULES]
assert {k for k, _, _ in _PREG_RULES} - {"severe_pain"} <= set(PREGNANCY_DANGER_KEYS)


def danger_signs(text: str) -> list[str]:
    """Danger signs in a message, as "child:<key>", "pregnancy:<key>" or "newborn:<key>". Empty when none."""
    text = text or ""
    pregnant = bool(_PREGNANT.search(text))
    found: list[str] = []
    for key, pat, needs_ctx in _PREG_COMPILED:
        if (pregnant or not needs_ctx) and pat.search(text) and f"pregnancy:{key}" not in found:
            found.append(f"pregnancy:{key}")
    child = set(interpret_rules(text)["symptoms"]) & CHILD_DANGER_KEYS
    if pregnant:
        # In pregnancy, swollen feet alone are a common complaint (Buku KIA); the danger is swelling of hands/face or
        # swelling with headache / blurred vision, caught above. Breathlessness and convulsions are hers, not a child's.
        child.discard("oedema")
        if "fast_breathing" in child:
            child.discard("fast_breathing")
            if "pregnancy:breathless" not in found:
                found.append("pregnancy:breathless")
        if "convulsions" in child:
            child.discard("convulsions")
            found.append("pregnancy:convulsions")
    found += [f"child:{k}" for k in sorted(child)]
    if _BABY.search(text):
        found += [f"newborn:{k}" for k, pat in _NEWBORN_COMPILED if pat.search(text)]
    return found


def _danger_label(code: str, L: str) -> str:
    group, key = code.split(":", 1)
    if group == "child":
        return symptom_label(key, L)
    pair = _PREG_LABELS.get(key, (key, key))
    return pair[0] if L == "id" else pair[1]


def is_urgent(answer: str) -> bool:
    """True when the answer begins with the fixed urgent line (the app can colour it as urgent)."""
    return (answer or "").startswith(URGENT_MARK)


def _urgent_answer(signs: list[str], L: str) -> str:
    labels = ", ".join(dict.fromkeys(_danger_label(s, L) for s in signs))
    mother = any(s.startswith("pregnancy:") for s in signs)
    if L == "id":
        steps = ("1. Berangkat sekarang, jangan tunggu\n2. Ajak suami atau keluarga, siapkan kendaraan\n3. Bawa Buku KIA" if mother else
                 "1. Bawa anak ke Puskesmas sekarang\n2. Beri ASI/minum sedikit-sedikit di jalan\n3. Bawa Buku KIA")
        return f"{URGENT['id']}\nTanda: {labels}.\n{steps}"
    steps = ("1. Leave now, do not wait\n2. Bring your husband or family, arrange transport\n3. Bring the KIA book" if mother else
             "1. Take the child to the Puskesmas now\n2. Offer breast milk or small sips on the way\n3. Bring the KIA book")
    return f"{URGENT['en']}\nSigns: {labels}.\n{steps}"


# ---------------------------------------------------------------------------------------------
# 2. Offline FAQ. First match wins, so illness and pregnancy come before feeding, and specific
# entries before general ones. Patterns use word boundaries (\b) so that "SD" (school) or
# "Puskesdes" do not match the z-score entry. Short, plain Indonesian; English second.
# ---------------------------------------------------------------------------------------------
_FAQ: list[tuple[str, str, dict[str, str]]] = [
    # --- Danger signs, information only (an actual danger sign is caught by the danger check above).
    # Source: Buku KIA 2020 (Kemenkes); WHO IMCI chart booklet 2014.
    ("danger_info", r"tanda bahaya|danger signs?|warning signs?",
     {"id": "Tanda bahaya, segera ke Puskesmas atau telepon 119:\n1. Anak: kejang, sangat lemas, tidak mau minum/menyusu, napas cepat/sesak, BAB berdarah\n"
            "2. Ibu hamil: perdarahan, air ketuban keluar, gerak janin berkurang, bengkak + sakit kepala, demam\n3. Bayi baru lahir: kuning, tali pusat merah, merintih, dingin\nLihat juga Buku KIA.",
      "en": "Danger signs: go to the Puskesmas now or call 119:\n1. Child: convulsions, very weak, can't drink or breastfeed, fast or hard breathing, blood in stool\n"
            "2. Pregnancy: bleeding, waters breaking, baby moving less, swelling + headache, fever\n3. Newborn: yellow skin, red cord, grunting, feels cold\nSee also the KIA book."}),

    # --- Childhood illness. Sources: WHO IMCI chart booklet 2014; Kemenkes MTBS 2019 (to verify edition);
    # WHO/UNICEF joint statement on diarrhoea, ORS and zinc 2004; Kemenkes LINTAS Diare 2011.
    ("diarrhea", r"\b(diare|mencret|menceret|diarr?h?oea|diarrh?ea|bab cair|buang air cair|oralit|ORS)\b",
     {"id": "Diare? Lakukan:\n1. Teruskan ASI dan makan, porsi kecil tapi sering\n2. Oralit tiap kali BAB cair\n3. Zinc 1× sehari selama 10 hari, walau diare sudah berhenti\n"
            "4. Cuci tangan pakai sabun\nAda darah, sangat lemas, atau tidak mau minum? Segera ke Puskesmas.",
      "en": "Diarrhoea? Do this:\n1. Keep breastfeeding and feeding, small meals often\n2. ORS after every loose stool\n3. Zinc once a day for 10 days, even after it stops\n"
            "4. Wash hands with soap\nBlood, very weak or won't drink? Go to the Puskesmas now."}),
    ("dehydration", r"kurang minum|dehidrasi|dehydrat|kekurangan cairan|mata cekung|kurang cairan|sunken eyes",
     {"id": "Tanda anak kurang cairan (dehidrasi):\n1. Mata cekung\n2. Sangat haus, atau malah tidak mau minum\n3. Kulit perut dicubit kembalinya lambat\n4. Jarang pipis, sangat lemas\n"
            "Ada tanda ini? Beri oralit dan segera ke Puskesmas.",
      "en": "Signs of dehydration:\n1. Sunken eyes\n2. Very thirsty, or not able to drink\n3. Pinched belly skin goes back slowly\n4. Little urine, very weak\n"
            "See these signs? Give ORS and go to the Puskesmas now."}),
    # Malaria: in NTT (malaria area) every fever needs a blood test (WHO IMCI 2014; Kemenkes malaria guideline 2020, to verify).
    # "More than 2 days": Buku KIA 2020 (to verify the exact cut-off).
    ("fever", r"\b(demam|panas|meriang|sumeng|fever|feverish|malaria)\b",
     {"id": "Anak demam? Lakukan:\n1. Beri ASI/minum lebih sering\n2. Pakaian tipis, kompres air hangat\n3. Tinggal di daerah malaria (NTT)? Periksa darah malaria di Puskesmas hari ini\n"
            "Ke Puskesmas jika demam lebih dari 2 hari, bayi di bawah 2 bulan, kejang, atau sangat lemas.",
      "en": "Child has a fever? Do this:\n1. Offer breast milk or drinks more often\n2. Light clothes, sponge with lukewarm water\n3. Live in a malaria area (NTT)? Get a malaria blood test at the Puskesmas today\n"
            "Go to the Puskesmas if the fever lasts over 2 days, the baby is under 2 months, has convulsions, or is very weak."}),
    # Fast breathing cut-offs: WHO IMCI 2014 (>= 50/min at 2-12 months, >= 40/min at 1-5 years).
    ("cough", r"\b(batuk|pilek|ingus|flu|ispa|pneumonia|cough|coughing|runny nose|cold)\b",
     {"id": "Batuk pilek biasanya bisa dirawat di rumah:\n1. Teruskan ASI dan makan\n2. Beri minum hangat lebih sering\n3. Bersihkan hidung yang tersumbat\n"
            "4. Hitung napas 1 menit saat tenang: 50 atau lebih (2–12 bulan), 40 atau lebih (1–5 tahun) = napas cepat\n"
            "Napas cepat, sesak, dada tertarik ke dalam, atau batuk lebih dari 2 minggu? Segera ke Puskesmas.",
      "en": "Cough and cold can usually be cared for at home:\n1. Keep breastfeeding and feeding\n2. Offer warm drinks more often\n3. Clear a blocked nose\n"
            "4. Count breaths for 1 minute at rest: 50 or more (2–12 months), 40 or more (1–5 years) = fast breathing\n"
            "Fast or hard breathing, chest pulling in, or cough over 2 weeks? Go to the Puskesmas now."}),

    # --- Pregnancy. Sources: Buku KIA 2020 (Kemenkes); Kemenkes Pedoman ANC Terpadu 2020 (K6, 2 doctor visits);
    # LiLA < 23.5 cm = KEK (Kemenkes); TTD at least 90 tablets in pregnancy (Kemenkes, Buku KIA 2020).
    ("pregnancy_anc", r"periksa (kehamilan|hamil)|kontrol (kehamilan|hamil)|cek (kehamilan|hamil)|kunjungan (hamil|kehamilan|anc)|\bK[1-6]\b|\bANC\b|antenatal"
                      r"|(check-?ups?|visits?).*(pregnan)|(pregnan).*(check-?ups?|visits?)",
     {"id": "Periksa hamil minimal 6 kali (K6):\n1. Trimester 1 (sampai 12 minggu): 1 kali, dengan dokter\n2. Trimester 2: 2 kali\n3. Trimester 3: 3 kali, 1 kali dengan dokter\n"
            "Jadwal dan pengingat ada di halaman Kehamilan di aplikasi.",
      "en": "Have at least 6 pregnancy check-ups (K6):\n1. Trimester 1 (to 12 weeks): 1, with a doctor\n2. Trimester 2: 2\n3. Trimester 3: 3, one with a doctor\n"
            "Dates and reminders are on the Pregnancy page in the app."}),
    # To verify (clinical sign-off): wording "setiap hari" for TTD follows Buku KIA 2020; no milligram dose is given.
    ("iron", r"tablet tambah darah|\bTTD\b|tablet (besi|fe)\b|zat besi|\biron\b|\banemi|kurang darah|\bHb\b",
     {"id": "Tablet tambah darah (TTD):\n1. Minum setiap hari selama hamil, sesuai anjuran bidan (minimal 90 tablet)\n2. Minum dengan air putih atau air jeruk, jangan dengan teh, kopi atau susu\n"
            "3. Minum malam hari agar tidak mual\nTinja jadi hitam itu biasa. Minta TTD di Posyandu atau Puskesmas.",
      "en": "Iron tablets (TTD):\n1. Take one every day in pregnancy, as your midwife advises (at least 90 tablets)\n2. Take with water or orange juice, not with tea, coffee or milk\n"
            "3. Take at night to avoid nausea\nBlack stools are normal. Get TTD at the Posyandu or Puskesmas."}),
    ("kek", r"\bKEK\b|kurang energi kronis|\blila\b|lingkar lengan|chronic energy|\bCED\b",
     {"id": "KEK (Kurang Energi Kronis): lingkar lengan atas (LiLA) ibu di bawah 23,5 cm. Bayi bisa lahir kecil. Lakukan:\n1. Makan 1 porsi lebih banyak dari sebelum hamil\n"
            "2. Tambah telur, ikan, tempe atau kacang\n3. Minta makanan tambahan (PMT) ibu hamil di Puskesmas\n4. Periksa rutin ke bidan",
      "en": "KEK (chronic energy deficiency): the mother's upper-arm size (LiLA) is under 23.5 cm. The baby may be born small. Do this:\n1. Eat 1 portion more than before pregnancy\n"
            "2. Add eggs, fish, tempeh or beans\n3. Ask the Puskesmas for extra food (PMT) for pregnant women\n4. See the midwife regularly"}),
    ("pregnancy_food", r"(hamil|kehamilan|bumil|pregnan).*\b(makan|makanan|gizi|menu|minum|eat|food|diet|nutrition)|\b(makan|makanan|gizi|eat|food).*(hamil|bumil|pregnan)",
     {"id": "Makan saat hamil:\n1. 1 porsi lebih banyak dari sebelum hamil, 3 kali makan + 2 camilan\n2. Lauk hewani tiap hari: telur, ikan, daging\n3. Sayur hijau dan buah\n"
            "4. Minum TTD tiap hari dan cukup air putih\nHindari rokok, asap rokok dan alkohol.",
      "en": "Eating in pregnancy:\n1. 1 portion more than before, 3 meals + 2 snacks\n2. Animal food every day: eggs, fish, meat\n3. Green vegetables and fruit\n"
            "4. An iron tablet (TTD) daily and enough water\nAvoid smoking, smoke and alcohol."}),
    ("pregnancy", r"\bhamil|\bkehamilan|\bkandungan|\bjanin|\bpregnan",
     {"id": "Selama hamil:\n1. Periksa minimal 6 kali (K6)\n2. Makan lebih banyak dan beragam\n3. Minum tablet tambah darah tiap hari\n"
            "4. Kenali tanda bahaya: perdarahan, air ketuban keluar, gerak janin berkurang, bengkak + sakit kepala\nAda tanda bahaya? Segera ke Puskesmas atau telepon 119.",
      "en": "During pregnancy:\n1. At least 6 check-ups (K6)\n2. Eat more, and a variety of foods\n3. Take an iron tablet every day\n"
            "4. Know the danger signs: bleeding, waters breaking, baby moving less, swelling + headache\nDanger sign? Go to the Puskesmas or call 119."}),

    # --- Immunisation, vitamin A and the KIA book. Sources: Buku KIA 2020; Permenkes 12/2017 imunisasi (MR at 9 and
    # 18 months; to verify against the 2023-2024 schedule update); vitamin A in February and August, blue capsule
    # 6-11 months, red 12-59 months (Kemenkes juknis vitamin A 2016, to verify edition).
    ("immunisation", r"imunisasi|vaksin|vaccin|immuni[sz]|campak|measles|\bMR\b|\bBCG\b|polio|vitamin a\b|kapsul (biru|merah)|\bDPT|hepatitis",
     {"id": "Jadwal imunisasi dan vitamin A ada di halaman KIA anak di aplikasi (sesuai Buku KIA).\n1. Imunisasi gratis di Posyandu dan Puskesmas\n"
            "2. Campak-Rubela (MR): umur 9 bulan dan 18 bulan\n3. Vitamin A tiap Februari dan Agustus: kapsul biru (6–11 bulan), merah (1–5 tahun)\n"
            "4. Terlambat? Tetap datang, imunisasi bisa dikejar\nBawa Buku KIA setiap datang.",
      "en": "The immunisation and vitamin A schedule is on the child's KIA page in the app (from the KIA book).\n1. Vaccines are free at the Posyandu and Puskesmas\n"
            "2. Measles-rubella (MR): at 9 and 18 months\n3. Vitamin A every February and August: blue capsule (6–11 months), red (1–5 years)\n"
            "4. Missed one? Still go: vaccines can be caught up\nBring the KIA book every time."}),
    ("kia", r"buku kia|\bKIA\b|buku pink|pink book|MCH (hand)?book",
     {"id": "Buku KIA (Kesehatan Ibu dan Anak) berisi catatan hamil, persalinan, imunisasi, vitamin A dan grafik tumbuh anak.\n1. Bawa setiap ke Posyandu, bidan dan Puskesmas\n"
            "2. Versi digitalnya ada di halaman KIA di aplikasi",
      "en": "The KIA (mother and child health) book holds the pregnancy, birth, immunisation, vitamin A and growth records.\n1. Bring it to every Posyandu, midwife and Puskesmas visit\n"
            "2. Its digital version is on the KIA page in the app"}),

    # --- Breastfeeding (ASI). Sources: WHO/UNICEF Global Strategy for Infant and Young Child Feeding 2003;
    # Buku KIA 2020; PP 33/2012 ASI eksklusif; >= 6 wet nappies a day = enough milk (WHO 2009 infant feeding, to verify).
    ("asi_before6", r"(\b[0-5] ?(bln|bulan|months?)\b|baru lahir|newborn|sebelum 6 bulan|before 6 months|under 6 months).*\b(air|pisang|madu|teh|kopi|bubur|nasi|water|banana|honey|tea|solids?)\b"
                    r"|\b(air putih|pisang|madu|teh|bubur|water|banana|honey|tea)\b.*(\b[0-5] ?(bln|bulan|months?)\b|baru lahir|newborn|sebelum 6 bulan|before 6 months|under 6 months)",
     {"id": "Sebelum 6 bulan, bayi cukup ASI saja.\n1. Jangan beri air putih, pisang, bubur, madu atau teh\n2. ASI sudah cukup air, juga saat cuaca panas\n"
            "3. Makanan lain bisa membuat bayi diare dan ASI berkurang\nMulai MPASI saat bayi 6 bulan.",
      "en": "Before 6 months, breast milk alone is enough.\n1. No water, banana, porridge, honey or tea\n2. Breast milk has enough water, even in hot weather\n"
            "3. Other food can cause diarrhoea and less breast milk\nStart first foods at 6 months."}),
    ("asi_low", r"\basi\b.*\b(sedikit|kurang|tidak lancar|seret|keluar sedikit|tidak keluar|banyak|lancar|deras)|\b(sedikit|kurang|memperbanyak|melancarkan)\b.*\basi\b"
                r"|low (breast ?)?milk|not enough (breast ?)?milk|milk supply|more (breast ?)?milk",
     {"id": "Supaya ASI banyak:\n1. Susui lebih sering, kedua payudara bergantian\n2. Pelekatan benar: mulut bayi terbuka lebar, dagu menempel\n"
            "3. Ibu makan cukup, banyak minum, cukup istirahat\n4. Hindari dot dan susu formula\nBayi pipis 6 kali atau lebih sehari tanda ASI cukup. Masih sulit? Tanya bidan.",
      "en": "For more breast milk:\n1. Breastfeed more often, both breasts in turn\n2. Good latch: mouth wide open, chin touching the breast\n"
            "3. Eat enough, drink plenty, rest\n4. Avoid bottles and formula\n6 or more wet nappies a day means enough milk. Still hard? Ask your midwife."}),
    ("asi", r"\basi\b|menyusui|menyusu|breast ?feed|breast ?milk|\bnenen",
     {"id": "ASI eksklusif: hanya ASI sampai bayi 6 bulan.\n1. Tanpa air putih, madu, pisang atau susu lain\n2. Susui sesering bayi mau, siang dan malam\n"
            "3. Mulai MPASI di 6 bulan, ASI lanjut sampai 2 tahun",
      "en": "Exclusive breastfeeding: only breast milk until 6 months.\n1. No water, honey, banana or other milk\n2. Feed whenever the baby wants, day and night\n"
            "3. Start first foods at 6 months; keep breastfeeding to 2 years"}),
    # Sweetened condensed milk is not a milk for children: BPOM regulation 31/2018 (label) and Kemenkes 2018 notice.
    ("skm", r"kental manis|\bSKM\b|condensed milk|krimer|creamer",
     {"id": "Susu kental manis (SKM) bukan susu untuk anak.\n1. Isinya kebanyakan gula\n2. Jangan untuk pengganti ASI atau susu anak\n3. Lebih baik: ASI, telur, ikan, tempe\n"
            "SKM hanya untuk campuran kue atau minuman orang dewasa.",
      "en": "Sweetened condensed milk is not a milk for children.\n1. It is mostly sugar\n2. Never use it instead of breast milk or milk\n3. Better: breast milk, eggs, fish, tempeh\n"
            "Use it only in cakes or adult drinks."}),

    # --- Growth. Sources: WHO Child Growth Standards 2006; Permenkes 2/2020 Standar Antropometri Anak;
    # Buku KIA 2020 (weigh monthly at the Posyandu to 5 years); WHO 2013 SAM guideline (MUAC, oedema).
    ("weigh_frequency", r"(sering|kali|kapan|perlu|harus|masih)\b.*\b(ditimbang|timbang|menimbang|penimbangan|diukur)|\bposyandu\b.*\b(lagi|tiap|setiap|kapan)\b|how often.*\b(weigh|measur)|\bweigh(ed|ing)?\b.*how often",
     {"id": "Timbang anak setiap bulan di Posyandu, sampai umur 5 tahun.\n1. Ukur juga panjang atau tinggi badan\n2. Catat di Buku KIA dan di aplikasi\n"
            "3. Berat tidak naik (T)? Kader akan membantu\nHasilnya ada di Grafik pertumbuhan di aplikasi.",
      "en": "Weigh your child every month at the Posyandu, until age 5.\n1. Measure length or height too\n2. Record it in the KIA book and the app\n"
            "3. No weight gain (T)? The Kader will help\nResults are on the Growth chart in the app."}),
    ("weight", r"\b(berat|bb)\b.*\b(tidak|belum|gak|nggak|ga|tak) (naik|bertambah|nambah)|\b(berat|bb)\b.*\b(turun|stagnan|tetap)\b"
               r"|weight.*(not|isn'?t|doesn'?t|hasn'?t) (going up|increasing|gaining|go up)|(not|n't)\b.*\bgaining|weight loss|losing weight",
     {"id": "Berat tidak naik? Coba:\n1. Protein hewani tiap makan\n2. Sedikit minyak di bubur\n3. 2 camilan bergizi\n4. Cuci tangan sebelum makan\nTidak naik 2 bulan? Hubungi Kader.",
      "en": "Weight not going up? Try:\n1. Animal protein at each meal\n2. A little oil in porridge\n3. 2 healthy snacks a day\n4. Wash hands before meals\nNo gain for 2 months? Contact your Kader."}),
    ("thin", r"\bkurus|gizi (kurang|buruk)|wasting|wasted|\bthin\b|underweight|skinny",
     {"id": "Anak kurus perlu dicek di Posyandu atau Puskesmas:\n1. Timbang berat, ukur tinggi dan lingkar lengan (LiLA)\n2. Beri makan lebih sering, dengan telur, ikan atau kacang\n"
            "3. Tambah sedikit minyak di bubur\nSangat kurus, lemas, atau kedua kaki bengkak? Segera ke Puskesmas.",
      "en": "A thin child needs a check at the Posyandu or Puskesmas:\n1. Weigh, measure height and upper-arm size (MUAC)\n2. Feed more often, with eggs, fish or beans\n"
            "3. Add a little oil to porridge\nVery thin, weak, or both feet swollen? Go to the Puskesmas now."}),
    ("growing_well", r"tumbuh (dengan )?(baik|normal|sehat)|pertumbuhan.*(baik|normal)|\btinggi\b.*\bnormal|\bnormal\b.*\b(tinggi|usia|umur)|\bberat\b.*\bnormal"
                     r"|growing (well|normally)|(height|weight|tall).*normal|normal.*(height|weight|for (his|her|their) age)",
     {"id": "Lihat Grafik pertumbuhan anak di aplikasi:\n1. Titik di antara garis -2 dan +2 = normal\n2. Di bawah -2 = pendek (stunting) atau kurus, perlu perhatian\n"
            "3. Garis harus terus naik setiap bulan\nUkur tiap bulan di Posyandu. Ragu? Tanya Kader.",
      "en": "Look at the child's Growth chart in the app:\n1. A dot between the -2 and +2 lines = normal\n2. Below -2 = short (stunted) or thin, needs attention\n"
            "3. The line should keep going up every month\nMeasure monthly at the Posyandu. Unsure? Ask your Kader."}),
    ("stunting", r"stunting|\bpendek|tinggi badan|\bkerdil|\bheight|\bshort\b",
     {"id": "Stunting: anak lebih pendek dari standar usianya. Cegah dengan:\n1. ASI eksklusif 6 bulan\n2. MPASI dengan telur atau ikan\n3. Imunisasi lengkap\n4. Ukur rutin di Posyandu",
      "en": "Stunting: a child is shorter than the standard for their age. Prevent it with:\n1. Only breast milk for 6 months\n2. Egg or fish in first foods\n3. Full immunisation\n4. Regular Posyandu checks"}),
    ("zscore", r"z-?score|-?\d\s*SD\b|\bSD\s*-?\d|standar deviasi|simpang baku|\bgrafik|\bkurva|\bchart\b|\brisiko\b|\brisk\b",
     {"id": "Z-score membandingkan anak dengan standar WHO.\n1. 0 = rata-rata\n2. Di bawah -2 = pendek atau kurus\n3. Di bawah -3 = berat",
      "en": "A z-score compares a child with the WHO standard.\n1. 0 = average\n2. Below -2 = stunted or wasted\n3. Below -3 = severe"}),

    # --- Development and play. Sources: Buku KIA 2020 (stimulation by age); Kemenkes SDIDTK 2016 (KPSP).
    # "No words by 18 months: check" (to verify against the KPSP 18-month items).
    ("development", r"\b(bicara|berbicara|ngomong|bahasa|kata|talk|talking|speak|speech|words?)\b",
     {"id": "Bantu anak belajar bicara:\n1. Ajak bicara sepanjang hari, sebut nama benda\n2. Bernyanyi dan baca buku bergambar\n3. Jawab setiap ocehannya, kurangi HP dan TV\n"
            "Umur 18 bulan belum bisa satu kata? Tanya Kader soal KPSP (cek perkembangan).",
      "en": "Help your child learn to talk:\n1. Talk all day, name things\n2. Sing and read picture books\n3. Answer every babble; less phone and TV\n"
            "No words at 18 months? Ask your Kader about KPSP (development check)."}),
    ("development", r"perkembangan|motorik|\bmain\b|bermain|permainan|mainan|seusia|bisa dilakukan|\b(ber)?jalan\b|merangkak|duduk|tengkurap"
                    r"|development|milestone|\bplay|\bgames?\b|\btoys?\b|\bwalk|\bcrawl|\bsit\b|children .*age .*do",
     {"id": "Ajak anak bermain setiap hari:\n1. 0–6 bulan: ajak bicara, tatap, bernyanyi\n2. 6–12 bulan: cilukba, tepuk tangan, main bola\n"
            "3. 1–2 tahun: susun balok, baca buku bergambar\n4. 2–5 tahun: menggambar, main peran, bercerita\nKemampuan sesuai umur ada di Buku KIA. Ragu? Tanya Kader soal KPSP.",
      "en": "Play with your child every day:\n1. 0–6 months: talk, eye contact, sing\n2. 6–12 months: peekaboo, clapping, ball games\n"
            "3. 1–2 years: stacking blocks, picture books\n4. 2–5 years: drawing, pretend play, stories\nSkills by age are in the KIA book. Unsure? Ask your Kader about KPSP."}),

    # --- Feeding. Sources: WHO Guiding principles for complementary feeding 2003; Buku KIA 2020 (MPASI).
    ("picky", r"susah makan|sulit makan|\b(tidak|gak|ga|nggak|ngga|enggak|tak|ogah) mau makan|\bGTM\b|picky|won'?t eat|refuses? (to eat|food)|malas makan|pilih-?pilih",
     {"id": "Anak susah makan? Coba:\n1. Porsi kecil\n2. Jadwal teratur\n3. Variasikan makanan\n4. Makan bersama, tanpa TV\nBerat tidak naik 2 bulan? Hubungi Kader.",
      "en": "Picky eater? Try:\n1. Small portions\n2. Regular meal times\n3. Vary the food\n4. Eat together, no TV\nNo weight gain for 2 months? Contact your Kader."}),
    ("mpasi", r"\bmpasi|\bmakan(nya|an)?\b|\bmenu|\bresep|\bprotein|\bfood|\bfeed|\brecipe|\bmeals?\b|\beat\b|\bcook",
     {"id": "MPASI mulai usia 6 bulan. Tiap makan ada:\n1. Nasi, jagung atau ubi\n2. Telur, ikan atau hati ayam\n3. Tempe, tahu atau kacang\n4. Sayur atau buah\nResep mudah: buka NutriScan.",
      "en": "Start first foods at 6 months. Each meal has:\n1. Rice, corn or sweet potato\n2. Egg, fish or chicken liver\n3. Tempeh, tofu or beans\n4. Vegetables or fruit\nEasy recipes: open NutriScan."}),

    # --- The app.
    ("locker", r"\bloker|\blocker|\bkode\b|\bpickup|ambil paket|\bpaket\b|\bpackage",
     {"id": "Paket disetujui?\n1. Buka menu Paket\n2. Tunjukkan QR atau kode 6 digit di loker\n3. Pintu loker terbuka",
      "en": "Package approved?\n1. Open Packages\n2. Show the QR or 6-digit code at the locker\n3. The locker opens"}),
]
_FAQ_COMPILED = [(key, re.compile(pattern, re.IGNORECASE), answer) for key, pattern, answer in _FAQ]

_DEFAULT = {
    "id": "Maaf, Nuri belum bisa menjawab itu.\nCoba tanya soal tumbuh kembang, MPASI, ASI, kehamilan, imunisasi, diare atau loker.\nKeluhan kesehatan? Hubungi Kader atau Puskesmas.",
    "en": "Sorry, Nuri can't answer that yet.\nTry asking about growth, first foods, breastfeeding, pregnancy, immunisation, diarrhoea or lockers.\nHealth worries? Contact your Kader or Puskesmas.",
}


def faq_topic(text: str) -> str:
    """Which answer the offline path gives: "danger", a FAQ key, or "default"."""
    if danger_signs(text):
        return "danger"
    for key, pattern, _ in _FAQ_COMPILED:
        if pattern.search(text or ""):
            return key
    return "default"


def _faq(text: str, lang: str) -> str:
    """Offline answer. The danger check runs first, so a danger sign always leads."""
    L = "id" if lang == "id" else "en"
    signs = danger_signs(text)
    if signs:
        return _urgent_answer(signs, L)
    for _, pattern, answer in _FAQ_COMPILED:
        if pattern.search(text or ""):
            return answer[L]
    return _DEFAULT[L]


faq = _faq  # public name for routers


# ---------------------------------------------------------------------------------------------
# 3. Claude
# ---------------------------------------------------------------------------------------------
_SYSTEM = """You are Nuri, the assistant inside the NutriSense app. NutriSense helps mothers and posyandu cadres (Kader) in rural Nusa Tenggara Timur (NTT), Indonesia, prevent child stunting and keep pregnancies safe. Many users have a primary-school reading level.

Your scope (answer only these):
- Child growth (weight, height, z-scores, the app's growth chart), feeding (ASI, MPASI), hygiene, common childhood illness, play and development.
- Pregnancy and the weeks after birth: antenatal check-ups (K1-K6), eating in pregnancy, KEK, iron tablets (TTD), breastfeeding.
- The Buku KIA (mother and child health book), immunisation and vitamin A, and how to use the app (KIA page, Pregnancy page, growth chart, NutriScan, lockers).
Follow WHO and Kemenkes / Buku KIA guidance. Never promote breast-milk substitutes or sweetened condensed milk for children.
Use the child context below when it is given, and explain growth results (z-scores, risk level) in plain words.
Recommend affordable local foods (eggs, fish, tempeh, moringa/kelor, mung beans, corn, pumpkin, papaya). A recipe must take about 20 minutes or less, need only a pot, pan or steamer, use ingredients from a village kiosk or market, and give household measures (spoons, handfuls).

Out of scope (politics, religion, money, adult illness unrelated to pregnancy, anything else): say clearly in one short line that Nuri can only help with child growth, feeding, pregnancy and the KIA book, and suggest asking the Kader or Puskesmas.
If you are not sure, say "Nuri tidak tahu" (or "Nuri doesn't know") and suggest the bidan, Kader or Puskesmas. Never guess facts, numbers or schedules.

Style: answer in the language the user writes in (Bahasa Indonesia by default), short plain words, abbreviations explained in brackets. One short opening line, then at most 4 numbered points of a few words each ("1. ..." on separate lines), then at most one short closing line. No long paragraphs, no markdown headings or bold.

Safety:
- You give education and decision support, not a diagnosis or prescription. Do not give medicine doses, except ORS (oralit) and zinc as in national guidance.
- Danger signs come first: tell them to go to the Puskesmas now or call 119, before anything else.
  Child: convulsions, unable to drink or breastfeed, vomiting everything, very sleepy or unconscious, fast or difficult breathing, blood in stool, swelling of both feet.
  Pregnancy and after birth: bleeding, waters breaking, baby moving less, swelling of face/hands or swelling with headache or blurred vision, fever, convulsions, vomiting everything, severe pain, difficulty breathing.
  Newborn: not breastfeeding, convulsions, very weak, fast breathing or grunting, feels cold or hot, yellow skin or eyes, red or pus-filled cord, pus from the eyes.
- For high-risk children, encourage follow-up with the Kader, midwife (bidan) or doctor."""

_DANGER_NOTE = ("\n\nThe app's safety check found danger signs in this message ({signs}). The app already shows the urgent line "
                "\"go to the Puskesmas now or call 119\" above your answer: do not repeat it. Give at most 3 short points on what to do "
                "right now and on the way. No diagnosis.")


def reply(history: list[dict], user_text: str, child_context: str | None, lang: str) -> tuple[str, str]:
    """history: prior [{role, content}] turns. Returns (answer, generated_by)."""
    L = "id" if lang == "id" else "en"
    signs = danger_signs(user_text)
    system = _SYSTEM + (f"\n\nChild context (from the app's records):\n{child_context}" if child_context else "")
    if signs:
        system += _DANGER_NOTE.format(signs=", ".join(_danger_label(s, "en") for s in signs))
    messages = [{"role": m["role"], "content": m["content"]} for m in history[-12:]]
    messages.append({"role": "user", "content": user_text})
    # The Messages API requires the first turn to be from the user.
    while messages and messages[0]["role"] != "user":
        messages.pop(0)
    answer = llm.complete_chat(system, messages, max_tokens=4000)
    if answer:
        if signs:
            answer = f"{URGENT[L]}\n{answer.lstrip()}"
        return answer, "claude"
    # No key, refusal, timeout or a truncated answer: the FAQ answer for the topic (danger first).
    return _faq(user_text, lang), "faq"
