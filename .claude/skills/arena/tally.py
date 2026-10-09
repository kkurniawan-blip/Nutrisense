"""Tally a feature arena: weighted mean of the other contenders' scores per pitch, disqualification flags, winners.

Usage: python3 .claude/skills/arena/tally.py docs/arena/<date>
Reads round1/*.json (pitches) and round2/*.json (scores); writes SCORES.md and scores.json in the same folder.
"""
import json
import sys
from pathlib import Path

WEIGHTS = {"impact": 0.35, "evidence": 0.20, "feasibility": 0.20, "safety": 0.15, "demo": 0.10}
WIN_SCORE = 70
MAX_WINNERS = 3

root = Path(sys.argv[1])
pitches, owner = {}, {}
for f in sorted((root / "round1").glob("*.json")):
    data = json.loads(f.read_text())
    for p in data["pitches"]:
        pitches[p["id"]] = p
        owner[p["id"]] = data["agent"]

votes = {pid: [] for pid in pitches}
for f in sorted((root / "round2").glob("*.json")):
    data = json.loads(f.read_text())
    for s in data["scores"]:
        pid = s["id"]
        if pid not in pitches:
            print(f"warning: {data['agent']} scored unknown pitch {pid}", file=sys.stderr)
            continue
        if owner[pid] == data["agent"]:
            continue  # no self-scoring
        votes[pid].append({**s, "by": data["agent"]})

rows = []
for pid, p in pitches.items():
    vs = votes[pid]
    means = {k: (sum(float(v[k]) for v in vs) / len(vs) if vs else 0.0) for k in WEIGHTS}
    score = round(sum(means[k] * w for k, w in WEIGHTS.items()) / 5 * 100, 1)
    exists = [v["by"] for v in vs if "already_exists" in v.get("flags", [])]
    unsafe = [v["by"] for v in vs if "unsafe" in v.get("flags", [])]
    out = "already exists" if len(exists) >= 2 else "unsafe" if unsafe else ""
    rows.append({"id": pid, "title": p["title"], "by": owner[pid], "effort": p.get("effort", "?"), "score": score,
                 "means": {k: round(v, 2) for k, v in means.items()}, "scorers": len(vs),
                 "already_exists_by": exists, "unsafe_by": unsafe, "disqualified": out,
                 "attacks": [{"by": v["by"], "attack": v.get("attack", "")} for v in vs]})

rows.sort(key=lambda r: (bool(r["disqualified"]), -r["score"]))
winners = [r["id"] for r in rows if not r["disqualified"] and r["score"] >= WIN_SCORE][:MAX_WINNERS]

(root / "scores.json").write_text(json.dumps({"weights": WEIGHTS, "win_score": WIN_SCORE, "winners": winners, "pitches": rows},
                                             indent=1, ensure_ascii=False))
md = ["# Arena scores", "",
      f"Weighted mean of the other contenders' scores (impact 35%, evidence 20%, feasibility 20%, safety 15%, demo 10%), "
      f"out of 100. Winners: score ≥ {WIN_SCORE}, not disqualified, at most {MAX_WINNERS}.", "",
      "| Rank | Pitch | By | Effort | Score | Impact | Evidence | Feasible | Safety | Demo | Result |",
      "|---|---|---|---|---|---|---|---|---|---|---|"]
for i, r in enumerate(rows, 1):
    m = r["means"]
    result = "🏆 winner" if r["id"] in winners else (f"❌ {r['disqualified']}" if r["disqualified"] else "—")
    md.append(f"| {i} | **{r['id']}** {r['title']} | {r['by']} | {r['effort']} | {r['score']} | {m['impact']} | "
              f"{m['evidence']} | {m['feasibility']} | {m['safety']} | {m['demo']} | {result} |")
md += ["", "## Attacks", ""]
for r in rows:
    md.append(f"### {r['id']}: {r['title']} ({r['score']})")
    md += [f"- **{a['by']}:** {a['attack']}" for a in r["attacks"] if a["attack"]]
    md.append("")
(root / "SCORES.md").write_text("\n".join(md))
print("winners:", ", ".join(winners) or "none (no change)")
