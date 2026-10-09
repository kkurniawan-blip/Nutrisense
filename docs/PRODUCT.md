# NutriSense product review and backlog

Owner: Product Manager. Last review: 9 October 2026, on the code at commit `d83ce7f` (HEAD), `git log 7102b14..d83ce7f`,
`docs/PENGUJIAN-FITUR.md` (83/83 feature checks), `docs/USER_GUIDE.md` and the feature arena verdict
`docs/arena/2026-10-09/VERDICT.md`. The shared servers were being restarted for a test run, so this review is from the
code and the test reports, not from the running app. Demo counts (cases, notifications) are the latest seen: the
2 October run, or the arena's live checks on 9 October where stated. Previous review: 2 October 2026, commit `7102b14`.

How to read this document:
- **Evidence** names the screen, endpoint or file where something was seen.
- **Fixed since 2 Oct** marks a gap from the last review that is now closed, with the commit and the file where it was
  checked in code.
- **To validate with users** marks an assumption about the field (NTT, posyandu practice) that we have not checked with mothers, Kaders or Puskesmas staff.
- **To verify** marks a claim taken from code reading that an engineer should confirm.

**What changed since 2 October, in short.** Seven of the gaps from the last review are closed, or closed for the most
urgent case:
- Safety no longer depends on the optional AI consent (`fb9ef59`).
- The `doctor_48h` referral is the first action on the child's result (`d385071`).
- Maternal danger reports are queued offline (`d385071`).
- Nuri answers danger first and has a pregnancy FAQ (`54e57a1`).
- A Kader can add a child by the mother's phone number (`d385071`).
- Nifas visits can be marked (`2f93fdf`).
- The two arena winners are built: maternal danger reports that stay open until staff follow up, with the doctor
  notified (`de83f23`, `7e76361`), and danger signs for babies under 2 months (`4fc7b09`, `7e76361`).

Still open, and still mattering most:
- the child referral loop;
- nifas danger signs;
- push and SMS;
- the posyandu-day workflow;
- password reset;
- alert overload.

---

## 1. Vision

Every child under five and every pregnant mother in a rural NTT village is known to her Kader, measured or checked on
time, and reaches the Puskesmas within a day when a danger sign appears. NutriSense is the shared notebook between the
family, the Kader, the bidan or doctor and the Dinas Kesehatan. It works on a cheap shared phone without signal. It
tells each person, in plain Indonesian, the one thing to do next, and it makes sure that a danger sign is seen,
answered and followed up, not just recorded.

**Overall verdict.** For a mother with a smartphone, NutriSense is useful and now safer. It is clear, warm and
safe-first. Strong parts:
- the growth result in plain words, now leading with the doctor referral when there is one;
- the "Untuk hari ini" checklist;
- the Buku KIA schedule;
- the pregnancy K1–K6 tracker;
- the Puskesmas FHIR link;
- since 9 October, a maternal danger report that cannot get lost, and newborn danger signs.

It is still weakest where outcomes are decided:
- **Closing the loop after a child's danger sign or referral.** The maternal loop is now closed, with contact and
  outcome recorded. Child cases still have no "contacted" time and no outcome, and nothing reaches a phone that is not
  open on the app (no push, no SMS).
- **The Kader's posyandu day.** There is no roster of children who are due, and no SKDN count. Search hides children
  outside the priority filter, and the KIA "terlewat" (missed) status is noisy.
- **Families without their own smartphone.** A child can now be added by the mother's phone number, but only if she
  already has an account. There is still no password reset and no assisted Puskesmas link. These are the families
  most at risk.
- **After birth (nifas).** Visits can be marked, but a mother cannot report postpartum danger signs.

---

## 2. Users and jobs

Served: ✅ well · 🟡 partly · ❌ not at all. "Fixed since 2 Oct" names the evidence for the change.

### Mother with a child (caregiver)

| Job | Served | Evidence and gap |
|---|---|---|
| "Tell me if my child is growing well, and what to do." | ✅ (was 🟡) | ✅ The status is in plain words with colour and text, there are three SD tiles in words, the trend chart and "Yang bisa dilakukan". **Fixed since 2 Oct:** for a `doctor_48h` result, "Bawa ke dokter/Puskesmas dalam 2 hari" is now the first action (`d385071`, `components/AssessmentView.tsx` lines 63–75). ❌ Still open: Beranda's status pill ignores the urgency (`lib/status.ts`), so the doctor visit is not on Beranda, and nobody asks "Sudah ke dokter?" (arena pitch UX-2, next in line). |
| "My child is sick: is it dangerous, and who do I call?" | ✅ (was 🟡) | ✅ Danger tiles go to "Perlu pertolongan" with Puskesmas, 119 and Kader buttons, offline too. **Fixed since 2 Oct:** WHO-rule triage, cases and Kader alerts run without the optional AI consent; only the Claude text needs it (`fb9ef59`, `routers/children.py` lines 231–234, 264, 389). **Fixed (arena winner 2):** a baby under 2 months gets her own danger signs: fever, poor feeding, jaundice, a red or pus-filled cord, a cold body and grunting. Age comes from the child's record, the tiles need no typing, and it works offline (`4fc7b09`, `7e76361`, `ai/symptoms.py` lines 22–46, `child/[id]/symptoms.tsx` lines 23–66; feature check B20). ⚠️ The wording needs clinical sign-off (Buku KIA, MTBS). ❌ The Kader alert is still in-app only. |
| "Feed my child well with what we have." | ✅ | NutriScan works without a key, there are 22 local recipes, and the diversity ring. ⚠️ Unchanged: "Rencana gizi" shows intake as a share of need even with few logged days (`ai/nutrition.py` returns `percent_of_need` from 1 day). This measures logging, not intake, and can alarm. |
| "Keep up with immunisation, vitamin A and the posyandu." | 🟡 | ✅ The KIA schedule is clear, and the next posyandu date shows on Beranda. ❌ There are no reminders and no push (`mobile/package.json` has no `expo-notifications`). ⚠️ **New finding (arena):** "terlewat" is noisy. `ai/kia.py` lines 45–55 have no catch-up window and treat "not recorded" as missed, so a 3-year-old shows HB0 and BCG as missed. |
| "See everything for my family at a glance." | 🟡 | **Fixed since 2 Oct:** Beranda opens on whoever needs her most, an urgent pregnancy or the child with the most urgent status, not the first child listed (`d385071`, `(tabs)/home.tsx` lines 87–96). ❌ Still open: "most urgent" uses the status, which ignores `doctor_48h` (see the first row). There is no family-wide "Untuk hari ini". |

### Pregnant mother

| Job | Served | Evidence and gap |
|---|---|---|
| "Is my pregnancy OK, and when is my next check-up?" | ✅ | Risk with its reasons, "Hubungi bidan", the HPL countdown, K1–K6 with dates, LiLA and Hb in plain words, and Puskesmas results in plain words. |
| "Something feels wrong: what do I do?" | ✅ (was 🟡) | **Fixed since 2 Oct:** the report is kept offline and sent once, and without signal the call buttons come first (`d385071`, `pregnancy/[id]/danger.tsx` line 42 `saveOrQueue`; feature check D7). Nuri recognises "perdarahan" and "air ketuban keluar" and answers "Segera ke Puskesmas atau telepon 119" first (`54e57a1`, `ai/assistant.py` lines 31–64; C2). **Fixed (arena winner 1):** the report stays open until staff record an outcome, and a later "Mual" no longer clears it (`de83f23`, `routers/maternal.py` lines 120–134). The doctor is notified as well as the Kader (line 447). The mother's red card says "Tanda bahaya: segera ke Puskesmas atau telepon 119" with the 119 and Puskesmas buttons, then who called her (`components/PregnancyParts.tsx` lines 22–50). The message after reporting says "Jangan menunggu: telepon bidan atau 119 sekarang" (F13). ⚠️ Still open: no push, so staff see it only when they open the app. An unclosed report drops after 14 days (`DANGER_OPEN_DAYS`). |
| "Take my iron tablets and eat well for two." | 🟡 | ✅ The TTD/PMT daily log works, and Nuri's offline FAQ now covers pregnancy (`54e57a1`). ❌ There is no daily reminder. The Nuri suggestion chips are still child-only (topics growth, eating, symptoms and development: `(tabs)/assistant.tsx` lines 83–104). There is still no maternal PMT package. |
| "After the birth: are my baby and I OK?" (new row) | 🟡 | **Fixed since 2 Oct:** KF/KN nifas visits can be marked and undone (`2f93fdf`, `pregnancy/[id]/index.tsx` line 128; D11). Newborn danger signs work (see above). ❌ There are no postpartum danger signs. The tiles are pregnancy signs (`lib/pregnancy.ts` lines 9–18), the red card hides after delivery (`PregnancyParts.tsx` line 26), and a danger report raises the risk only for an active pregnancy (`routers/maternal.py` line 187). Arena pitch AI-2 (83.7) lost only on effort. |

### Kader

| Job | Served | Evidence and gap |
|---|---|---|
| "Know who to visit first." | 🟡 | ✅ **New (arena winner 1):** a red card is pinned at the top of home for every open maternal danger report: name, sign, time, "Telepon ibu", and whether someone has called (`components/DangerAlerts.tsx`, `KaderHome.tsx`). It is cached, so it shows offline. ⚠️ Still noisy: on 9 October the arena counted 22 alerts for one Kader's 23 children (AI-3). ❌ **New finding (arena):** search runs inside the default "Prioritas" filter, so a child outside it cannot be found by name (`KaderHome.tsx` lines 51 and 64–70: `filter=priority` is sent with `q`). |
| "Measure many children fast on posyandu day." | 🟡 | ✅ Skip-instructions, plausibility checks, offline, "Anak berikutnya". ❌ Unchanged: there is no posyandu-day roster (children due, vaccines and vitamin A due) and no SKDN tally. The posyandu date cannot be set (`regions.posyandu_day` is seed-only). A due-vaccine chip would first need the KIA overdue fix (PJ-3 and PM-2 lost on that). |
| "Follow up a danger sign or referral until the family reaches care." | 🟡 (was ❌) | **Fixed for mothers (arena winner 1):** on the pregnancy page, "Sudah saya hubungi", then an outcome: went to the facility, advised at home, or could not be reached. "Tidak bisa dihubungi" only logs an attempt and keeps the report open. It is audited and limited to the Kader's area (`routers/maternal.py` lines 457–485, `DangerAlerts.tsx`; F13). ❌ Still open: child cases have no contact time, referral destination, due date or outcome (`models.Case` lines 220–230). The staff follow-up works only online (the outbox replays POSTs, this is a PATCH). Urgent Puskesmas check-ups from facility sync notify the Kader but do not enter the loop (`services/facility_sync.py` line 444). There is no push. |
| "Register a new family." | 🟡 | **Fixed since 2 Oct:** "Tambah anak" finds the mother by phone number (the default) or email (`d385071`, `child/new.tsx` lines 15–106; F5). ❌ Still open: the mother must already have an account (`routers/children.py` lines 43–47 return 404 otherwise). The date is still typed as `2024-05-17` (`child/new.tsx` line 120). |
| "Help a mother who forgot her password." | ❌ | Unchanged. The login screen still says "Minta kata sandi baru ke Kader atau Puskesmas" (`lib/i18n.ts` line 1515), but there is no reset endpoint or screen (`routers/auth.py` has only `change_password`; `cli.py` has `user-add` and `facility`). Arena pitches PJ-2 and PM-3 (69.3) lost on safety: the Kader would learn the password, and nothing forces a change. |

### Health officer (Dinas Kesehatan)

| Job | Served | Evidence and gap |
|---|---|---|
| "See which villages and children need help first." | ✅ | KPI tiles, the risk map against SSGI, the priority list, flagged measurements, maternal indicators. **New:** open maternal danger reports are pinned at the top of the dashboard (`(tabs)/dashboard.tsx` line 204). ⚠️ For doctors and officers, they come from every region (`/api/kader/danger-open` filters only for the Kader). |
| "Report coverage upward (monthly)." | 🟡 | Unchanged. K1 and K6 only. There is no D/S, immunisation coverage, Kader activity, monthly trend or export. The model card is behind "Detail teknis", but the national projection still takes main dashboard space (`dashboard.tsx` line 339). |
| "Get supplements to the right families." | 🟡 | Unchanged. The route options have reasons, but requests are approved one at a time. ⚠️ The arena counted **45 officer notifications** on the demo, one per flagged child (AI-3, live API, 9 Oct). |

### Doctor

| Job | Served | Evidence and gap |
|---|---|---|
| "Review flagged children and set the right risk." | 🟡 | ✅ Reasons, "rules vs model", confidence, set-risk, clinical note, "Bagikan ke keluarga". ❌ Unchanged: the review queue is long (every `needs_review` result opens a case and a notification: `services/assessment.py` lines 294–310) and has no "waiting longest" order. |
| "Prepare for and close referrals." | 🟡 (was ❌) | **Fixed for mothers:** the doctor is notified of each maternal danger report, sees open reports pinned on the dashboard, and can record contact and outcome (`de83f23`, `7e76361`). ❌ Children: no "my referrals" list, no appointment date, no arrival record. (Minor, unchanged: `/home` as a doctor still renders the mother home, `(tabs)/home.tsx` line 323. It is not reachable from the tabs.) |
| "Approve prescription-only items (RUTF, deworming)." | ✅ | Doctor-only approval exists. |

### Puskesmas and hospital integration (SIMPUS vendor, bidan)

| Job | Served | Evidence and gap |
|---|---|---|
| "Send ANC check-ups to the mother's app with a standard, secure interface." | ✅ | FHIR R4 Bundle, hashed per-facility keys, idempotent, write-only, revocable. The SATUSEHAT messages are now in plain words (`2f93fdf`). |
| "Link a mother at the visit." | 🟡 | Unchanged. Only the mother can turn the link on, in her own app. |
| "Close the loop on children and referrals." | ❌ | Unchanged. There is no child data, no nifas (KF/KN) inbound and no read-back. Urgent check-ups notify the Kader only and are not part of the new danger follow-up. |

---

## 3. Feature value review

| Feature | Verdict | Reason |
|---|---|---|
| Guided 4-step measurement, WHO z-scores, 2T, trend projection | **Keep** | This is the core of stunting prevention. WHO overrides (WHZ, MUAC, HAZ, 2T, oedema) now raise the level (`54e57a1`). |
| "Untuk hari ini" checklist | **Improve** | It is the best mother screen, and the maternal danger item now comes first. Next: make it family-wide, and add the doctor visit (UX-2) with a way to clear it. |
| Plain-language result and "Yang bisa dilakukan" | **Keep** | Fixed: the referral is the first action for `doctor_48h`. Next: an "Sudah ke dokter?" answer, so the item can close. |
| Symptom checker (tiles, typed text, offline rules) | **Keep** | Alerts no longer depend on the AI consent, and babies under 2 months have their own signs. Get clinical sign-off on the newborn wording. |
| Buku KIA schedule (immunisation, vitamin A, deworming) | **Improve** | Fix "terlewat" first: catch-up windows, and "not recorded" is not the same as "missed" (`ai/kia.py` lines 45–55). Then add reminders and a Kader "due this posyandu" view. |
| ASI eksklusif tracker | **Keep** | It is a key stunting factor, and it alerts the Kader when ASI eksklusif stops. |
| Development checklist | **Keep** | It is cheap and useful. Check that it is aligned to KPSP (to validate). |
| NutriScan (tap foods, best cheap dish, shopping list) | **Keep** | It solves "what can I cook today" with local, cheap food. |
| Meal log and food-variety ring | **Keep** | It is simple and motivating. |
| "Rencana gizi" nutrient percentages | **Improve** | Unchanged and still able to mislead. Show percentages only with ≥ 5 logged days, and lead with food groups. |
| Recipes (22 local) | **Keep** | They are local, cheap and use household measures. |
| Stickers, streaks, "height vs peers" | **Cut or park** | No job depends on them. "vs peers" can shame (to validate with users). |
| Tanya Nuri | **Improve** | Fixed: it answers danger first, and the offline FAQ covers pregnancy, ASI, KIA and newborns. Still open: the suggestion chips are child-only, so a pregnant mother sees "Kenapa berat {n} tidak naik?". Add a "Kehamilan" topic. |
| "Dengar" (text to speech) | **Keep** | It is right for low literacy. There is now a check for an Indonesian voice (`d385071`). |
| Pregnancy: HPL, K1–K6, LiLA/Hb, TTD/PMT, danger signs, birth plan, record birth → child profile | **Keep** | It is complete and follows Buku KIA. |
| Maternal danger follow-up (open until an outcome; Kader and doctor cards) | **Keep, harden** | New (arena winner 1). It is the first closed loop in the app. Next: offline staff follow-up, regional scoping for doctors and officers, facility-urgent check-ups in the same loop, and push. |
| Nifas visits (KF/KN) | **Improve** | They can now be marked. Add postpartum danger signs, and keep the red card after the birth (AI-2). |
| Hubungkan ke Puskesmas (FHIR inbound) | **Improve** | The design is sound. Add assisted linking, nifas inbound and referral outcomes. |
| Portal Puskesmas (demo) | **Keep for demos only** | Hide it outside demo mode. |
| Paket gizi and smart lockers | **Keep, conditional** | The value depends on real lockers (Open question 3). Add bulk approval and maternal packages. |
| Logistics route options | **Keep** | The reasons are clear. It is officer-only. |
| Officer dashboard: KPIs, village map, priority list, flagged measurements | **Keep** | They answer "where first?". Add SKDN and coverage. |
| Dashboard prevalence projection | **Move** | The model card is already behind "Detail teknis"; move the projection there too. |
| Kader review of AI results ("Penilaian untuk ditinjau") | **Improve** | Volunteers confirming clinical risk is a questionable job (Open question 4). |
| Case notes shared with the family | **Keep** | It builds trust. |
| Notifications | **Improve** | They are in-app only and not prioritised: 45 for the officer on the demo. Add push for danger signs and a digest for the rest. |
| Consent switches and "Data & privasi" | **Keep** | Fixed: refusing AI no longer switches off safety. |
| Offline outbox and sync banner | **Keep** | It now carries maternal danger reports, and the sync count is consistent (`7d0b5cd`, `0873da2`). Next: staff follow-up actions (PATCH). |
| FHIR export and simulated SATUSEHAT sync | **Keep (background)** | It is future-proof. It has no user-facing value today. |

---

## 4. Gaps, ordered by impact on stunting and maternal outcomes

1. **Danger and referral follow-up loop: half closed.**
   - **Fixed since 2 Oct:** maternal danger reports are now tracked to an outcome. A later complaint no longer clears
     them, the doctor is notified as well as the Kader, and both see a pinned card with "Telepon ibu" and the outcome
     buttons (arena winner 1: `de83f23`, `7e76361`; F13).
   - **Still open:**
     - there is no push or SMS, so an alert reaches only a staff member who opens the app;
     - there is no escalation when nobody acts (there is no scheduler);
     - child cases, including `doctor_48h`, have no "contacted" time, destination, due date or outcome;
     - staff follow-up works only online;
     - urgent Puskesmas check-ups are outside the loop;
     - doctors and officers see open reports from every region.

   This is still where deaths and severe wasting are prevented.
2. **Postpartum (nifas) danger signs.** There are no Buku KIA postpartum signs to report: heavy bleeding after the
   birth, fever, foul discharge, breast problems, severe sadness. After delivery the red card hides, and a report does not
   raise the mother's risk (`routers/maternal.py` line 187). Arena pitch AI-2 (83.7): the mental-health sign needs its
   own referral wording and clinical sign-off (to validate with users and clinicians).
3. **Danger signs in babies under 2 months.** **Fixed since 2 Oct** (arena winner 2: `4fc7b09`, `7e76361`; B20).
   Open: clinical sign-off on the wording and the thresholds as Kemenkes applies them.
4. **Safety must not depend on the optional AI consent.** **Fixed since 2 Oct** (`fb9ef59`, `routers/children.py`
   lines 231–234). The arena verdict lists it under "Keep, do not change".
5. **Families without their own smartphone.**
   - **Partly fixed:** a Kader can add a child by the mother's phone number (`d385071`).
   - **Still open:**
     - she must already have an account;
     - there is no password reset, though the login screen promises one (PJ-2, PM-3);
     - there is no assisted Puskesmas link;
     - there is no SMS.

   Many NTT families share one phone or have a basic phone (to validate with users).
6. **Posyandu-day workflow.** Unchanged. There is no roster of who is due, no vaccine or vitamin A due list, no SKDN,
   and the posyandu date cannot be set. Two arena findings block the first steps:
   - the KIA overdue noise (`ai/kia.py` lines 45–55);
   - search hiding children outside the priority filter (`KaderHome.tsx` lines 64–70; UX-3, a one-line fix).
7. **Reminders.** Unchanged. There are no reminders for posyandu H-1, vaccines due, ANC due, the daily TTD or
   re-measuring. Local scheduled notifications would work offline, and SMS would reach basic phones.
8. **Alert fatigue.** Unchanged. Every `needs_review` result opens a case and notifies Kader and officer
   (`services/assessment.py` lines 294–310). The arena counted 45 identical officer notifications hiding the one
   emergency, and 22 alerts for one Kader's 23 children (AI-3). AI-3's fix lost because review-only children would land
   in a list with no owner or due date. The next attempt must give that list an owner.
9. **Mother sees the referral.** **Fixed on the result page** (`d385071`). Still open on Beranda: the status ignores
   `doctor_48h`, and the item never clears after the visit (UX-2, 86.3, "next in line" in the verdict).
10. **Pregnancy support outside the pregnancy page.**
    - **Partly fixed:** Nuri now covers pregnancy and its danger signs (`54e57a1`).
    - **Still open:** the suggestion chips are child-only, there are no maternal PMT or TTD packages, and NutriScan
      has no pregnancy mode.
11. **Reporting upward.** Unchanged. There is no D/S, immunisation coverage, trend, Kader activity or export (e-PPGBM,
    PWS KIA; to validate which ones). The arena noted that D/S counts registered children, not every child in the
    village.
12. **Integration closes no loops for children.** Unchanged. Inbound is ANC only. There is no referral arrival, child
    immunisation or nifas, and the bidan cannot link a mother.
13. **Local languages.** Unchanged. The app is in Indonesian and English only. Audio danger messages in Uab Meto,
    Rote, Sabu or Helong may matter most (to validate with users).

---

## 5. Success measures

Each measure is computed per village and per Kader, monthly, unless noted.

| Job | Measure | How the app can compute it today, or what is missing |
|---|---|---|
| Monthly growth monitoring | **D/S: share of children aged 0–59 months measured this month** (target ≥ 80%, to validate) | `measurements.measured_at` in the month ÷ active `children` aged < 60 months, by `region_id`. Computable now. The denominator is registered children only (arena, PM-2). The demo reads 100% because every seeded child was measured today. |
| Healthy growth | **N/D: share of weighed children who gained enough weight (KBM)**, and the count of 2T | `weight_gain.weighings[].result == "N"` and `two_t`. Computable now. |
| Kader speed | **Median time for a Kader to measure one child** (target < 90 s, to validate) | Missing. Log `measure_opened` and `measure_saved` on the client. Proxy: the gap between consecutive `measurements.created_at` by the same Kader on posyandu day. |
| Maternal danger follow-up | **Share of maternal danger reports with staff contact ≤ 2 h, and an outcome ≤ 24 h; share "went to facility"** | **Computable now** (new since 2 Oct): `PregnancyDangerReport.created_at`, `contacted_at`, `outcome`, `outcome_at`. "Could not be reached" attempts are in the audit log. Visit confirmation is staff-reported. For linked mothers, cross-check with an `AncExam.received_at` within 24 h. |
| Child danger and referral follow-up | **Share of child emergency and `doctor_48h` cases with contact ≤ 2 h and seen by a doctor ≤ 48 h** | Still missing. `Case` needs `contacted_at`, `outcome` and `outcome_at`, as on maternal reports. `resolved_at` says nothing about the visit. |
| Newborn danger signs | **Share of symptom reports for babies < 60 days that raise a danger sign, and their follow-up** | `SymptomReport` with the child's age at report < 60 days, and the resulting `Case`. Computable now. The follow-up part needs the case outcome above. |
| ANC | **K6 coverage**, **K1 in trimester 1** | Already on the dashboard (`/api/dashboard/mothers`). |
| Nifas | **Share of births with KF1 and KN1 marked within 48 h** | `Pregnancy.delivered_at` and `nifas_done` (new since 2 Oct). Computable now. Self-reported or Kader-reported, not from the facility. |
| Maternal nutrition | **Share of KEK and anaemic mothers with ≥ 90 TTD and ≥ 1 PMT logged** | `PregnancyDailyLog.ttd` and `.pmt` sums, with flags from `MaternalMeasurement`. Computable now. |
| Immunisation | **Share of children with complete basic immunisation for their age** | KIA records aggregated per area. Computable, but only after the catch-up and "not recorded" fix in `ai/kia.py`, or it will undercount. |
| Alert quality | **Alerts per Kader and officer per week, and the share acted on within 48 h** | `notifications` per user plus `read_at` and a later case action (to verify that `read_at` is stored). Baseline: 45 officer notifications on the demo (arena, 9 Oct). |
| AI review load | **Human review rate and human–AI agreement** | Already in `/api/dashboard/evaluation`. |
| Packages | **Pickup rate, median hours from ready to pickup, expired codes** | `/api/dashboard/evaluation` plus `pickup_expired` notifications. |
| Mother engagement | **Share of mothers active weekly; meals logged per child per week** | `audit_logs` or `meals` by `caregiver_id`. Computable now. |
| Nuri usefulness | **Share of Nuri answers that are the "can't answer" default, and share that are danger-first** | `chat_messages.generated_by == "faq"` and the reply content. |

---

## 6. Backlog: top 10, ordered by impact

Arena pitch IDs refer to `docs/arena/2026-10-09/` (`VERDICT.md`, `SCORES.md`). A pitch that lost can be built only
after a new arena, or if the owner decides to build it. Each item below names the attacks it must answer.

| # | User | Job | Why (evidence) | Effort | Owner role(s) |
|---|---|---|---|---|---|
| 1 | Mother after birth, Kader, doctor | Report a postpartum danger sign and have it followed up | There are no nifas danger signs, the red card hides after delivery, and the report does not raise the risk (`maternal.py` line 187; AI-2, 83.7). Reuse the winner-1 loop (open until an outcome). Add the Buku KIA postpartum tiles, and give the mental-health sign its own referral wording. Clinical sign-off is needed. | M | data-ai-engineer, backend-engineer, frontend-engineer, ux-designer (copy) |
| 2 | Mother, Kader, doctor | Make sure a child's emergency or "ke dokter dalam 2 hari" reaches care | Child cases have no contact time or outcome (`models.Case`). Copy the maternal pattern: "Sudah saya hubungi", then an outcome. Put UX-2 on Beranda: the doctor visit in the action colour, not urgent red, with "Sudah ke dokter?" so it clears. This answers the UX-2 attacks (it never expired; red blurred with "go now"). | M | backend-engineer, frontend-engineer, ux-designer |
| 3 | Kader, doctor, officer | Trust the maternal danger loop in the field | These are the builders' "left for later" items: staff follow-up offline (outbox PATCH), doctors and officers scoped to their region, urgent facility check-ups entering the same loop (`facility_sync.py` line 444), and clinical sign-off of the winner-1 and winner-2 wording. | S–M | mobile-developer, backend-engineer, data-ai-engineer |
| 4 | Kader, officer, mother | Be alerted on a phone that is not open on the app | There is no push or SMS (no `expo-notifications`). Start with push for danger reports and emergencies only, then local scheduled reminders (posyandu H-1, vaccine due, ANC due, TTD, re-measure). SMS waits for Open question 7. | M–L | mobile-developer, backend-engineer, devops-engineer |
| 5 | Kader, officer, doctor | See only alerts that need a person | 45 officer notifications on the demo, 22 alerts for 23 children (AI-3). Do not repeat AI-3's flaw: send review-only results to a review list *with an owner and a due date* on the Kader home. Officers get high and emergency only, plus a daily digest. | M | data-ai-engineer, backend-engineer, frontend-engineer |
| 6 | Kader | Find any child by name on posyandu day, online or offline | Search runs inside the "Prioritas" filter (`KaderHome.tsx` lines 64–70; UX-3, 85.0). Ship the one-line fix first, then offline search over the cached list. | S | frontend-engineer |
| 7 | Kader, mother | See which vaccines and vitamin A are really due | "Terlewat" names HB0 and BCG for 3-year-olds (`ai/kia.py` lines 45–55). Add catch-up windows, and keep "not recorded" separate from "missed". Only then build the due chip and the posyandu roster (PJ-3, PM-2), and later SKDN. | S, then M | data-ai-engineer, then frontend-engineer, backend-engineer |
| 8 | Kader, families without a smartphone | Register any family, and recover a forgotten password | A child needs an existing mother account (`children.py` lines 43–47), and there is no reset at all. Answer the PM-3 and PJ-2 attacks: do not grant AI consent from verbal consent, and force a password change at the next login. | M | backend-engineer, frontend-engineer, ux-designer |
| 9 | Officer, Puskesmas | Report coverage and act on trends | Add D/S (with a note that it counts registered children), N/D, immunisation coverage (after #7), Kader activity, a monthly trend and a CSV export. Move the projection behind "Detail teknis". | M | backend-engineer, frontend-engineer, ux-designer |
| 10 | Pregnant mother | Get pregnancy help from Nuri and the package flow | Nuri's chips are child-only (`assistant.tsx` lines 83–104). Add a "Kehamilan" topic. Add maternal PMT and TTD packages for KEK and anaemic mothers. | S–M | frontend-engineer, data-ai-engineer, backend-engineer |

Done since 2 October (removed from the backlog):
- old #2: safety without AI consent;
- old #3: the doctor referral first on the result;
- old #8: offline maternal danger reports and Nuri's maternal danger answers;
- old #10: Beranda opening on the most urgent family member;
- the maternal half of old #1.

Next in line:
- referral and nifas messages from the Puskesmas (FHIR), and immunisation import;
- bulk approval of packages;
- nutrient percentages only with enough logged days;
- a date picker in "Tambah anak";
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
6. **Escalation chain.** The maternal loop now records contact and outcome, but nothing escalates. If nobody records
   contact within 2 hours, who is next: the village bidan, the Puskesmas or the officer? Is calling 119 realistic in
   each village? (The verdict notes that 119 reach in NTT is still to verify.)
7. **SMS budget.** Is there budget and a gateway for SMS alerts and reminders? Which numbers may we message, with what
   consent?
8. **Local languages.** Which languages matter in the pilot villages? Is audio-only acceptable for them?
9. **Real data.** When will a consented real cohort replace the synthetic training data? Until then, should the
   model-based risk level be hidden from mothers and only the WHO rules shown?
10. **Clinical sign-off (new).** Who signs off the newborn and maternal danger wording (Buku KIA, MTBS), and the
    postpartum signs before #1 is built? Both arena winners are marked "needs clinical sign-off before real use".
11. **Closing a danger report (new).** An unclosed maternal report stops being urgent after 14 days
    (`DANGER_OPEN_DAYS`). Is that right, or should it escalate instead of expiring?
