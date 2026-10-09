# Feature arena, 9 October 2026: verdict

**Question:** what would most help prevent child stunting and keep pregnancies safe in rural NTT, given the app as
it is today (commit `df2c827`, 81/81 feature checks passing)?

**Contenders:** product-manager (PM), ux-designer (UX), project-manager (PJ), data-ai-engineer (AI). Each pitched up
to 3 features with evidence from the current code and app (`round1/`). Each then checked, attacked and scored the 9
pitches of the others (`round2/`). `tally.py` computed the scores (`SCORES.md`). No agent scored its own pitch, and the
lead did not pitch or score.

**Result:** 3 winning pitches, which make **2 features**, because UX-1 and PJ-1 are two halves of the same feature. No
pitch was flagged as already built or unsafe, so the lead overruled no flags.

## Winners

### 1. Maternal danger sign that cannot get lost: UX-1 (91.7) merged with PJ-1 (87.0)
**Why they merge:** every attack on one pitch is answered by the other.
- All three scorers attacked UX-1 on two points:
  - its Kader alert was keyed on *unread notifications*, so it disappeared once read even if nobody called the mother;
  - its red card relied on the latest report, which a later common complaint clears (`routers/maternal.py:138-141`).

  PJ-1 fixes both: urgency comes from the latest *danger* report, and the report stays open until staff record
  contact and an outcome.
- Scorers attacked PJ-1 for keeping the mother on the advice "Periksa ke bidan minggu ini", which is wrong for a
  danger sign (`PregnancyParts.tsx:22`). UX-1 fixes that with the danger wording and the 119 and Puskesmas buttons.

The data-ai-engineer reproduced the bug: a mother reports bleeding, then reports nausea, and her risk drops from
*urgent* back to *action*.

**What to build (smallest version that answers the attacks):**
- **Backend:**
  - Urgency comes from the latest report with `danger = true`. A later common complaint no longer clears it.
  - The report stays open until a staff member records it. New fields: `contacted_at`, `contacted_by`, `outcome`
    (`went_to_facility`, `advised_home` or `not_reached`) and `outcome_at`.
  - New staff endpoint to record contact and outcome. It is limited to the Kader's coverage, the doctor and the
    officer, and it is audited.
  - The doctor is notified as well as the Kader.
  - The pregnancy detail response carries the open danger report: its signs, its time and its contact state.
  - In "Untuk hari ini" the danger item comes first.
- **Mother:**
  - While a report is open, the red card says "Tanda bahaya: segera ke Puskesmas atau telepon 119" and shows the
    119 and Puskesmas buttons.
  - After a Kader records contact, the card says the Kader has called.
  - The message after reporting reads: "Pesan terkirim ke Kader. Jangan menunggu: telepon bidan atau 119 sekarang."
- **Kader:**
  - A red card pinned at the top of home for every open danger report in her area: the name, the sign, the time,
    and a "Telepon ibu" button.
  - On the pregnancy page, the same alert, with the buttons "Sudah saya hubungi" and then an outcome.

**Cut**, from the pitches and the attacks:
- push notifications and a timed 2 h escalation (there is no scheduler);
- the dashboard tile with hours waiting;
- the nifas part (AI-2 lost on its own);
- an unread count on the bell.

### 2. Danger signs for newborns under 2 months: AI-1 (86.3)
**Gap.** The symptom checker uses one danger set for every age (`ai/symptoms.py:19`). None of these raise an alert for a baby under 2 months:
- fever ("bayi 2 minggu panas 38 derajat");
- yellow skin to the palms and soles;
- a red, pus-filled cord;
- a cold body;
- grunting.

WHO IMCI (young infant) says each of these means "refer now".

**What to build (answering the attacks):**
- **Age comes from the child's record, not the typed text.** The scorers found that "bayi 2 minggu" (2 weeks old) is
  read as 2 weeks of illness. Fix that too.
- **Under 60 days, these are danger signs:** fever, high fever and poor feeding, plus the new signs jaundice, cord
  infection, cold body and grunting.
- **It must work offline.** The project-manager and ux-designer showed that offline, call buttons appear only for
  the fixed urgent tiles (`child/[id]/symptoms.tsx:66,106`). So the screen also escalates "Demam" for a baby under
  2 months.
- **No typing needed.** Babies under 2 months get tiles for "Kuning", "Tali pusat merah/bernanah" and "Badan dingin".
- **Labels:** the new signs get their Indonesian labels.
- **Nuri** also recognises "badannya dingin" (`ai/assistant.py:57`).
- **Older children:** rules for children aged 2–59 months do not change.

**Needs clinical sign-off before real use:**
- the exact Buku KIA and MTBS wording;
- the young-infant thresholds as Kemenkes applies them.

## Keep, do not change
Two or more contenders named each of these:
- **Danger-first escalation:** symptom tiles go to "Perlu pertolongan" with the Puskesmas, 119 and Kader buttons. The
  offline danger screen shows the call buttons first and sends the queued report once. *(UX, PM, PJ)*
- **WHO-rule triage, cases and Kader alerts that run without the optional AI consent.** *(AI, PM, PJ)*
- **The doctor referral ("Bawa ke dokter/Puskesmas dalam 2 hari") as the first action on the child's result.**
  *(PM, PJ)*

The new features build on these and must not change them.

## The other pitches, and why they lost

| Pitch | Score | Why it lost |
|---|---|---|
| UX-2 Doctor visit on Beranda | 86.3 | Tied with AI-1 but lost the cap of 3. Attacks: red "urgent" blurs the doctor visit with "go now", and the item never expires after the visit. **Next in line.** |
| UX-3 Find any child by name on posyandu day, offline too | 85.0 | High safety and feasibility but lower impact (3.3). The search-inside-the-priority-filter bug is a one-line fix worth doing on its own. |
| AI-2 Postpartum (nifas) danger signs | 83.7 | High impact but M effort across three owners. The mental-health sign needs its own referral wording and clinical sign-off. |
| PM-1 Close the loop on maternal danger reports | 80.3 | Same aim as the winner but scored as L. It missed the "later complaint clears it" bug. Its core lives on in winner 1. |
| AI-3 Fewer alerts: review-only results open no case | 77.7 | Review-only children would leave the Kader's work list for a review list with no owner or due date. |
| PJ-3 Overdue vaccines on the Kader list | 76.7 | The data-ai-engineer showed "terlewat" would name birth doses (HB0, BCG) for 3-year-olds. The schedule has no catch-up window and treats "not recorded" as "missed". |
| PM-2 Posyandu-day KIA chip and D/S | 70.7 | The same KIA noise. D/S would read 100% on the demo, and the app counts registered children rather than all children in the village. |
| PM-3 Kader registers any family and resets passwords | 69.3 | Reusing `register_mother` would grant AI consent automatically from the Kader's verbal consent. Two features in one M. |
| PJ-2 Password reset by Kader or Puskesmas | 69.3 | The gap is real, but the effect on outcomes is indirect. The Kader learns the password and there is no forced change at next login. |

## Findings for the backlog (not built: not winners)
- **KIA overdue logic.** `ai/kia.py:45-55` has no catch-up windows and treats an unrecorded item as missed, so a
  3-year-old can show HB0 as "terlewat". *(data-ai-engineer, round 2)*
- **The Kader's search ignores children outside the "Prioritas" filter** (`KaderHome.tsx:50,64-69`).
  *(ux-designer, round 1; confirmed by all)*
- **Nifas danger reports do not raise the mother's risk** (`routers/maternal.py:143`). *(AI-2, PM-1)*
- **45 identical officer notifications hide the one emergency.** *(AI-3)*
