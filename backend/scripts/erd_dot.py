"""Print the ERD as Graphviz DOT, straight from the SQLAlchemy models, so docs/images/erd.svg never drifts from the code.

Tables are grouped by area; each lists its PK, FK and UK columns (`?` = nullable, `UK*` = part of a unique pair) and one
crow's-foot edge is drawn per foreign key. Staff "who did it" keys to users are listed in the table but not drawn.

    cd backend && python scripts/erd_dot.py > /tmp/erd.dot && dot -Tsvg /tmp/erd.dot -o ../docs/images/erd.svg
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import models  # noqa: F401  (registers the tables)
from app.database import Base

AREAS = [
    ("People and places", "#EDE9FF", "#7B66F0", ["regions", "users"]),
    ("Child health", "#FFF0E8", "#FF8A5B", ["children", "growth_measurements", "symptom_reports", "meal_logs",
                                            "development_checks", "kia_records", "breastfeeding_logs"]),
    ("AI assessment and cases", "#E8F7F1", "#2FB38A", ["model_runs", "risk_assessments", "nutrition_recommendations", "cases", "case_notes"]),
    ("Pregnancy, birth and nifas", "#FFEAF2", "#E0578B", ["pregnancies", "maternal_measurements", "anc_visits",
                                                         "pregnancy_daily_logs", "pregnancy_danger_reports"]),
    ("Health facility (HL7 FHIR R4)", "#E8F2FC", "#3E8ED0", ["health_facilities", "facility_link_codes", "anc_exams"]),
    ("N.E.X.U.S. logistics", "#FFF6DD", "#D99A00", ["lockers", "inventory_items", "supply_requests"]),
    ("Consent, audit and messages", "#F1EFF6", "#6B6788", ["consents", "audit_logs", "notifications", "chat_messages", "fhir_sync_logs"]),
]
DRAWN_USER_FKS = {("children", "caregiver_id"), ("children", "kader_id"), ("pregnancies", "mother_id"), ("pregnancies", "kader_id"),
                  ("consents", "user_id"), ("notifications", "user_id"), ("chat_messages", "user_id"), ("audit_logs", "user_id"),
                  ("cases", "assigned_to_id")}
tables = Base.metadata.tables
area_of = {t: a for a in AREAS for t in a[3]}
assert set(area_of) == set(tables), set(tables) ^ set(area_of)

def esc(s): return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

out = ['digraph ERD {', 'graph [rankdir=TB, splines=true, nodesep=0.3, ranksep=0.9, fontname="DejaVu Sans", bgcolor="white", pad=0.3, newrank=true];',
       'node [shape=plaintext, fontname="DejaVu Sans", fontsize=11];', 'edge [color="#8C88A6", penwidth=1.2, dir=both, arrowsize=0.9];']
for i, (title, fill, accent, names) in enumerate(AREAS):
    out.append(f'subgraph cluster_{i} {{ label=<<b>{esc(title)}</b>>; fontsize=16; fontcolor="{accent}"; style="rounded,filled"; color="{accent}"; fillcolor="{fill}"; penwidth=1.5; margin=14;')
    for n in names:
        t = tables[n]
        uniq = {c.name for c in t.columns if c.unique} | {list(u.columns)[0].name for u in t.constraints if u.__class__.__name__ == "UniqueConstraint" and len(u.columns) == 1}
        multi = [tuple(c.name for c in u.columns) for u in t.constraints if u.__class__.__name__ == "UniqueConstraint" and len(u.columns) > 1]
        rows = [f'<tr><td bgcolor="{accent}" colspan="3"><font color="white"><b>{n}</b></font></td></tr>']
        for c in t.columns:
            keys = []
            if c.primary_key: keys.append("PK")
            fks = list(c.foreign_keys)
            if fks: keys.append("FK")
            if c.name in uniq: keys.append("UK")
            if any(c.name in m for m in multi): keys.append("UK*")
            if not keys: continue
            target = f"→ {fks[0].column.table.name}" if fks else " "
            opt = "" if (c.primary_key or not c.nullable) else " ?"
            rows.append(f'<tr><td align="left" port="{c.name}"><font color="#2B2745">{c.name}{opt}</font></td><td align="left"><font color="{accent}"><b>{" ".join(keys)}</b></font></td><td align="left"><font color="#6B6788" point-size="9">{esc(target)}</font></td></tr>')
        n_other = sum(1 for c in t.columns if not (c.primary_key or c.foreign_keys or c.name in uniq or any(c.name in m for m in multi)))
        rows.append(f'<tr><td align="left" colspan="3"><font color="#8C88A6" point-size="9">+ {n_other} more columns</font></td></tr>')
        out.append(f'"{n}" [label=<<table border="0" cellborder="1" cellspacing="0" cellpadding="4" bgcolor="white" color="#D6D2E8">{"".join(rows)}</table>>];')
    out.append('}')
for n, t in tables.items():
    for c in t.columns:
        for fk in c.foreign_keys:
            tgt = fk.column.table.name
            if tgt == "users" and (n, c.name) not in DRAWN_USER_FKS: continue
            tail = "teeodot" if c.nullable else "teetee"     # parent side: zero-or-one / exactly one
            head = "crowodot"                                  # child side: zero or many
            if (n, c.name) == ("pregnancies", "child_id"): head = "teeodot"
            out.append(f'"{tgt}":id -> "{n}":{c.name} [arrowtail={tail}, arrowhead={head}];')
out.append('}')
print("\n".join(out))
