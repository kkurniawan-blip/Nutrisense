"""NutriBot: conversational assistant for caregivers and Kaders (Claude, with an offline FAQ fallback)."""
from __future__ import annotations

import re

from . import llm

_SYSTEM = """You are NutriBot, the assistant inside the NutriSense app, which helps families and posyandu cadres (Kader) in Indonesia prevent child stunting.

How to help:
- Answer questions about child growth, feeding (ASI, MPASI), hygiene, common childhood illness, and how to use the app.
- Use the child context below when it is given, and explain growth results (z-scores, risk level) in plain language.
- Recommend affordable local foods (eggs, fish, tempeh, moringa/kelor, mung beans, corn, pumpkin, papaya). Any recipe you suggest must take about 20 minutes or less, need only a pot, pan or steamer, and use ingredients sold in a village kiosk or market; give household measures (spoons, handfuls).
- Follow WHO/Kemenkes feeding guidance, and never promote breast-milk substitutes.
- Answer in the language the user writes in (Bahasa Indonesia by default). Keep it very short: one short opening line, then at most 4 numbered points of a few words each ("1. ..." on separate lines), then at most one short closing line. No long paragraphs, no markdown headings or bold.

Safety:
- You provide education and decision support, not a diagnosis or prescription. Do not give medicine doses except ORS/zinc as in national guidance.
- If the user describes danger signs (convulsions, unable to drink or breastfeed, vomiting everything, very sleepy or unconscious, fast or difficult breathing, blood in stool, swelling of both feet), tell them to go to the nearest Puskesmas or hospital immediately, before anything else.
- For high-risk children, encourage following up with the Kader, midwife (bidan) or doctor."""

_FAQ = [
    (r"kejang|step|tidak sadar|sesak|tidak (mau|bisa) minum|muntah terus|convulsion|seizure|unconscious|can'?t breathe",
     {"id": "⚠️ Ini tanda bahaya.\n1. Bawa anak ke Puskesmas sekarang\n2. Beri ASI/minum sedikit-sedikit di jalan",
      "en": "⚠️ These are danger signs.\n1. Go to the Puskesmas now\n2. Offer breast milk or small sips on the way"}),
    (r"stunting|pendek|tinggi badan|height",
     {"id": "Stunting: anak lebih pendek dari standar usianya. Cegah dengan:\n1. ASI eksklusif 6 bulan\n2. MPASI dengan telur atau ikan\n3. Imunisasi lengkap\n4. Ukur rutin di Posyandu",
      "en": "Stunting: a child is shorter than the standard for their age. Prevent it with:\n1. Only breast milk for 6 months\n2. Egg or fish in first foods\n3. Full immunisation\n4. Regular Posyandu checks"}),
    (r"berat.*(tidak|belum|gak|nggak) naik|weight.*(not|isn'?t) (going up|increasing)|not gaining",
     {"id": "Berat tidak naik? Coba:\n1. Protein hewani tiap makan\n2. Sedikit minyak di bubur\n3. 2 camilan bergizi\n4. Cuci tangan sebelum makan\nTidak naik 2 bulan? Hubungi Kader.",
      "en": "Weight not going up? Try:\n1. Animal protein at each meal\n2. A little oil in porridge\n3. 2 healthy snacks a day\n4. Wash hands before meals\nNo gain for 2 months? Contact your Kader."}),
    (r"perkembangan|motorik|bicara|bahasa|development|milestone|talk(ing)?|walk(ing)?",
     {"id": "Setiap anak punya kecepatannya sendiri. Coba:\n1. Ajak bicara dan bernyanyi\n2. Baca buku bergambar\n3. Main bersama setiap hari\nBelum bisa? Tanya Kader soal KPSP.",
      "en": "Every child has their own pace. Try:\n1. Talk and sing together\n2. Read picture books\n3. Play every day\nNot there yet? Ask your Kader about KPSP."}),
    (r"susah makan|tidak mau makan|gak mau makan|GTM|picky|won'?t eat|refuses? (to eat|food)",
     {"id": "Anak susah makan? Coba:\n1. Porsi kecil\n2. Jadwal teratur\n3. Variasikan makanan\n4. Makan bersama, tanpa TV\nBerat tidak naik 2 bulan? Hubungi Kader.",
      "en": "Picky eater? Try:\n1. Small portions\n2. Regular meal times\n3. Vary the food\n4. Eat together, no TV\nNo weight gain for 2 months? Contact your Kader."}),
    (r"mpasi|makan|menu|resep|food|feed|recipe|meal",
     {"id": "MPASI mulai usia 6 bulan. Tiap makan ada:\n1. Nasi, jagung atau ubi\n2. Telur, ikan atau hati ayam\n3. Tempe, tahu atau kacang\n4. Sayur atau buah\nResep mudah: buka NutriScan.",
      "en": "Start first foods at 6 months. Each meal has:\n1. Rice, corn or sweet potato\n2. Egg, fish or chicken liver\n3. Tempeh, tofu or beans\n4. Vegetables or fruit\nEasy recipes: open NutriScan."}),
    (r"diare|mencret|diarrh",
     {"id": "Diare? Lakukan:\n1. Teruskan ASI dan makan\n2. Oralit tiap BAB cair\n3. Zinc 1× sehari, 10 hari\nAda darah, sangat lemas, atau tidak mau minum? Segera ke Puskesmas.",
      "en": "Diarrhoea? Do this:\n1. Keep breastfeeding and feeding\n2. ORS after every loose stool\n3. Zinc once a day for 10 days\nBlood, very weak or won't drink? Go to the Puskesmas now."}),
    (r"loker|locker|kode|pickup|ambil",
     {"id": "Paket disetujui?\n1. Buka menu Paket\n2. Tunjukkan QR atau kode 6 digit di loker\n3. Pintu loker terbuka",
      "en": "Package approved?\n1. Open Packages\n2. Show the QR or 6-digit code at the locker\n3. The locker opens"}),
    (r"z-?score|sd|risiko|risk",
     {"id": "Z-score membandingkan anak dengan standar WHO.\n1. 0 = rata-rata\n2. Di bawah -2 = pendek atau kurus\n3. Di bawah -3 = berat",
      "en": "A z-score compares a child with the WHO standard.\n1. 0 = average\n2. Below -2 = stunted or wasted\n3. Below -3 = severe"}),
]

_DEFAULT = {
    "id": "Maaf, Nuri belum bisa menjawab itu secara offline.\nCoba tanya soal MPASI, stunting, diare atau loker.\nKeluhan kesehatan? Hubungi Kader atau Puskesmas.",
    "en": "Sorry, Nuri can't answer that offline yet.\nTry asking about first foods, stunting, diarrhoea or lockers.\nHealth worries? Contact your Kader or Puskesmas.",
}


def _faq(text: str, lang: str) -> str:
    L = "id" if lang == "id" else "en"
    for pattern, answer in _FAQ:
        if re.search(pattern, text, re.IGNORECASE):
            return answer[L]
    return _DEFAULT[L]


def reply(history: list[dict], user_text: str, child_context: str | None, lang: str) -> tuple[str, str]:
    """history: prior [{role, content}] turns. Returns (answer, generated_by)."""
    system = _SYSTEM + (f"\n\nChild context (from the app's records):\n{child_context}" if child_context else "")
    messages = [{"role": m["role"], "content": m["content"]} for m in history[-12:]]
    messages.append({"role": "user", "content": user_text})
    # The Messages API requires the first turn to be from the user.
    while messages and messages[0]["role"] != "user":
        messages.pop(0)
    answer = llm.complete_chat(system, messages, max_tokens=2000)
    if answer:
        return answer, "claude"
    return _faq(user_text, lang), "faq"
