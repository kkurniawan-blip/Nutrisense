"""Nuri (assistant) offline path: danger first, topic coverage for the questions mothers ask, and the Claude fallbacks."""
import pytest

from app.ai import assistant as A
from app.ai import llm

# (question, acceptable topics). 45 questions from mothers and Kaders, grouped by theme.
QUESTIONS = [
    # growth
    ("Apa itu stunting?", {"stunting"}),
    ("Anak saya pendek, apakah stunting?", {"stunting"}),
    ("Kenapa berat anak saya tidak naik?", {"weight"}),
    ("Berat badan Budi belum naik 2 bulan", {"weight"}),
    ("Apakah tinggi Sari normal untuk usianya?", {"growing_well"}),
    ("Seberapa sering anak perlu ditimbang?", {"weigh_frequency"}),
    ("Apa arti hasil -2 SD di grafik?", {"zscore"}),
    ("Anak saya kurus sekali, bagaimana?", {"thin"}),
    # MPASI / feeding
    ("Kapan mulai MPASI?", {"mpasi"}),
    ("Ide menu MPASI 9 bulan?", {"mpasi"}),
    ("Berapa kali anak harus makan sehari?", {"mpasi"}),
    ("Makanan murah apa yang tinggi protein?", {"mpasi"}),
    ("Bolehkah bayi 4 bulan dikasih pisang?", {"asi_before6"}),
    ("Anak umur 1 tahun boleh minum susu kental manis?", {"skm"}),
    ("Anak susah makan, harus bagaimana?", {"picky"}),
    ("Anak saya GTM sudah seminggu", {"picky"}),
    # ASI
    ("ASI saya sedikit, bagaimana supaya banyak?", {"asi_low"}),
    ("Berapa lama ASI eksklusif?", {"asi"}),
    ("Bolehkah bayi 3 bulan diberi air putih?", {"asi_before6"}),
    ("Bayi saya tidak mau menyusu", {"danger"}),
    # pregnancy
    ("Saya hamil 3 bulan, makan apa yang bagus?", {"pregnancy_food"}),
    ("Apa itu KEK pada ibu hamil?", {"kek"}),
    ("Berapa kali harus periksa kehamilan?", {"pregnancy_anc"}),
    ("Tablet tambah darah diminum kapan?", {"iron"}),
    ("Saya hamil dan keluar darah dari jalan lahir", {"danger"}),
    ("Gerakan bayi dalam kandungan berkurang", {"danger"}),
    ("Kaki saya bengkak dan kepala pusing, saya hamil 8 bulan", {"danger"}),
    # child danger signs
    ("Anak saya kejang", {"danger"}),
    ("Anak sesak napas dan napasnya cepat", {"danger"}),
    ("Anak muntah terus dan lemas", {"danger"}),
    ("Ada darah di BAB anak saya", {"danger"}),
    # illness
    ("Anak saya diare, apa yang harus saya lakukan?", {"diarrhea"}),
    ("Anak mencret dan tidak mau makan", {"diarrhea"}),
    ("Anak demam, kapan harus ke Puskesmas?", {"fever"}),
    ("Anak saya panas tinggi sudah 3 hari", {"fever"}),
    ("Bagaimana tahu anak kurang minum?", {"dehydration"}),
    ("Anak batuk pilek, perlu ke dokter?", {"cough"}),
    # KIA / immunisation
    ("Kapan imunisasi campak?", {"immunisation"}),
    ("Kapan jadwal imunisasi berikutnya?", {"immunisation"}),
    ("Kapan anak dapat vitamin A?", {"immunisation"}),
    ("Apa isi buku KIA?", {"kia"}),
    # lockers / app
    ("Cara ambil paket di loker?", {"locker"}),
    ("Kode loker saya tidak bisa dipakai", {"locker"}),
    # development
    ("Anak 18 bulan belum bisa bicara", {"development"}),
    ("Kapan anak mulai jalan?", {"development"}),
]

# The app's suggestion chips (mobile/src/app/(tabs)/assistant.tsx QUESTIONS + HEALTHY_FIRST, i18n suggest1-4), name = Sari.
CHIPS_ID = [
    ("Kenapa berat Sari tidak naik?", {"weight"}),
    ("Apakah tinggi Sari normal untuk usianya?", {"growing_well"}),
    ("Seberapa sering Sari perlu ditimbang?", {"weigh_frequency"}),
    ("Apa menu untuk anak susah makan?", {"picky"}),
    ("Makanan murah apa yang tinggi protein?", {"mpasi"}),
    ("Berapa kali Sari harus makan sehari?", {"mpasi"}),
    ("Sari diare, apa yang harus saya lakukan?", {"diarrhea"}),
    ("Sari demam, kapan harus ke Puskesmas?", {"fever"}),
    ("Bagaimana tahu Sari kurang minum?", {"dehydration"}),
    ("Apa yang biasanya bisa dilakukan anak seusia Sari?", {"development"}),
    ("Permainan apa yang bagus untuk Sari?", {"development"}),
    ("Bagaimana membantu Sari belajar bicara?", {"development"}),
    ("Apakah Sari tumbuh dengan baik?", {"growing_well"}),
    ("Ide menu MPASI 9 bulan?", {"mpasi"}),
    ("Anak susah makan", {"picky"}),
    ("Apa itu stunting?", {"stunting"}),
    ("Cara ambil paket di loker?", {"locker"}),
]
CHIPS_EN = [
    ("Why isn't Sari gaining weight?", {"weight"}),
    ("Is Sari's height normal for their age?", {"growing_well"}),
    ("How often should Sari be weighed?", {"weigh_frequency"}),
    ("What can I cook for a picky eater?", {"picky"}),
    ("Which cheap foods are high in protein?", {"mpasi"}),
    ("How many meals a day does Sari need?", {"mpasi"}),
    ("Sari has diarrhoea, what should I do?", {"diarrhea"}),
    ("Sari has a fever, when should we go to the Puskesmas?", {"fever"}),
    ("How can I tell if Sari is dehydrated?", {"dehydration"}),
    ("What can children Sari's age usually do?", {"development"}),
    ("Which games are good for Sari?", {"development"}),
    ("How can I help Sari learn to talk?", {"development"}),
    ("Is Sari growing well?", {"growing_well"}),
    ("Menu ideas for a 9-month-old?", {"mpasi"}),
    ("My child is a picky eater", {"picky"}),
    ("What is stunting?", {"stunting"}),
    ("How do I use the locker?", {"locker"}),
]

DANGER = [
    # child (WHO IMCI general danger signs)
    "Anak saya kejang", "Anak saya step tadi malam", "Anak sesak napas", "napasnya cepat sekali", "Anak muntah terus",
    "Ada darah di BAB anak saya", "Bayi saya tidak mau menyusu", "anak lemas sekali, susah dibangunkan", "anak tidak mau minum sama sekali",
    "kedua kaki anak bengkak", "My baby has a seizure", "He can't breathe", "blood in his stool",
    # pregnancy and after birth (Buku KIA 2020)
    "Saya hamil dan keluar darah dari jalan lahir", "Gerakan bayi dalam kandungan berkurang", "Kaki saya bengkak dan kepala pusing, saya hamil 8 bulan",
    "Hamil 7 bulan, pandangan kabur", "Saya hamil dan demam", "Air ketuban sudah pecah", "Hamil 9 bulan keluar air dari jalan lahir",
    "Saya hamil, sakit perut hebat", "Perdarahan setelah melahirkan", "I'm pregnant and bleeding", "The baby is moving less, I'm 32 weeks pregnant",
    "Saya hamil dan muntah terus", "Ibu hamil kejang",
    # newborn (Buku KIA 2020)
    "Kulit bayi saya kuning", "Tali pusat bayi merah dan bernanah", "Bayi merintih terus",
    "bayi saya lahir 3 hari lalu badannya kuning", "perut kencang dan keluar lendir darah, hamil 38 minggu",
]

NOT_DANGER = [
    "Apa itu stunting?", "Anak tidak kejang, cuma batuk", "Anak saya sudah tidak menyusu, makan apa?", "Tablet tambah darah diminum kapan?",
    "Kaki saya bengkak, saya hamil 8 bulan", "Saya hamil 3 bulan, makan apa yang bagus?", "Bayi saya kuning langsat dan sehat? Apa itu stunting",
    "Berapa kali harus periksa kehamilan?", "Kapan imunisasi campak?",
]


def _hit_rate(items):
    misses = [(q, A.faq_topic(q), ok) for q, ok in items if A.faq_topic(q) not in ok]
    return 1 - len(misses) / len(items), misses


def test_faq_hit_rate_on_mothers_questions():
    rate, misses = _hit_rate(QUESTIONS)
    assert len(QUESTIONS) == 45
    assert rate >= 0.85, misses


def test_suggestion_chips_all_answered():
    for chips in (CHIPS_ID, CHIPS_EN):
        assert len(chips) == 17
        rate, misses = _hit_rate(chips)
        assert rate >= 0.85, misses
        assert not [m for m in misses if m[1] == "default"], misses


@pytest.mark.parametrize("q,ok", QUESTIONS + CHIPS_ID)
def test_question_topic(q, ok):
    # Expected topics; every danger question must be caught, no exception.
    got = A.faq_topic(q)
    if ok == {"danger"}:
        assert got == "danger"
    else:
        assert got != "danger", q


@pytest.mark.parametrize("text", DANGER)
def test_danger_first_offline(text):
    assert A.danger_signs(text), text
    for lang, line in (("id", A.URGENT["id"]), ("en", A.URGENT["en"])):
        ans = A._faq(text, lang)
        assert ans.startswith(line) and A.is_urgent(ans)
        assert "119" in ans.splitlines()[0]


@pytest.mark.parametrize("text", NOT_DANGER)
def test_no_false_alarm(text):
    assert not A.danger_signs(text), (text, A.danger_signs(text))
    assert not A.is_urgent(A._faq(text, "id"))


def test_word_boundaries():
    assert A.faq_topic("Puskesdes buka jam berapa?") == "default"
    assert A.faq_topic("Saya mau ambil rapor anak") == "default"
    assert A.faq_topic("Anak saya sudah SD, masih perlu ditimbang?") == "weigh_frequency"
    assert A.faq_topic("Anak diare, boleh makan apa?") == "diarrhea"


def test_out_of_scope_is_refused_offline():
    for q in ("Siapa presiden Indonesia?", "Berapa harga motor bekas?"):
        assert A._faq(q, "id") == A._DEFAULT["id"]


def test_answers_are_short_and_bilingual():
    for key, _, ans in A._FAQ:
        for L in ("id", "en"):
            assert ans[L] and len(ans[L]) < 450, (key, L)
            assert sum(1 for line in ans[L].splitlines() if line[:2].rstrip(".").isdigit()) <= 4, (key, L)


def test_no_medicine_doses_in_faq():
    import re

    for key, _, ans in A._FAQ:
        for L in ("id", "en"):
            assert not re.search(r"\d+\s*(mg|ml|IU|SI|tetes|drops)\b", ans[L], re.IGNORECASE), (key, L)


def test_claude_answer_keeps_urgent_line(monkeypatch):
    seen = {}

    def fake(system, messages, max_tokens=4000):
        seen["system"], seen["max_tokens"] = system, max_tokens
        return "1. Beri ASI di jalan\n2. Bawa Buku KIA"

    monkeypatch.setattr(llm, "complete_chat", fake)
    answer, source = A.reply([], "Anak saya kejang", None, "id")
    assert source == "claude" and answer.startswith(A.URGENT["id"]) and "Beri ASI" in answer
    assert "danger signs" in seen["system"] and seen["max_tokens"] == 4000
    answer, _ = A.reply([], "Apa itu stunting?", None, "id")
    assert not A.is_urgent(answer)


def test_failed_or_truncated_claude_falls_back_to_topic_answer(monkeypatch):
    # complete_chat returns None on no key, timeout, refusal and max_tokens truncation (llm._text_of).
    monkeypatch.setattr(llm, "complete_chat", lambda system, messages, max_tokens=4000: None)
    answer, source = A.reply([], "Sari diare, apa yang harus saya lakukan?", None, "id")
    assert source == "faq" and answer.startswith("Diare?")
    answer, _ = A.reply([], "Saya hamil dan keluar darah dari jalan lahir", None, "en")
    assert answer.startswith(A.URGENT["en"])


def test_truncated_response_is_none():
    class R:
        stop_reason = "max_tokens"
        content = []

    assert llm._text_of(R()) is None


def test_system_prompt_scope():
    s = A._SYSTEM
    assert "Nuri" in s and "NutriBot" not in s
    for word in ("Pregnancy", "Buku KIA", "119", "tidak tahu", "Out of scope", "Newborn", "ORS"):
        assert word in s, word


def test_chat_call_settings_fit_the_app_timeout(monkeypatch):
    calls = {}

    class Msgs:
        def create(self, **kw):
            calls["create"] = kw

            class Block:
                type, text = "text", "Halo"

            class R:
                stop_reason, content = "end_turn", [Block()]

            return R()

    class Client:
        messages = Msgs()

        def with_options(self, **kw):
            calls["options"] = kw
            return self

    monkeypatch.setattr(llm, "is_enabled", lambda: True)
    monkeypatch.setattr(llm, "_get_client", lambda: Client())
    assert llm.complete_chat("s", [{"role": "user", "content": "hai"}]) == "Halo"
    assert calls["create"]["output_config"]["effort"] == "low" and calls["create"]["max_tokens"] == 4000
    assert calls["options"]["max_retries"] <= 1 and calls["options"]["timeout"] <= 30
    # Worst case (2 attempts) stays well under the app's 120 s request timeout.
    assert (1 + calls["options"]["max_retries"]) * calls["options"]["timeout"] < 120
