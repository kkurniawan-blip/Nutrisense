# NutriSense & N.E.X.U.S.

An AI-driven health and logistics ecosystem for early stunting prevention in Indonesia. This repository is the working prototype for the pre-thesis *"NutriSense & N.E.X.U.S.: An AI-Driven Integrated Health and Logistics Ecosystem for Early Stunting Prevention in Indonesia"* (Kenneth Kurniawan, BINUS International, 2026).

| Folder | What it is |
|---|---|
| `backend/` | FastAPI + SQLAlchemy API, AI engine (WHO z-scores, scikit-learn risk model, triage, nutrition, Claude integration), N.E.X.U.S. logistics simulation, SATUSEHAT/FHIR mapping |
| `mobile/` | Expo (React Native) app for Android and iOS (also runs in a browser). One app, role-based screens for caregivers, Kaders, health officers and doctors |

AI output is decision support, not a medical diagnosis. The app says so on every result screen, and a clinician can confirm or override any assessment.

---

## Quick start

### 1. Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env                                    # optional; add your Claude API key here
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

On first start it creates the database (SQLite, `backend/nutrisense.db`), loads a simulated posyandu network in East Nusa Tenggara, and trains the risk model (about 20 s). Interactive API docs are at **http://localhost:8000/docs**.

With Docker and PostgreSQL instead: `docker compose up --build` from the repository root.

### 2. Mobile app

```bash
cd mobile
npm install
npx expo start
```

- **On your phone:** install **Expo Go** and scan the QR code. The phone must be on the same Wi-Fi as your laptop. The app looks for the API on port 8000 of the laptop running Expo. If that doesn't work, tap *Server address* on the login screen and enter e.g. `http://192.168.1.10:8000`.
- **In a browser:** press `w` in the Expo terminal.
- **Installable build (APK/IPA):** `npx eas-cli@latest build --profile preview --platform android`. Set `EXPO_PUBLIC_API_URL` to your deployed backend first.

### 3. Log in with a demo account (password `Demo1234!`)

| Role | Email | What to try |
|---|---|---|
| Caregiver | `ibu.maria@nutrisense.id` | Budi (high risk, declining trend), Adel (low risk). Record a measurement, report symptoms, log a meal, show the locker QR in **Pickups**, chat with NutriBot |
| Kader | `kader.oesapa@nutrisense.id` | Priority visit list, register a child for a caregiver, offline measurement capture, **Locker pickup** (scan QR / enter code) |
| Health officer | `officer@nutrisense.id` | Dashboard (KPIs, village heat map, prevalence projection, model card), approve supply requests (locker / drone / courier), fast-forward the drone simulation, review AI results |
| Doctor | `doctor@nutrisense.id` | Human-in-the-loop review, approve RUTF / deworming (doctor-only items), referrals |
| Admin | `admin@nutrisense.id` | Everything above, plus user management, audit log and model retraining (API) |

---

## How it maps to the proposal

**User layer** (caregiver app, Kader/officer app, doctor view)
- `mobile/src/app/(tabs)/*`: role-based tabs
- `child/[id]/*`: child profile, measurements, symptoms, nutrition, NutriScan
- `case/[id]`, `supply/[id]`, `scan`

**Application layer**
- REST API in `backend/app/routers/*`
- Offline-first measurement queue in `mobile/src/lib/offline.ts`, synced through `POST /api/sync` (idempotent by client UUID)

**Intelligence layer** (`backend/app/ai/`)
- `computeZScore()`: `growth.py` uses the official WHO 2006 LMS tables, the length/height switch at 24 months with the 0.7 cm correction, and WHO implausibility flags.
- `classify()`: `risk_model.py` is a Random Forest over 19 features with a logistic-regression baseline. Explanations come from perturbation-based feature contributions. Guardrails: WHO cut-offs and IMCI danger signs can raise the level but never lower it. Low-confidence results are flagged for human review.
- Predictive growth tracker: `trend.py` computes HAZ velocity and projects 3 and 6 months ahead, so a child sliding toward −2 SD is flagged before stunting is visible.
- Triage engine: `triage.py` produces four urgency tiers, next steps, and supply needs.
- Symptom interpretation: `symptoms.py` reads Bahasa Indonesia, English and local terms (*mencret*, *step*, *lepeh*…).
- Nutrition: `nutrition.py` holds 32 local foods, AKG 2019 targets and WHO dietary diversity, gap analysis, and NTT recipes (kelor, jagung bose…). **NutriScan** turns a meal photo into foods, portions and nutrients.
- NutriBot: `assistant.py`.
- Heat map and prevalence projection: `routers/dashboard.py`.

**Logistics layer (N.E.X.U.S.)**: `services/logistics.py`
- `checkStock()`: inventory with reservations.
- `simulateRoute()`: scores locker stock vs. drone vs. courier using distance, battery, range, payload, simulated weather and urgency.
- Signed QR plus 6-digit pickup codes, expiry, and restock alerts.

**Governance layer**
- Consent per scope, enforced on AI and SATUSEHAT
- RBAC in `deps.py`; Kaders only see their villages
- Fernet encryption of free-text health notes at rest
- Audit log on every read and write of child data
- Right to deletion
- FHIR R4 export (`Patient`, `Observation` with LOINC 8302-2 / 8306-3 / 29463-7, `RiskAssessment`, `Consent`) and a simulated SATUSEHAT sync

### Claude AI and the offline fallback

Every AI feature works without internet or an API key: rules, WHO tables and the scikit-learn model always run.

When `NUTRISENSE_ANTHROPIC_API_KEY` is set, Claude (`claude-opus-5` by default) adds:
- **Symptom understanding** of free text in any language. Results are merged with the rule layer by union, so an AI miss can never hide a danger sign.
- **NutriScan photo recognition**, mapped onto the local food database.
- **Personalised weekly meal plans.**
- **NutriBot conversations** that use the child's latest growth results.

Calls use structured JSON outputs and server-side refusal fallbacks. Any error or refusal falls back silently to the offline path.

`GET /api/health` shows which mode is active.

### Supporting Chapter IV (Results)

| Evaluation measure (Ch. III) | Where to get it |
|---|---|
| Accuracy, precision, recall, F1, false-negative rate, confusion matrix | `GET /api/dashboard/model`, or `python -m app.cli metrics` (5-fold CV and a logistic-regression baseline included) |
| Workflow efficiency: time to recommendation, approval-to-ready, ready-to-pickup, case resolution | `GET /api/dashboard/evaluation` |
| Decision clarity: human review rate, human–AI agreement | `GET /api/dashboard/evaluation` |
| Low / moderate / high-risk and end-to-end workflows (4.9) | Demo children: Adel (low), Budi (moderate→high, declining), Yosef/Kevin (high); report danger signs for an emergency |
| Prevalence projection (Appendix B) | `GET /api/dashboard/projection?series=indonesia\|ntt` |

**Note on the projection:** the degree is chosen by *leave-one-out cross-validated* RMSE, not in-sample RMSE.
- On the Indonesia series, in-sample RMSE favours the cubic (0.45 vs 0.74).
- Held-out RMSE strongly favours the linear fit (1.1 vs 7.9 for the cubic).
- A cubic is never fitted to fewer than 6 points; on the 4-point NTT series it passes through every point and extrapolates to 0%.

This is the overfitting risk Appendix B already flags as future work.

---

## Tests and checks

```bash
cd backend && pytest -q            # 53 tests: WHO z-scores vs published tables, model quality, triage,
                                   # symptom lexicon, the full caregiver→Kader→officer→locker workflow,
                                   # RBAC, consent, encryption at rest, FHIR, offline sync
cd mobile && npx tsc --noEmit && npx eslint src
```

The test suite runs on SQLite by default. Set `NUTRISENSE_TEST_DATABASE_URL` to an empty PostgreSQL database to run it there.

Useful commands: `python -m app.cli train` (retrain and activate a new model run), `python -m app.cli seed`.

## What is simulated (by design, per the proposal's scope)

- **Training data:** the risk model is trained on a synthetic cohort shaped like rural NTT (about 33% stunted). Replace it with real, consented data via `risk_model.train(X, y)` before any field use.
- **Hardware:** drone flights, weather and smart-locker hardware are simulated. Officers can fast-forward flights from the Logistics tab.
- **SATUSEHAT:** submission is simulated. The FHIR bundle is generated and validated structurally, but not sent to the Ministry's servers.
- **Demo data:** village coordinates are approximate, and every region uses the NTT provincial SSGI 2024 benchmark (37.0%) until district figures are loaded. All demo people are fictional.
- **Nutrient values** are approximations from TKPI and USDA, meant for education and screening.

## Production checklist

- Set `NUTRISENSE_ENVIRONMENT=production`, a long `NUTRISENSE_JWT_SECRET` and a Fernet `NUTRISENSE_ENCRYPTION_KEY`. The server refuses to start in production without them.
- Use PostgreSQL over TLS, restrict `NUTRISENSE_CORS_ORIGINS`, and set `NUTRISENSE_SEED_DEMO_DATA=false`.
