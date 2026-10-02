# NutriSense product review and backlog

Owner: Product Manager. Last review: 2 October 2026, on a fresh demo database (web `localhost:8081`, API `localhost:8000`),
the code at commit `7102b14`, `docs/USER_GUIDE.md`, `README.md` and `docs/FACILITY_INTEGRATION.md`.

How to read this document:
- **Evidence** names the screen, endpoint or file where something was seen.
- **To validate with users** marks an assumption about the field (NTT, posyandu practice) that we have not checked with mothers, Kaders or Puskesmas staff.
- **To verify** marks a claim taken from code reading that an engineer should confirm.

---

## 1. Vision

Every child under five and every pregnant mother in a rural NTT village is known to her Kader, measured or checked on
time, and reaches the Puskesmas within a day when a danger sign appears. NutriSense is the shared notebook between the
family, the Kader, the bidan or doctor and the Dinas Kesehatan. It works on a cheap shared phone without signal. It
tells each person, in plain Indonesian, the one thing to do next, and it makes sure that a danger sign is seen,
answered and followed up, not just recorded.

**Overall verdict.** For a mother with a smartphone, NutriSense is already useful. It is clear, warm and safe-first.
Strong parts are the growth result in plain words, the "Untuk hari ini" checklist, the Buku KIA schedule, the pregnancy
K1–K6 tracker and the Puskesmas FHIR link. It is weakest where outcomes are decided:
- **Closing the loop after a danger sign or referral.** Alerts live only inside the app. Nobody acknowledges them and
  no outcome is recorded.
- **The Kader's posyandu day.** There is no roster of children who are due, no SKDN count, and a child can only be
  registered with a mother's email account.
- **Families without their own smartphone.** These are the families most at risk.

---

## 2. Users and jobs

Served: ✅ well · 🟡 partly · ❌ not at all.

### Mother with a child (caregiver)

| Job | Served | Evidence and gap |
|---|---|---|
| "Tell me if my child is growing well, and what to do." | 🟡 | ✅ The status is in plain words with colour and text (*Pertumbuhan baik*, *Perlu perhatian*), there are three SD tiles in words, the trend chart and "Yang bisa dilakukan". ❌ **For a `doctor_48h` result, the mother is never told to see a doctor.** Budi's triage says "Ke dokter dalam 48 jam", but his page lists "Ukur lagi · Dalam 2 minggu", food, ORS and "Hubungi Kader". The referral is shown only in the notification text (`components/AssessmentView.tsx` lines 67–77 drop every action except emergency, remeasure and ORS). |
| "My child is sick: is it dangerous, and who do I call?" | 🟡 | ✅ Tapping a danger sign shows "🚨 Perlu pertolongan" at once, with Puskesmas, 119 and Kader buttons. Typed text is read offline, and negations are handled. ❌ **If the mother has not given the optional "AI" consent, a child danger sign creates no case and alerts no Kader** (`routers/children.py` lines 335–352: `run_assessment` runs only with `ai_analysis`). The same gate stops the WHO-rule triage after a measurement (lines 177 and 208). WHO cut-offs and IMCI danger signs are clinical rules, not AI. |
| "Feed my child well with what we have." | ✅ | NutriScan works without a key: tap the foods, get the best cheap dish with a shopping list. 22 local recipes, and a diversity ring (5 of 8 groups). ⚠️ "Rencana gizi" shows the 7-day intake as a share of need (Budi: energy 29%, vitamin A 13%, calcium 8%). With sparse logging, this measures logging, not intake, and can alarm. |
| "Keep up with immunisation, vitamin A and the posyandu." | 🟡 | ✅ The KIA schedule is clear (PCV 3 "Terlewat… bawa ke Posyandu pada 12 Okt"), and the next posyandu date shows on Beranda. ❌ There are no reminders. Notifications are created only by events, and there is no push (no `expo-notifications`). |
| "See everything for my family at a glance." | 🟡 | Beranda opens on the first child (Adel, healthy). Budi has an overdue vaccine, 2T, symptoms and a package to collect, and Maria's own pregnancy is *Risiko tinggi*, but Beranda shows none of this until she switches the picker. |

### Pregnant mother

| Job | Served | Evidence and gap |
|---|---|---|
| "Is my pregnancy OK, and when is my next check-up?" | ✅ | The pregnancy page shows the risk with its reasons (KEK, anaemia) and "Hubungi bidan". It also shows the HPL countdown, K1–K6 with dates and "Sekarang", LiLA and Hb in plain words, and the Puskesmas results in plain words. |
| "Something feels wrong: what do I do?" | 🟡 | ✅ The danger tiles show call-bidan and 119 first, and the Kader is told. ❌ The danger report is **not queued offline** (`pregnancy/[id]/danger.tsx` calls `api()` directly), so with no signal the Kader never hears. ❌ Only the Kader is notified, in the app. There is no acknowledgement, no outcome, and the "urgent" flag drops after 3 days. ❌ Nuri's offline answers have no pregnancy danger signs: "perdarahan" or "air ketuban keluar" get the default "Maaf, Nuri belum bisa menjawab" (`ai/assistant.py`). |
| "Take my iron tablets and eat well for two." | 🟡 | ✅ The TTD/PMT daily log works (5 of 90). ❌ There is no daily reminder. The Tanya Nuri suggestions are about children ("Kenapa berat anak saya tidak naik?"), even for Agustina, who has no child. NutriScan and Paket are child-only, so a pregnant mother with KEK gets no PMT package through the locker flow. |

### Kader

| Job | Served | Evidence and gap |
|---|---|---|
| "Know who to visit first." | 🟡 | ✅ "Wilayah saya" counts and "Prioritas kunjungan" have search and filters. Pregnant mothers are listed by risk with the K visit that is due. ⚠️ Noise: at the fresh start, **30 of 49 children have an open case and 28 are "Perlu tinjauan"** (`/api/dashboard/summary`), and 11 cases are "Baru" in one Kader's list. When everything is a case, nothing is. |
| "Measure many children fast on posyandu day." | 🟡 | ✅ The measurement can skip the instructions, warns about implausible numbers, works offline, and "Anak berikutnya" returns to the list. ❌ There is no **posyandu-day roster** (children due this month, vaccines due, vitamin A in February and August). There is no SKDN tally, the Kader cannot set or move the posyandu date (`regions.posyandu_day` is seed-only), and there is no immunisation-due filter (`/api/dashboard/children`). |
| "Follow up a danger sign or referral until the family reaches care." | ❌ | Alerts are in-app only, with no push. A case has a status (Baru / Ditangani / Dirujuk / Selesai) but no referral destination, due date, "contacted" time or outcome (`models.Case`). Maternal danger reports never become a case. |
| "Register a new family." | 🟡 | ✅ "Tambah ibu hamil" creates the mother's account from her phone number, with a temporary password and verbal consent. ❌ "Tambah anak" asks only for **"Email orang tua (akun NutriSense)"**. The API accepts a phone number, but the screen does not, and there is no way to register a child whose mother has no account. The date is typed as `TTTT-BB-HH`. |
| "Help a mother who forgot her password." | ❌ | The login screen and the guide say "Minta kata sandi baru ke Kader atau Puskesmas", but there is no reset endpoint or screen for anyone (searched `routers/` and `cli.py`). |

### Health officer (Dinas Kesehatan)

| Job | Served | Evidence and gap |
|---|---|---|
| "See which villages and children need help first." | ✅ | KPI tiles, the risk map per village against the SSGI benchmark, the priority list, the flagged measurements and maternal KEK, anaemia, K1 and K6. All are labelled "Data demo". |
| "Report coverage upward (monthly)." | 🟡 | ✅ K1 and K6 coverage. ❌ No SKDN or D/S (share of children weighed), no immunisation coverage, no Kader activity, no trend over months for *our* villages, and no export (CSV or PDF). The national and NTT projection and the model card take dashboard space but are not actions. |
| "Get supplements to the right families." | 🟡 | ✅ Route options with reasons ("Terlalu jauh… lebih dari 12 km"). ❌ 20 requests wait for approval one at a time (`/logistics`). The hardware is simulated. ⚠️ The officer starts with **~30 notifications**, one per flagged child (`/notifications`). |

### Doctor

| Job | Served | Evidence and gap |
|---|---|---|
| "Review flagged children and set the right risk." | 🟡 | ✅ The case page shows the reasons, the "rules vs model" label, the model confidence, a set-risk control, a clinical note, "Bagikan ke keluarga" and "Telepon keluarga". ❌ The queue is 28 reviews out of 49 children, mostly low-confidence model results. Nothing is sorted by "waiting longest" and there is no SLA. |
| "Prepare for and close referrals." | ❌ | There is no "my referrals" list, no appointment date, and no record of whether the child arrived. The doctor dashboard is the officer dashboard. (Minor: opening `/home` as the doctor shows the mother home, "Selamat pagi, Bunda dr.", with all 49 children in the picker. It is not reachable from the tabs.) |
| "Approve prescription-only items (RUTF, deworming)." | ✅ | Doctor-only approval exists. |

### Puskesmas and hospital integration (SIMPUS vendor, bidan)

| Job | Served | Evidence and gap |
|---|---|---|
| "Send ANC check-ups to the mother's app with a standard, secure interface." | ✅ | FHIR R4 Bundle, hashed per-facility keys, resends are idempotent, write-only, and the mother can revoke her consent. It has a clear guide (`FACILITY_INTEGRATION.md`), a simulator and a demo portal. Codes are honestly marked "To verify" against SATUSEHAT. |
| "Link a mother at the visit." | 🟡 | Only the mother can turn the link on, in her own app. A mother without a smartphone, or one who has not opened the app, can never be linked. The Kader page says "Hanya ibu yang bisa menyalakannya". |
| "Close the loop on children and referrals." | ❌ | There is no child data (immunisation, growth at the Puskesmas, referral arrival), no nifas (KF/KN) and no read-back. The facility sends, but the Kader never learns whether the referred child or mother arrived. |

---

## 3. Feature value review

| Feature | Verdict | Reason |
|---|---|---|
| Guided 4-step measurement, WHO z-scores, 2T, trend projection | **Keep** | This is the core of stunting prevention. Plausibility checks and "skip instructions" are right. |
| "Untuk hari ini" checklist | **Improve** | It is the best mother screen, but it is per child. Make it family-wide, with the most urgent item first. |
| Plain-language result and "Yang bisa dilakukan" | **Improve** | Show the referral ("ke dokter/Puskesmas dalam 2 hari") as the first action whenever `urgency = doctor_48h`. |
| Symptom checker (tiles, typed text, offline rules) | **Improve** | Excellent reading of real phrasing, but alerts must not depend on the AI consent. |
| Buku KIA schedule (immunisation, vitamin A, deworming) | **Improve** | It is clear. Add reminders and a Kader "due this posyandu" view. |
| ASI eksklusif tracker | **Keep** | It is a key stunting factor, and it alerts the Kader when ASI eksklusif stops. |
| Development checklist | **Keep** | It is cheap and useful. Check that it is aligned to KPSP (to validate). |
| NutriScan (tap foods, best cheap dish, shopping list) | **Keep** | It solves "what can I cook today" with local, cheap food. The photo mode needs a key and internet, so tapping is the real field path. |
| Meal log and food-variety ring | **Keep** | It is simple and motivating. |
| "Rencana gizi" nutrient percentages | **Improve** | It can mislead: low logging reads as a deficit (vitamin A 13%). Show percentages only with ≥ 5 logged days, and lead with food groups. |
| Recipes (22 local) | **Keep** | They are local, cheap and use household measures. |
| Stickers, streaks, "height vs peers" | **Cut or park** | No job depends on them, and they are clutter on the child page. "vs peers" can shame (to validate with users). |
| Tanya Nuri | **Improve** | The offline FAQ has 9 topics, all about children, and none on pregnancy or maternal danger signs. Add those first. |
| "Dengar" (text to speech) | **Keep** | It is right for low literacy. Check that Indonesian TTS exists on cheap Android phones (to validate). |
| Pregnancy: HPL, K1–K6, LiLA/Hb, TTD/PMT, danger signs, birth plan, record birth → child profile | **Keep** | It is complete and follows Buku KIA. "Catat kelahiran" creating the child's profile is a strong continuity feature. |
| Hubungkan ke Puskesmas (FHIR inbound) | **Improve** | The design is sound. Add assisted linking (Kader or bidan with witnessed consent), nifas and outcomes. |
| Portal Puskesmas (demo) | **Keep for demos only** | It is useful to show the integration. Hide it outside demo mode. |
| Paket gizi and smart lockers | **Keep, conditional** | The flow is clear and says "Gratis, bantuan tambahan". The value depends on real lockers existing, so this needs field validation. Add bulk approval and maternal packages. |
| Logistics route options | **Keep** | The reasons are clear. It is officer-only. |
| Officer dashboard: KPIs, village map, priority list, flagged measurements | **Keep** | They answer "where first?". Add SKDN and coverage. |
| Dashboard prevalence projection and model card | **Move** | Move them behind "Detail teknis". They are thesis evidence, not officer actions. |
| Kader review of AI results ("Penilaian untuk ditinjau") | **Improve** | Volunteers confirming clinical risk is a questionable job. Give it to the bidan and doctor, and let the Kader only "raise a concern" (to validate). |
| Case notes shared with the family | **Keep** | It builds trust and shows as a "Rekomendasi tenaga kesehatan". |
| Notifications | **Improve** | They are in-app only, too many for officers, and not prioritised. Add push for danger signs and a digest for the rest. |
| Consent switches and "Data & privasi" | **Improve** | Split "AI (Claude)" from "clinical rules", so that refusing AI never switches off safety. |
| Offline outbox and sync banner | **Improve** | Extend it to pregnancy danger reports. |
| FHIR export and simulated SATUSEHAT sync | **Keep (background)** | It is future-proof. It has no user-facing value today. |

---

## 4. Gaps, ordered by impact on stunting and maternal outcomes

1. **Danger and referral follow-up loop.** Today a danger sign or a "ke dokter dalam 48 jam" result produces an in-app
   notification and a case with no owner, no deadline and no outcome. Gaps:
   - no push notification;
   - no "I contacted her" acknowledgement;
   - no escalation to the bidan or officer when nobody acts;
   - no "arrived at the Puskesmas" outcome;
   - maternal danger reports are not cases at all.

   This is where deaths and severe wasting are prevented.
2. **Safety must not depend on the optional AI consent.** WHO cut-offs, oedema and danger-sign triage are skipped
   without `ai_analysis` consent (to verify with the backend and data-ai engineers; seen in `routers/children.py`).
3. **Families without their own smartphone.** The Kader cannot register a child for a mother without an email account,
   cannot reset a forgotten password, and cannot link a mother to the Puskesmas. There is no SMS. In NTT many families
   share one phone or have a basic phone (to validate with users). These are the highest-risk families.
4. **Posyandu-day workflow.** There is no roster of who is due, no fast "next child in roster", no immunisation or
   vitamin A due list, and no SKDN (S, K, D, N) at the end of the day. The Kader cannot set the date. Monthly weighing
   coverage (D/S) is the main lever for catching faltering growth early.
5. **Reminders.** There are no reminders for immunisation due, posyandu day (H-1), ANC visit due, the daily TTD or
   re-measuring in 2 weeks. Local scheduled notifications would work offline. SMS would cover basic phones.
6. **Mother sees the referral.** For `doctor_48h`, the mother's page and the "Dengar" audio never say "see a doctor".
7. **Pregnancy support outside the pregnancy page.** Nuri (FAQ and suggestions) is child-only and has no maternal
   danger signs. There are no maternal PMT or TTD packages. NutriScan has no pregnancy mode.
8. **Alert fatigue.** 61% of children have an open case at the start, and 57% are flagged for review. Officers get one
   notification per flagged child. Low-confidence model output should go to a review list, not create cases and
   notifications.
9. **Reporting upward.** The officer has no SKDN or D/S, no immunisation coverage, no trend over time for their
   villages, no Kader activity and no export in the format the Puskesmas and Dinkes already report in (e-PPGBM, PWS KIA;
   to validate which ones).
10. **Integration closes no loops for children.** Inbound data is ANC only. There is no referral arrival, child
    immunisation or nifas (KF/KN), and no linking by the bidan.
11. **Local languages.** The app is in Indonesian and English only. Audio in Uab Meto (Dawan), Rote, Sabu or Helong for
    the key danger messages may matter more than text (to validate with users).

---

## 5. Success measures

Each measure is computed per village and per Kader, monthly, unless noted.

| Job | Measure | How the app can compute it today, or what is missing |
|---|---|---|
| Monthly growth monitoring | **D/S: share of children aged 0–59 months measured this month** (target ≥ 80%, to validate) | `measurements.measured_at` in the month ÷ active `children` with age < 60 months, by `region_id`. Computable now. |
| Healthy growth | **N/D: share of weighed children who gained enough weight (KBM)**, and the count of 2T | `weight_gain.weighings[].result == "N"` (already computed per child) and `two_t`. Computable now. |
| Kader speed | **Median time for a Kader to measure one child** (target < 90 s, to validate) | Missing. Log `measure_opened` and `measure_saved` timestamps on the client (or the outbox `queued_at`). Proxy now: the gap between consecutive `measurements.created_at` by the same Kader on posyandu day. |
| Danger follow-up | **Share of danger reports (child or maternal) followed by Kader contact ≤ 2 h and a Puskesmas visit ≤ 24 h** | Missing outcome data. Needs `acknowledged_at` and `outcome` (`visited_facility_at`) on cases and on `PregnancyDangerReport`. Partial proxy now: the first `CaseNote` or status change after `case.created_at`, and for linked mothers, an `AncExam.received_at` within 24 h of the report. |
| Referral completion | **Share of `doctor_48h` cases seen by a doctor within 48 h** | Needs a referral date and outcome on `Case`. `resolved_at` exists but says nothing about the visit. |
| ANC | **K6 coverage** (≥ 6 ANC visits among mothers delivered in the last 12 months or ≥ 36 weeks pregnant), **K1 in trimester 1** | Already on the dashboard (`/api/dashboard/mothers`: K6 3/7, K1 7/9). |
| Maternal nutrition | **Share of KEK and anaemic mothers with ≥ 90 TTD and ≥ 1 PMT logged** | `PregnancyDailyLog.ttd` and `.pmt` sums per pregnancy, with flags from `MaternalMeasurement`. Computable now. Mother self-report only. |
| Immunisation | **Share of children with complete basic immunisation for their age** | KIA records (`/api/children/{id}/kia`), aggregated per area. Computable now with a new aggregate. |
| Alert quality | **Alerts per Kader per week, and the share acted on within 48 h** | `notifications` per user plus `read_at` and a later case action. Needs `read_at`, if it is not stored (to verify). |
| AI review load | **Human review rate and human–AI agreement** | Already in `/api/dashboard/evaluation` (`flagged_low_confidence` 28 of 49; `human_ai_agreement_rate`). |
| Packages | **Pickup rate and median hours from ready to pickup; expired codes** | `/api/dashboard/evaluation` (`avg_hours_ready_to_pickup`, `pickups_completed`), plus `pickup_expired` notifications. |
| Mother engagement | **Share of mothers active weekly; meals logged per child per week** | `audit_logs` or `meals` by `caregiver_id`. Computable now. |
| Nuri usefulness | **Share of Nuri answers that are the "can't answer" default** | `chat_messages.generated_by == "faq"` and the content equals the default. Shows which FAQ topics to add. |

---

## 6. Backlog: top 10, ordered by impact

| # | User | Job | Why (evidence) | Effort | Owner role(s) |
|---|---|---|---|---|---|
| 1 | Kader, mother, bidan | Make sure every danger sign and urgent referral reaches care within 24 h | There is no push, no acknowledgement, no escalation and no outcome. Maternal danger reports are not cases. It is the outcome that matters most. Build: push for danger alerts; a "Perlu tindakan sekarang" queue with "Sudah dihubungi", then "Sudah ke Puskesmas"; escalation to the bidan or officer after 2 h; outcome fields. | L | backend-engineer, mobile-developer (push), frontend-engineer, ux-designer, qa-engineer |
| 2 | Mother, Kader | Get the WHO-rule triage and danger alerts even without the AI consent | `run_assessment` and case creation are gated on `ai_analysis` (`routers/children.py` lines 177, 208, 335). Gate only Claude calls on that consent. | S | backend-engineer, data-ai-engineer, qa-engineer |
| 3 | Mother | Know that my child must see a doctor in 2 days | Budi's page omits "Ke dokter dalam 48 jam" (`AssessmentView.tsx`). Make it the first action, with the Puskesmas phone, in the audio too, and add "Sudah ke dokter?". | S | ux-designer (copy), frontend-engineer |
| 4 | Kader, families without a smartphone | Register any child or mother by name and phone, reset a forgotten password, and link a mother to the Puskesmas with witnessed consent | "Tambah anak" needs a parent's email account. There is no reset at all, though the guide promises one. Only the mother can link. | M | backend-engineer, frontend-engineer, ux-designer |
| 5 | Kader | Run posyandu day fast | Build: a roster of children due this month, "next child in roster", vaccines and vitamin A due, the SKDN tally at the end, and a settable posyandu date. It drives D/S and the measuring time. | M–L | ux-designer, frontend-engineer, backend-engineer |
| 6 | Mother, pregnant mother | Be reminded on time | There are no reminders today. Add local scheduled notifications (offline) for posyandu H-1, vaccine due, ANC due, daily TTD and re-measure in 2 weeks. SMS comes later (Open question 7). | M | mobile-developer, backend-engineer, ux-designer |
| 7 | Kader, officer, doctor | See only alerts that need a person | 30 of 49 children have open cases and 28 are "Perlu tinjauan" at the start, and officers get ~30 notifications. Create a case only when `triage.escalate`. Send low-confidence results to a review list. Send a daily digest for non-urgent items. | M | data-ai-engineer, backend-engineer, frontend-engineer |
| 8 | Pregnant mother | Get help for my pregnancy from Nuri and offline | The Nuri FAQ has no maternal danger signs ("perdarahan" gets the default answer) and its suggestions are about children. Add maternal FAQ and danger patterns (ke Puskesmas / 119 first), pregnancy topic chips, and queue danger reports offline. | S–M | data-ai-engineer, frontend-engineer, mobile-developer |
| 9 | Officer, Puskesmas | Report coverage and act on trends | Add D/S, N/D, immunisation coverage, Kader activity, a monthly trend per village, and CSV or PDF export in the existing report format. Move the projection and model card behind "Detail teknis". | M | backend-engineer, frontend-engineer, ux-designer |
| 10 | Mother (family) | See who in my family needs me today | Beranda opens on the first child even when a sibling or the pregnancy is urgent. Open on the most urgent member, or show a family "Untuk hari ini". | S | ux-designer, frontend-engineer |

Next in line:
- referral and nifas messages from the Puskesmas (FHIR), and immunisation import;
- bulk approval of packages, and maternal PMT packages;
- the nutrient percentages only with enough logged days;
- park stickers and streaks;
- a route guard so staff never see the mother home;
- local-language audio for danger messages.

---

## 7. Open questions for the owner

1. **Who is the first real deployment?** One Puskesmas area with its Kaders? The answer decides between SMS and push,
   and whether lockers are real.
2. **Smartphones.** What share of mothers in the target villages have their own smartphone, a shared one or a basic
   phone? (To validate with users.) If it is under half, Kader-assisted accounts and SMS move to the top.
3. **Lockers.** Will physical smart lockers exist in the pilot? If not, should packages become "ambil di posyandu" with
   a Kader confirming handover?
4. **Kader role in AI review.** Should volunteer Kaders confirm or raise AI risk, or only flag concerns for the bidan?
5. **Reporting format.** Which reports must the app produce for Puskesmas and Dinkes (e-PPGBM, PWS KIA, SKDN)? Can
   NutriSense data be accepted there?
6. **Escalation chain.** If a Kader does not acknowledge a danger alert within 2 hours, who is next: the village bidan,
   the Puskesmas or the officer? Is calling 119 realistic in each village?
7. **SMS budget.** Is there budget and a gateway for SMS reminders and alerts? Which numbers may we message, with what
   consent?
8. **Local languages.** Which languages matter in the pilot villages? Is audio-only acceptable for them?
9. **Real data.** When will a consented real cohort replace the synthetic training data? Until then, should the
   model-based risk level be hidden from mothers and only the WHO rules shown?
