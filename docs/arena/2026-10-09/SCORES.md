# Arena scores

Weighted mean of the other contenders' scores (impact 35%, evidence 20%, feasibility 20%, safety 15%, demo 10%), out of 100. Winners: score ≥ 70, not disqualified, at most 3.

| Rank | Pitch | By | Effort | Score | Impact | Evidence | Feasible | Safety | Demo | Result |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **UX-1** Pregnancy danger report comes first on both phones: right advice and 119 for the mother, a pinned alert with 'Telepon ibu' for the Kader | ux-designer | S | 91.7 | 5.0 | 5.0 | 3.67 | 4.0 | 5.0 | 🏆 winner |
| 2 | **PJ-1** Maternal danger follow-up that cannot vanish: fix the 'later complaint clears the danger' bug, and keep it urgent until a Kader records contact and outcome | project-manager | M | 87.0 | 5.0 | 5.0 | 3.0 | 4.0 | 4.0 | 🏆 winner |
| 3 | **AI-1** Young-infant (0-2 months) danger signs in the symptom checker: fever, cold, jaundice, cord infection, grunting | data-ai-engineer | S | 86.3 | 4.33 | 5.0 | 4.0 | 4.0 | 4.0 | 🏆 winner |
| 4 | **UX-2** Show 'Bawa ke dokter dalam 2 hari' on Beranda: a status pill, the top 'Untuk hari ini' item and a dot on the child picker | ux-designer | S | 86.3 | 4.0 | 5.0 | 4.67 | 3.67 | 4.33 | — |
| 5 | **UX-3** Posyandu day: find and measure any child by name in 2 taps, online or offline | ux-designer | S | 85.0 | 3.33 | 5.0 | 4.67 | 5.0 | 4.0 | — |
| 6 | **AI-2** Postpartum (nifas, 42 days) danger signs for the mother | data-ai-engineer | M | 83.7 | 4.67 | 5.0 | 3.0 | 3.67 | 4.0 | — |
| 7 | **PM-1** Close the loop on maternal danger reports (pregnancy and nifas): handled-by, outcome, staff escalation | product-manager | M | 80.3 | 5.0 | 4.0 | 2.33 | 4.0 | 4.0 | — |
| 8 | **AI-3** Alert triage: review-only model results stop creating cases and notifications; officers get high/emergency only | data-ai-engineer | S | 77.7 | 3.33 | 5.0 | 4.0 | 3.67 | 3.67 | — |
| 9 | **PJ-3** Overdue vaccines, vitamin A and deworming on the Kader's priority list, with a filter for posyandu day | project-manager | S | 76.7 | 3.33 | 4.33 | 4.0 | 4.0 | 4.0 | — |
| 10 | **PM-2** Posyandu-day list: immunisation/vitamin A due chip on the Kader list plus monthly D/S | product-manager | M | 70.7 | 3.0 | 4.33 | 3.33 | 4.33 | 3.0 | — |
| 11 | **PM-3** Kader registers any family (non-pregnant mother without an account) and resets a mother's forgotten password | product-manager | M | 69.3 | 3.33 | 5.0 | 2.67 | 2.67 | 3.67 | — |
| 12 | **PJ-2** Kader or Puskesmas resets a mother's forgotten password, as the app already promises | project-manager | S | 69.3 | 2.33 | 5.0 | 4.33 | 3.0 | 3.33 | — |

## Attacks

### UX-1: Pregnancy danger report comes first on both phones: right advice and 119 for the mother, a pinned alert with 'Telepon ibu' for the Kader (91.7)
- **data-ai-engineer:** The pinned Kader card is keyed on unread notifications, so opening the bell clears it with no action taken, and the RiskCard change depends on recent_danger, which a later common complaint clears (maternal.py:138-141). The proposed wording is clinically sound (Buku KIA: go to a facility now); 119 reach in NTT is still to verify.
- **product-manager:** It reuses the 3-day check on the latest report, so a later common complaint makes the red card vanish (maternal.py:138-141). The Kader's pinned card is driven by unread notifications and disappears once read, even if nobody called the mother. Five parts plus a backend change is more than S.
- **project-manager:** The pinned card depends on an unread mother_danger notification, so it disappears the moment the Kader opens the bell, with no contact recorded. It does not fix maternal.py:138-141, where a later common complaint clears the danger. 'S' undercounts five surfaces plus a backend field, i18n and the feature checks; it is M.

### PJ-1: Maternal danger follow-up that cannot vanish: fix the 'later complaint clears the danger' bug, and keep it urgent until a Kader records contact and outcome (87.0)
- **data-ai-engineer:** Bug reproduced (bleeding then nausea: urgent goes back to action, maternal.py:138-141), but keeping her 'Risiko tinggi' until an outcome is recorded also keeps the mother on riskHighTip 'Periksa ke bidan minggu ini' (PregnancyParts.tsx:22, i18n.ts:1779), which is wrong advice for a danger sign; the mother-side copy must change too.
- **product-manager:** The bug is real (maternal.py:138-141 takes the latest report whether or not it was a danger sign; the :172-174 item uses it too) and should ship alone first. The bundled outcome is a Kader's unchecked tap, and a new offline outbox kind touches the recently hardened offline.ts.
- **ux-designer:** Bug verified; but 'Risiko tinggi until a Kader records outcome' leaves the mother's red card saying 'Periksa ke bidan minggu ini' (PregnancyParts.tsx:23) with no way for her to say she already went, which is wrong advice for an emergency and alarming if the Kader never closes it.

### AI-1: Young-infant (0-2 months) danger signs in the symptom checker: fever, cold, jaundice, cord infection, grunting (86.3)
- **product-manager:** The smallest version adds no newborn tiles, so a mother must type 'kuning' or 'dingin' herself. Verified: interpret_rules('bayi 2 minggu panas 38 derajat') returns duration_days 14, reading the baby's age as illness duration, so age must come from the child record, not the text (ai/symptoms.py:225-237).
- **project-manager:** 'No UI change' holds only online: offline, symptoms.tsx:42,64 shows Escalation from the fixed URGENT list, so a fever in a newborn queued offline gets no call-now screen. The new keys (jaundice, cord_infection, cold, grunting) also need mobile labels, or the result chips show raw keys (symptoms.tsx:85). The age-aware set must be applied in both consent branches (children.py:390-393).
- **ux-designer:** 'Existing Demam tile escalates with no UI change' holds online only: offline the Escalation shows only for client URGENT tiles (child/[id]/symptoms.tsx:66,106) and Demam is a COMMON tile, so a febrile newborn's mother gets no call buttons; jaundice/cord/cold have no tile and need free text low-literacy mothers rarely type.

### UX-2: Show 'Bawa ke dokter dalam 2 hari' on Beranda: a status pill, the top 'Untuk hari ini' item and a dot on the child picker (86.3)
- **data-ai-engineer:** Painting doctor_48h with statusColor.urgent blurs it with emergency 'go now'; risk_level high can come from the Random Forest alone, trained on synthetic data (triage.py:52, risk_model.py:475-506), and the 'dalam 2 hari' item never expires after the visit. Use the action colour and expire it with the assessment.
- **product-manager:** Gap verified (status.ts:21 ignores urgency; family.py:28 has no doctor item). It tells the mother what to do but never records whether the visit happened, so its 48 h measure cannot be computed. 'Dalam 2 hari' for chronic stunting may alarm families far from a doctor (to validate with users).
- **project-manager:** There is no way to clear the item: the new top item comes from the latest triage urgency, which changes only at the next measurement, weeks later. So 'dalam 2 hari' stays red after the visit and after 48 h, which teaches mothers to ignore red. It needs a 'sudah ke dokter' state or an age limit on the item.

### UX-3: Posyandu day: find and measure any child by name in 2 taps, online or offline (85.0)
- **data-ai-engineer:** Confirmed live (priority&q=Adel gives 0 rows, all gives 1); the effect on D/S cannot be shown in the demo because every seeded child was measured today, and the offline list can be up to 10 minutes old.
- **product-manager:** Verified: q is sent together with the default filter=priority (KaderHome.tsx:50,69). The offline list can be 10 minutes old, the demo marks every child as measured today so the mark won't show, and D/S, the measure it names, is not computed anywhere.
- **project-manager:** Fix (1) is a one-line bug (filter=priority applied before q in KaderHome.tsx:64-69). For fix (2), the offline fallback reads cached /api/children, whose rows likely lack the group, status and region fields of AreaChildRow (to verify), so it needs a second row renderer. The 'Diukur hari ini' mark is weak on the demo seed, where every child was measured today.

### AI-2: Postpartum (nifas, 42 days) danger signs for the mother (83.7)
- **product-manager:** Most deaths from bleeding after birth happen in the first 24 h, before the app is opened. The depression sign needs clinically safe wording and a referral path the pitch leaves open. Honest M effort across three owners (maternal.py:141, :401; pregnancy.ts:9-18).
- **project-manager:** Risk reads the most recent report, danger or not (routers/maternal.py:138-141), so a common complaint in nifas still clears the danger. After birth, RiskCard returns null (PregnancyParts.tsx:21) and the 'Untuk hari ini' block only builds for active pregnancies (maternal.py:156), so the mother's screens need more work than danger.tsx. It needs three owners plus a clinical sign-off on the mental-health copy.
- **ux-designer:** Gap verified (pregnancy.ts:9-18 tiles after birth, maternal.py:392 filter), but the self-harm sign needs its own referral copy, not 'Segera ke Puskesmas', and without PJ-1's fix a later complaint report clears the nifas danger too (maternal.py:138-141).

### PM-1: Close the loop on maternal danger reports (pregnancy and nifas): handled-by, outcome, staff escalation (80.3)
- **data-ai-engineer:** Counts nifas reports in risk, but the only signs a mother can report are pregnancy signs (ai/maternal.py:48, lib/pregnancy.ts:9-18: fetal movement, waters breaking), with no Buku KIA postpartum signs, and RiskCard hides after delivery (PregnancyParts.tsx:21); it also misses the later-complaint-clears-danger bug at maternal.py:138-141.
- **project-manager:** It misses the real bug that makes reports vanish: urgency comes from the most recent report whatever its danger flag (maternal.py:138-141), so a later common complaint clears it now, not after 3 days. The scope is L, not M: there is no scheduler in backend/app for a 2 h escalation or 'hours waiting', and staff actions need a new offline outbox kind.
- **ux-designer:** Misses the real bug: urgency is read from the latest report of any kind (maternal.py:138-141), so a later 'Mual' hides an unhandled bleed even with handled_at; outcome buttons sit on a pregnancy page with no 'Telepon ibu' for the Kader, and fields+outcomes+tile+nifas risk is more than M.

### AI-3: Alert triage: review-only model results stop creating cases and notifications; officers get high/emergency only (77.7)
- **product-manager:** Live API confirms 45 officer notifications (22 medium, 11 low). But review-only children (incomplete data, uncertain model) leave the Kader's case list for /reviews/pending (routers/cases.py:126), which has no assignee, due date or home-screen entry, so they can be quietly forgotten.
- **project-manager:** The code change is two lines, but it changes the numbers the demo, the user guide and the 'followup' Kader group rely on (dashboard.py:248-252, open_case). The 33 review-only items then live only in /api/reviews/pending, which the app lists after the cases as 'paperwork' (cases.tsx:20-22), so a Kader can stop seeing incomplete-data children unless the review list is made visible.
- **ux-designer:** Officer 45/45 verified, but the Kader (22 alerts for 23 children) still gets every medium case, so her noise barely drops, and low cases silently leave her 'Tindak lanjut' filter (dashboard.py:218,252); the felt fatigue is a bell with no count and an unsorted list.

### PJ-3: Overdue vaccines, vitamin A and deworming on the Kader's priority list, with a filter for posyandu day (76.7)
- **data-ai-engineer:** 'Terlewat: <first item>' is often HB0 or BCG for children over 1 year (7 and 5 of 22 on the seed), because kia.py:45-55 has no catch-up or age cut-off and treats an unrecorded item as missed; it would send a 3-year-old for a birth dose. It needs catch-up windows and 'Belum tercatat' wording.
- **product-manager:** 'Terlewat' comes only from KiaRecord in the app, so doses given at the Puskesmas but never entered show as overdue and can mislead or alarm. A kia_overdue=true filter must compute the schedule for every child before paging (dashboard.py has no KIA field today).
- **ux-designer:** 12/23 verified; but a new chip lands in the folded filter panel the Kader never sees on posyandu day (KaderHome.tsx:175), so the row line is the real value, and 'Terlewat' should reuse the reassuring catch-up wording (i18n.ts:1826).

### PM-2: Posyandu-day list: immunisation/vitamin A due chip on the Kader list plus monthly D/S (70.7)
- **data-ai-engineer:** kia.schedule counts 'not ticked in the app' as overdue, with no catch-up window (kia.py:45-55); on the seed, 12 of 22 flagged children have HB0 or BCG as their first overdue item. 'Ditimbang X dari Y' uses registered children as S, not all balita in the village, so D/S is overstated.
- **project-manager:** Its link to stunting is indirect (immunisation and vitamin A coverage), and the D/S tile shows 100% on the demo seed, so half the pitch cannot be shown to judges. Calling kia.schedule for every row needs one batched KiaRecord query, or /api/dashboard/children slows down (child_care.py:22 queries per child).
- **ux-designer:** A 'due' (not only overdue) chip flags about half the list, so it stops being a priority signal for the Kader, and the D/S tile reads 100% on the demo (all 23 kader.oesapa rows have days_since_measured 0).

### PM-3: Kader registers any family (non-pregnant mother without an account) and resets a mother's forgotten password (69.3)
- **data-ai-engineer:** Reusing register_mother for any caregiver also auto-grants ai_analysis consent from the Kader's verbal consent (maternal.py:273), bundling AI consent with registration; the Kader reset allows account takeover, mitigated but not prevented by coverage limits and audit.
- **project-manager:** With a Kader reset the Kader learns the temporary password and can log in as the mother. The proposed 'notify the mother' is an in-app notification she cannot see while locked out. Inline creation copies register_mother, which grants ai_analysis consent by default on verbal consent (maternal.py:272), so the consent gap spreads to a new path.
- **ux-designer:** Dead end verified (child/new.tsx:38), but reusing register_mother auto-grants ai_analysis on verbal consent (maternal.py:272) for every family, and bundling registration plus reset as one M is optimistic with no UI location for the reset.

### PJ-2: Kader or Puskesmas resets a mother's forgotten password, as the app already promises (69.3)
- **data-ai-engineer:** The gap is real (auth.py:144 is the only password endpoint), but the outcome benefit is indirect, and a Kader-read temporary password with no forced change at next login leaves the Kader able to sign in as the mother.
- **product-manager:** No reset exists (auth.py:88 is only the rate limiter), but the Kader sees the mother's new password and nothing checks who is asking on a shared family phone. Effect on stunting and maternal outcomes is indirect.
- **ux-designer:** The button lives only on the pregnancy page, and staff have no screen for a non-pregnant mother (mobile/src/app/mother/ has only new.tsx), so mothers of children only, the most common locked-out case, cannot be reset from the app.
