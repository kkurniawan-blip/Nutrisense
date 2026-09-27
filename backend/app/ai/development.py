"""Simple child-development tracker (motor, language, social, cognitive).

Milestones are adapted from the CDC "Learn the Signs. Act Early." checklists (2022 revision), which list
skills most children (about 75%) show by each age. This is a parent-facing checklist to encourage
play and follow-up, NOT a developmental screening or diagnosis; Posyandu cadres use the Kemenkes KPSP
questionnaire for formal screening.

The tracker shows the milestones for the most recent age band the child has reached.
"""
from __future__ import annotations

DOMAINS = {
    "motor": {"id": "Motorik", "en": "Motor", "emoji": "🏃"},
    "language": {"id": "Bahasa", "en": "Language", "emoji": "🗣️"},
    "social": {"id": "Sosial", "en": "Social", "emoji": "🤝"},
    "cognitive": {"id": "Kognitif", "en": "Thinking", "emoji": "🧩"},
}

# (band in months, domain, key, id text, en text)
_MILESTONES = [
    (6, "motor", "m6_roll", "Berguling dari tengkurap ke telentang", "Rolls from tummy to back"),
    (6, "language", "l6_sounds", "Bergantian membuat suara dengan Bunda", "Takes turns making sounds with you"),
    (6, "social", "s6_laugh", "Tertawa dan mengenali orang yang akrab", "Laughs and knows familiar people"),
    (6, "cognitive", "c6_reach", "Meraih untuk mengambil mainan", "Reaches to grab a toy"),
    (9, "motor", "m9_sit", "Duduk tanpa dibantu", "Sits without support"),
    (9, "language", "l9_babble", "Mengoceh seperti “mamama” atau “bababa”", "Makes sounds like “mamama” or “bababa”"),
    (9, "social", "s9_peekaboo", "Tersenyum atau tertawa saat main ci-luk-ba", "Smiles or laughs at peek-a-boo"),
    (9, "cognitive", "c9_search", "Mencari benda yang jatuh dari pandangan", "Looks for objects dropped out of sight"),
    (12, "motor", "m12_cruise", "Berdiri berpegangan dan melangkah sambil berpegangan", "Pulls to stand and walks holding on to furniture"),
    (12, "language", "l12_wave", "Melambai “dada” dan memanggil “mama/papa”", "Waves bye-bye and calls you “mama/dada”"),
    (12, "social", "s12_games", "Bermain tepuk tangan (pat-a-cake) bersama Bunda", "Plays games like pat-a-cake with you"),
    (12, "cognitive", "c12_container", "Memasukkan benda ke dalam wadah", "Puts something into a container"),
    (15, "motor", "m15_steps", "Melangkah beberapa langkah sendiri", "Takes a few steps on their own"),
    (15, "language", "l15_word", "Mengucapkan 1–2 kata selain mama/papa", "Says one or two words besides mama/dada"),
    (15, "social", "s15_show", "Menunjukkan benda yang disukai kepada Bunda", "Shows you an object they like"),
    (15, "cognitive", "c15_stack", "Menumpuk setidaknya dua benda kecil", "Stacks at least two small objects"),
    (18, "motor", "m18_walk", "Berjalan sendiri tanpa berpegangan", "Walks without holding on"),
    (18, "language", "l18_words", "Mengucapkan 3 kata atau lebih", "Says three or more words"),
    (18, "social", "s18_point", "Menunjuk untuk memperlihatkan sesuatu yang menarik", "Points to show you something interesting"),
    (18, "cognitive", "c18_copy", "Meniru Bunda saat bekerja (menyapu, mengelap)", "Copies you doing chores"),
    (24, "motor", "m24_kick", "Menendang bola dan berlari", "Kicks a ball and runs"),
    (24, "language", "l24_two", "Menggabungkan dua kata (“mau susu”)", "Puts two words together (“more milk”)"),
    (24, "social", "s24_notice", "Memperhatikan saat orang lain sedih atau terluka", "Notices when others are hurt or upset"),
    (24, "cognitive", "c24_hands", "Memegang benda di satu tangan sambil memakai tangan lain", "Holds something in one hand while using the other"),
    (30, "motor", "m30_jump", "Melompat dengan dua kaki", "Jumps off the ground with both feet"),
    (30, "language", "l30_names", "Menyebut nama benda di buku", "Names things in a book"),
    (30, "social", "s30_play", "Bermain di dekat dan bersama anak lain", "Plays next to and sometimes with other children"),
    (30, "cognitive", "c30_pretend", "Bermain pura-pura (menyuapi boneka)", "Pretend play, like feeding a doll"),
    (36, "motor", "m36_dress", "Memakai sebagian pakaian sendiri", "Puts on some clothes by themselves"),
    (36, "language", "l36_chat", "Bercakap bergantian dan menyebut nama sendiri", "Has a short back-and-forth conversation and says their name"),
    (36, "social", "s36_join", "Ikut bermain dengan anak lain", "Joins other children to play"),
    (36, "cognitive", "c36_circle", "Menggambar lingkaran setelah dicontohkan", "Draws a circle when shown how"),
    (48, "motor", "m48_catch", "Menangkap bola besar", "Catches a large ball most of the time"),
    (48, "language", "l48_sentence", "Berbicara dengan kalimat 4 kata atau lebih", "Says sentences with four or more words"),
    (48, "social", "s48_comfort", "Menghibur teman yang sedih atau terluka", "Comforts others who are hurt or sad"),
    (48, "cognitive", "c48_colours", "Menyebut beberapa warna", "Names a few colours"),
    (60, "motor", "m60_hop", "Melompat dengan satu kaki", "Hops on one foot"),
    (60, "language", "l60_story", "Bercerita dengan dua kejadian atau lebih", "Tells a story with at least two events"),
    (60, "social", "s60_turns", "Mengikuti aturan dan bergantian saat bermain", "Follows rules and takes turns in games"),
    (60, "cognitive", "c60_count", "Berhitung sampai 10", "Counts to 10"),
]
BANDS = sorted({b for b, *_ in _MILESTONES})
MILESTONES = {key: {"band": band, "domain": dom, "id": tid, "en": ten} for band, dom, key, tid, ten in _MILESTONES}

_ACTIVITIES = [
    (0, [("🗣️", "Ajak bicara dan bernyanyi saat mandi", "Talk and sing during bath time"),
         ("🙈", "Main ci-luk-ba", "Play peek-a-boo"),
         ("🧸", "Waktu tengkurap sambil diberi mainan", "Tummy time with a toy to reach")]),
    (12, [("📚", "Membaca buku bergambar bersama", "Read a picture book together"),
          ("🧩", "Susun balok atau gelas plastik", "Stack blocks or plastic cups"),
          ("🎵", "Bernyanyi sambil bertepuk tangan", "Sing and clap together")]),
    (24, [("🎨", "Bermain warna dengan krayon atau daun", "Play with colours: crayons or leaves"),
          ("📚", "Membaca bersama dan tanya “ini apa?”", "Read together and ask “what's this?”"),
          ("⚽", "Main tendang bola di halaman", "Kick a ball in the yard")]),
    (36, [("🎨", "Menggambar dan menceritakan gambarnya", "Draw and tell a story about the picture"),
          ("🔢", "Berhitung benda di rumah (sendok, batu)", "Count things at home (spoons, pebbles)"),
          ("🧹", "Libatkan dalam tugas kecil (merapikan mainan)", "Help with small chores like tidying toys")]),
]


def current_band(age_months: float) -> int | None:
    passed = [b for b in BANDS if b <= age_months]
    return passed[-1] if passed else None


def activities(age_months: float, lang: str) -> list[dict]:
    L = 1 if lang == "id" else 2
    chosen = [acts for start, acts in _ACTIVITIES if start <= age_months][-1]
    return [{"emoji": a[0], "text": a[L]} for a in chosen]


def summary(age_months: float, answers: dict[str, bool], lang: str) -> dict:
    """answers: milestone_key -> achieved. Returns per-domain status for the current age band."""
    L = "id" if lang == "id" else "en"
    band = current_band(age_months)
    domains = []
    for dom, meta in DOMAINS.items():
        items = [
            {"key": k, "text": m[L], "achieved": answers.get(k)}
            for k, m in MILESTONES.items() if m["domain"] == dom and m["band"] == band
        ]
        answered = [i for i in items if i["achieved"] is not None]
        if not items or not answered:
            state = "unknown"
        elif all(i["achieved"] for i in items):
            state = "on_track"
        else:
            state = "monitor"
        domains.append({"key": dom, "label": meta[L], "emoji": meta["emoji"], "status": state, "items": items})
    return {
        "band_months": band,
        "domains": domains,
        "activities": activities(age_months, L),
        "note": {
            "id": "Setiap anak berkembang dengan kecepatannya sendiri. Ini bukan tes diagnosis. Jika ada yang belum bisa, "
                  "ajak bermain setiap hari dan tanyakan pemeriksaan KPSP kepada Kader saat Posyandu.",
            "en": "Every child develops at their own pace. This is not a diagnostic test. If a skill isn't there yet, play "
                  "together every day and ask your Kader about the KPSP developmental check at the Posyandu.",
        }[L],
    }
