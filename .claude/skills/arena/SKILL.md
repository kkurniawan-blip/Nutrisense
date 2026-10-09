---
name: arena
description: Feature arena. Role agents (product-manager, ux-designer, project-manager, data-ai-engineer by default) each pitch the features that would most help prevent stunting and keep pregnancies safe in NTT, cross-examine and score each other's pitches against the real code, and a script totals the scores. Only winners are built; if nothing wins, nothing changes. Use when asked what to build next, to settle a feature argument, or to "make the bots fight".
---

# Feature arena

The arena decides **which features are worth building for the cause**: fewer stunted children and safer pregnancies
in rural NTT. Role agents compete. Each one pitches, then attacks and scores the others. A script totals the scores,
so no single agent decides. **The default outcome is no change.** A feature is built only if it wins, and anything
the agents agree already works is left alone.

## Contenders
Default, four voices that see the product differently:

| Agent | Fights for |
|---|---|
| `product-manager` | the user's job and the outcome (is it useful, what gap does it close) |
| `ux-designer` | whether a mother or Kader can actually use it (taps, words, reading level, offline) |
| `project-manager` | whether it can be finished, tested and shown to the judges in time (effort, risk, scope) |
| `data-ai-engineer` | clinical safety and correctness (WHO/Kemenkes rules, AI limits, data quality) |

Add `mobile-developer`, `qa-engineer`, `backend-engineer` or others when the topic needs them. The lead (the main
session) runs the rounds, saves every answer, and never pitches or scores.

## Rules for every contender
- **Read-only.** Do not edit code, data or git during the arena.
- **Evidence or it does not count.** Every claim names a file and line, an endpoint, or a screen seen in the running
  app (web `http://localhost:8081`, API `http://localhost:8000`, password `Demo1234!`). Check the *current* code:
  `docs/PRODUCT.md` may list gaps that have since been fixed. Unverified claims are marked "to verify" and score low.
- **No self-scoring.** A contender never scores its own pitches.
- **Safety first.** Anything that weakens danger-sign handling ("call the Puskesmas / 119 first"), consent or privacy
  is flagged `unsafe`, whatever its other merits.
- **Say what should not change.** Every contender names at least two things that already work and must be kept.
- Answer in English. Quote Indonesian app text as it appears.

## Round 1: Pitch (all contenders in parallel, independently)
Each contender proposes **at most 3** features or changes to existing features. Prompt each with the topic (default:
"what would most help prevent stunting and keep pregnancies safe in NTT, given the app as it is today") and ask for
this JSON at the end of the answer, in a ```json block:

```json
{"agent": "product-manager",
 "pitches": [{"id": "PM-1", "title": "...", "user": "Kader", "job": "...", "outcome": "which stunting or maternal outcome moves, and how",
              "evidence": "file:line or screen, proving the gap exists TODAY", "smallest_version": "...", "effort": "S|M|L", "risks": "..."}],
 "keep": [{"feature": "...", "why": "..."}]}
```

IDs use a short prefix per agent: `PM` product-manager, `UX` ux-designer, `PJ` project-manager, `AI` data-ai-engineer,
`MD` mobile-developer, `QA` qa-engineer, `BE` backend-engineer.

The lead saves each JSON to `docs/arena/<date>/round1/<agent>.json`.

## Round 2: Fight (all contenders in parallel)
Give every contender **all** round-1 pitches. Each one must, for every pitch that is not its own:
1. **Check it against the code.** Is it already built? Is the evidence right? Is the effort honest?
2. **Attack** its weakest point in one or two sentences, with evidence.
3. **Score** it from 0 to 5:

| Criterion | 5 means | Weight |
|---|---|---|
| `impact` | directly moves a stunting or maternal outcome for many users in NTT | 35% |
| `evidence` | the gap is proven in today's code or app | 20% |
| `feasibility` | small, low-risk, fits the thesis timeline | 20% |
| `safety` | no clinical, privacy or consent risk (0 = dangerous) | 15% |
| `demo` | easy to show to judges and to measure in the thesis | 10% |

4. **Flag** it if needed: `already_exists` (with file:line) or `unsafe` (with the reason).

Ask for this JSON at the end, in a ```json block:

```json
{"agent": "ux-designer",
 "scores": [{"id": "PM-1", "impact": 4, "evidence": 5, "feasibility": 3, "safety": 5, "demo": 4,
             "flags": [], "attack": "..."}]}
```

The lead saves each JSON to `docs/arena/<date>/round2/<agent>.json`.

## Round 3: Tally (mechanical)
```bash
python3 .claude/skills/arena/tally.py docs/arena/<date>
```
It writes `docs/arena/<date>/SCORES.md` and `scores.json`. For each pitch, the score is the weighted mean of the other
contenders' scores, out of 100. A pitch is **disqualified** when two or more scorers flag `already_exists`, or any
scorer flags `unsafe`. The lead then checks each disqualifying flag in the code, and can overrule a flag that is
wrong (with evidence, written in the verdict).

**Winners:** score ≥ 70, not disqualified, at most 3. If two pitches are the same feature, the lead merges them and
says so in the verdict.

## Round 4: Verdict
The lead writes `docs/arena/<date>/VERDICT.md`:
- the winners, each with its score, the strongest attack against it, and the smallest version to build;
- the "keep, do not change" list that the contenders agreed on (named by two or more);
- the losers, each with one line on why it lost;
- any flag the lead overruled, with evidence.

**If there is no winner, the verdict is "no change", and the arena ends there.** Winners go through the normal team
process in `docs/TEAM.md` ("How the team works on a change"): the owners build them, the definition of done applies, and
`docs/PRODUCT.md` and `docs/PROJECT_PLAN.md` are updated by their owners.
