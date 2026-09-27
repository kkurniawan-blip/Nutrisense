"""NutriBot: conversational assistant for caregivers and Kaders (Claude, with an offline FAQ fallback)."""
from __future__ import annotations

import re

from . import llm

_SYSTEM = """You are NutriBot, the assistant inside the NutriSense app, which helps families and posyandu cadres (Kader) in Indonesia prevent child stunting.

How to help:
- Answer questions about child growth, feeding (ASI, MPASI), hygiene, common childhood illness, and how to use the app.
- Use the child context below when it is given, and explain growth results (z-scores, risk level) in plain language.
- Recommend affordable local foods (eggs, fish, tempeh, moringa/kelor, mung beans, corn, pumpkin, papaya).
- Follow WHO/Kemenkes feeding guidance, and never promote breast-milk substitutes.
- Answer in the language the user writes in (Bahasa Indonesia by default), in short paragraphs or brief lists that someone with basic literacy can follow.

Safety:
- You provide education and decision support, not a diagnosis or prescription. Do not give medicine doses except ORS/zinc as in national guidance.
- If the user describes danger signs (convulsions, unable to drink or breastfeed, vomiting everything, very sleepy or unconscious, fast or difficult breathing, blood in stool, swelling of both feet), tell them to go to the nearest Puskesmas or hospital immediately, before anything else.
- For high-risk children, encourage following up with the Kader, midwife (bidan) or doctor."""

_FAQ = [
    (r"kejang|step|tidak sadar|sesak|tidak (mau|bisa) minum|muntah terus|convulsion|seizure|unconscious|can'?t breathe",
     {"id": "⚠️ Ini tanda bahaya. Segera bawa anak ke Puskesmas atau rumah sakit terdekat sekarang. Tetap berikan ASI/minum sedikit-sedikit selama perjalanan.",
      "en": "⚠️ These are danger signs. Take the child to the nearest Puskesmas or hospital now. Keep offering breast milk or small sips on the way."}),
    (r"stunting|pendek|tinggi badan|height",
     {"id": "Stunting adalah kondisi anak lebih pendek dari standar WHO untuk usianya (TB/U di bawah -2 SD) akibat kurang gizi kronis dan infeksi berulang. Pencegahan terbaik: ASI eksklusif 6 bulan, MPASI kaya protein hewani, imunisasi lengkap, air bersih dan cuci tangan, serta pengukuran rutin di Posyandu.",
      "en": "Stunting means a child is shorter than the WHO standard for their age (height-for-age below -2 SD), caused by chronic undernutrition and repeated infection. Best prevention: exclusive breastfeeding for 6 months, complementary food rich in animal protein, full immunisation, clean water and handwashing, and regular Posyandu measurement."}),
    (r"mpasi|makan|menu|resep|food|feed|recipe|meal",
     {"id": "Mulai MPASI di usia 6 bulan. Setiap makan usahakan ada karbohidrat (nasi/jagung/ubi), protein hewani (telur/ikan/hati ayam), protein nabati (tempe/tahu/kacang hijau), dan sayur/buah (kelor, labu, pepaya). Lihat menu 'Rencana Gizi' di aplikasi untuk resep sesuai usia.",
      "en": "Start complementary feeding at 6 months. Each meal should include a staple (rice/corn/sweet potato), an animal protein (egg/fish/chicken liver), a plant protein (tempeh/tofu/mung beans) and vegetables/fruit (moringa, pumpkin, papaya). See 'Nutrition Plan' in the app for age-appropriate recipes."}),
    (r"diare|mencret|diarrh",
     {"id": "Saat diare: teruskan ASI dan makan, berikan oralit setiap kali BAB cair, dan zinc 1x sehari selama 10 hari. Segera ke Puskesmas jika ada darah di BAB, anak sangat lemas, mata cekung, atau tidak mau minum.",
      "en": "During diarrhoea: keep breastfeeding and feeding, give ORS after every loose stool and zinc once daily for 10 days. Go to the Puskesmas if there is blood in the stool, the child is very weak, has sunken eyes, or will not drink."}),
    (r"loker|locker|kode|pickup|ambil",
     {"id": "Jika paket gizi disetujui, Anda akan mendapat kode 6 digit dan QR di menu 'Pengambilan'. Tunjukkan QR atau ketik kode di loker N.E.X.U.S. untuk membuka pintu.",
      "en": "When a nutrition package is approved you receive a 6-digit code and QR under 'Pickups'. Scan the QR or enter the code at the N.E.X.U.S. locker to open it."}),
    (r"z-?score|sd|risiko|risk",
     {"id": "Z-score membandingkan anak dengan standar WHO. 0 berarti sama dengan rata-rata; di bawah -2 berarti pendek (stunting) atau kurus; di bawah -3 berarti berat. Tingkat risiko di aplikasi menggabungkan z-score, tren pertumbuhan, penyakit dan pola makan.",
      "en": "A z-score compares the child with the WHO standard. 0 is average; below -2 means stunted or wasted; below -3 is severe. The app's risk level combines z-scores, growth trend, illness and diet."}),
]

_DEFAULT = {
    "id": "Maaf, saya belum bisa menjawab itu secara offline. Coba tanyakan tentang MPASI, stunting, diare, z-score, atau loker pengambilan. Untuk keluhan kesehatan, hubungi Kader atau Puskesmas.",
    "en": "Sorry, I can't answer that offline yet. Try asking about complementary feeding, stunting, diarrhoea, z-scores, or locker pickups. For health concerns, contact your Kader or Puskesmas.",
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
