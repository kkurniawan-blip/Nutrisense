# NutriSense core team

NutriSense is built with a team of specialist agents, one per role. Each role is a Claude Code subagent defined in
`.claude/agents/<role>.md`. Ask for one by name, for example: *"Ask the qa-engineer to test the pregnancy flow"*, or
*"Have the product-manager review what we should build next"*.

All roles share the product context and the quality bar below.

## The product in one paragraph
NutriSense helps prevent child stunting and keep pregnancies safe in rural Nusa Tenggara Timur (NTT), Indonesia.
- **Mothers (ibu)** record growth, meals, symptoms and their pregnancy, get plain-language guidance and help from
  Nuri (the AI assistant), and collect supplement packages from smart lockers.
- **Posyandu cadres (Kader)** measure children, register pregnant mothers and follow up on who needs a visit.
- **Officers and doctors** see their region, review AI results and manage cases and logistics.
- **Puskesmas and hospitals** send pregnancy check-ups into the app (HL7 FHIR).

The app is in Bahasa Indonesia first (English second). It must work offline on cheap Android phones.

## Who the users are
| Role | Reality to design for |
|---|---|
| Mother | Primary-school reading level, a shared low-end Android phone, weak or no signal, reads outdoors in the sun. |
| Kader | A volunteer measuring dozens of children at the posyandu; needs speed, few taps, offline. |
| Officer / doctor | Needs to see who needs help first, with numbers and sources they can trust. |
| Puskesmas IT / SIMPUS vendor | Needs a clear, standard, secure integration. |

## Definition of done (the quality bar)
A change is done only when all of these hold:
1. **Useful:** it solves a real task for a named user, and that task is quicker or safer than before.
2. **Safe:**
   - Health guidance follows WHO / Kemenkes (Buku KIA).
   - Danger signs always lead to "go to the Puskesmas / call 119" first.
   - AI output is labelled and is never a diagnosis.
3. **Private:**
   - Health data needs consent and is shared only with the care team.
   - Secrets are not logged, and keys are stored hashed.
   - Every write is audited.
4. **Plain and accessible:**
   - Indonesian plain words, with the abbreviation in brackets.
   - Status is shown as colour plus words.
   - Tap targets ≥ 44 px and text contrast ≥ 4.5:1.
   - Works at 360 px wide and with large text.
5. **Offline-ready:** screens show saved data with no signal, entries queue and sync, and errors say what to do.
6. **Tested:**
   - Backend tests (`cd backend && .venv/bin/python -m pytest -q`).
   - Typecheck and lint (`cd mobile && npx tsc --noEmit && npx expo lint`).
   - End-to-end (`cd e2e && npm test`) and QA (`npm run qa`), both on a **fresh** demo database.
7. **Documented:** user-facing changes go in `docs/USER_GUIDE.md`, and integration or ops changes in the README or `docs/`.

## Roles and what each one owns
| Role (agent) | Owns | Typical work |
|---|---|---|
| Product Manager (`product-manager`) | `docs/PRODUCT.md`, the backlog, priorities | Is it useful? User jobs, gaps, success measures, what to build next. |
| Project Manager (`project-manager`) | `docs/PROJECT_PLAN.md`, scope and schedule | Can it be delivered and shown in time? Effort, order, dependencies, risks, cut list. |
| UI/UX Designer (`ux-designer`) | Design specs and reviews (no code) | Screen design, usability reviews with screenshots, copy. |
| Frontend Engineer (`frontend-engineer`) | `mobile/src/` screens and components, the web build | Building screens to spec, web performance, accessibility, i18n. |
| Backend Engineer (`backend-engineer`) | `backend/app/`, `backend/tests/` | API, data model, security, integrations (FHIR). |
| Mobile Developer (`mobile-developer`) | `mobile/app.json`, `eas.json`, native config, offline and storage | Android/iOS builds, permissions, offline sync, low-end phone performance. |
| QA / Test Engineer (`qa-engineer`) | `e2e/`, test plans, `backend/tests/` (new cases) | Test plans, regression suites, exploratory testing, bug reports. |
| DevOps / Cloud Engineer (`devops-engineer`) | `.github/workflows/`, `Dockerfile`, `deploy/`, `.devcontainer/`, `render.yaml` | CI, deployment, backups, secrets, monitoring. |
| Data / AI Engineer (`data-ai-engineer`) | `backend/app/ai/`, model training and evaluation, Nuri | Risk model quality and fairness, clinical rules, the assistant, data quality. |

When work crosses areas, the owner of each file makes the change in it. Roles hand findings to each other rather than
editing files they do not own.

## How the team works on a change
0. To choose *what* to build, run the feature arena (`.claude/skills/arena/`): the agents pitch, cross-examine and
   score each other, and only winners are built. If nothing wins, nothing changes.
1. The product-manager states the user, the job and how we will know it worked. The project-manager sizes it and
   fits it into the plan.
2. The ux-designer specifies the screens and the copy.
3. The engineers build in their areas. The data-ai-engineer covers anything clinical or AI.
4. The qa-engineer tests it and adds regression cases. The devops-engineer keeps CI and deployment green.
5. The product-manager checks the result against the definition of done.

## Rules for every agent
- **Git:**
  - Never commit, push or change git state; the lead does that.
  - Never start, stop or restart servers that are already running, and never use `pkill` or `killall`.
  - If you need a server, start your own on a free port with a temporary database, and stop it by PID when done.
- **Accuracy:** mark anything you could not verify as "to verify". Never invent facts, codes or numbers.
- **Report** with findings ordered by impact. Each finding gives evidence, who it affects, the fix and the effort.
