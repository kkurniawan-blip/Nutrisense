# NutriSense & N.E.X.U.S.

An AI-driven health and logistics ecosystem for early stunting prevention in Indonesia. This repository is the working prototype for the pre-thesis *"NutriSense & N.E.X.U.S.: An AI-Driven Integrated Health and Logistics Ecosystem for Early Stunting Prevention in Indonesia"* (Kenneth Kurniawan, BINUS International, 2026).

| Folder | What it is |
|---|---|
| `backend/` | FastAPI + SQLAlchemy API, AI engine (WHO z-scores, scikit-learn risk model, triage, nutrition, Claude integration), N.E.X.U.S. logistics simulation, SATUSEHAT/FHIR mapping |
| `mobile/` | Expo (React Native) app for Android and iOS (also runs in a browser). One app, role-based screens for caregivers, Kaders, health officers and doctors |
| `e2e/` | Browser test that walks through the app for every role ([how to run](e2e/README.md)) |
| `docs/` | **[User guide](docs/USER_GUIDE.md)**: how to use the app, with screenshots |

AI output is decision support, not a medical diagnosis. The app says so on every result screen, and a clinician can confirm or override any assessment.

---

## Quick start

Needs **Python 3.11** and **Node.js 22** (the versions CI, the Docker image and the codespace use; see `.python-version` and `.nvmrc`).

### 1. Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env                                    # optional; add your Claude API key here
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

On first start it creates the database (SQLite, `backend/nutrisense.db`), loads a simulated posyandu network in East Nusa Tenggara, and trains the risk model (about 20 s). Interactive API docs are at **http://localhost:8000/docs**.

With Docker and PostgreSQL instead: `cp .env.example .env`, fill in the three secrets in `.env`, then `docker compose up --build` from the repository root (app and API on http://localhost:8000).

### 2. Mobile app

```bash
cd mobile
npm ci                 # installs the exact versions in package-lock.json
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
| Health officer | `officer@nutrisense.id` | Dashboard (KPIs, village heat map, prevalence projection, model card), approve supply requests (locker stock or road delivery from a hub), fast-forward the delivery simulation, review AI results |
| Doctor | `doctor@nutrisense.id` | Human-in-the-loop review, approve RUTF / deworming (doctor-only items), referrals |
| Admin | `admin@nutrisense.id` | Everything above, plus user management, audit log and model retraining (API) |

Or create your own mother/caregiver account with **Daftar sebagai Ibu / pengasuh** on the login screen. Kader and health-worker accounts are created by an admin (`POST /api/users`).

### Accounts and settings

- **Login:** email check, show/hide password, friendly errors, and "Lupa kata sandi?". The app has no email service, so this explains that a Kader or the Puskesmas resets the password.
- **Sign up (2 steps):**
  1. Name, email, optional phone, password with a strength meter, and a repeated password.
  2. Village, and consent grouped as Wajib / Untuk fitur AI / Untuk layanan kesehatan / Opsional.
- **Settings** (Profile → ⚙️ Pengaturan):
  - edit name, phone and village;
  - change password (`POST /api/auth/change-password`, needs the current password);
  - language and text size (Normal / Besar / Sangat besar);
  - offline sync status, and clearing saved data;
  - privacy, notifications, the health guide, server address, and app/AI info.
- **Shared phones:** logging out clears cached pages and unsent data. The app warns first if anything is still unsent. When a session expires, queued data is kept. Queued data never goes out under a different account.

### Put it online

The root `Dockerfile` builds a single image. The backend serves both the API and the web version of the app, so one link works on any phone's browser.

**Free, no credit card: GitHub Codespaces.** A codespace is a cloud computer from GitHub, free for about 60 hours a month on personal accounts. `.devcontainer/` sets it up to build and start the app by itself.

1. On this repository's GitHub page, click **Code → Codespaces → Create codespace on** the branch you want.
2. Wait about 5–10 minutes the first time.
3. In the **Ports** tab, right-click port **8000** → **Port Visibility → Public**, then copy the **Forwarded Address**. It looks like `https://…-8000.app.github.dev`.
4. Open that link on any phone and log in with a demo account.

The link works while the codespace is running. Codespaces stop after 30 minutes of inactivity by default (up to 4 hours in GitHub settings), and restarting one starts the app again. Details: [.devcontainer/README.md](.devcontainer/README.md).

**Always-on hosting (needs a card or a paid plan):**
- **Render:** `render.yaml` is a Render Blueprint for a public demo. Choose **New → Blueprint** and pick this repository. Render asks for card details. Its free services sleep after 15 minutes without visitors, and the next visit wakes them within about a minute. After the first deploy, check that `NUTRISENSE_CORS_ORIGINS` in the Render dashboard matches the service's real URL.
- **Hugging Face Spaces:** Docker Spaces need a Hugging Face PRO subscription; the free plan only hosts static pages. With PRO:
  1. Add a write token as the repository secret `HF_TOKEN`.
  2. Run **Actions → Deploy to Hugging Face**, or run `HF_TOKEN=hf_... python deploy/hf_space.py`.
  3. The script sets the Space variables that make it a demo: `NUTRISENSE_SEED_DEMO_DATA=true`, `NUTRISENSE_ALLOW_DEMO=1`, `NUTRISENSE_EPHEMERAL_SECRETS=1` and `NUTRISENSE_CORS_ORIGINS` (the Space's own URL).

Good to know about demo hosting:
- On Render and Hugging Face the disk is temporary: every restart or redeploy starts again from fresh demo data. That is fine for demos.
- Secrets: Render generates `NUTRISENSE_JWT_SECRET` and `NUTRISENSE_ENCRYPTION_KEY` once and keeps them across restarts. The Hugging Face Space has no secrets set, so with `NUTRISENSE_EPHEMERAL_SECRETS=1` it makes new random ones on every start, which logs everyone out.
- For real use, add a PostgreSQL database (`NUTRISENSE_DATABASE_URL`), set fixed `NUTRISENSE_JWT_SECRET` and `NUTRISENSE_ENCRYPTION_KEY`, and follow the production checklist below.
- The demo accounts and their password are public. Do not enter real children's data on a public demo.

To run the same image on any computer or server with Docker:
```bash
docker build -t nutrisense .
# Throwaway demo: demo accounts, random secrets, data lost when the container is removed
docker run -p 8000:8000 -e NUTRISENSE_SEED_DEMO_DATA=true -e NUTRISENSE_ALLOW_DEMO=1 \
  -e NUTRISENSE_EPHEMERAL_SECRETS=1 nutrisense              # then open http://localhost:8000
# Kept data: fixed secrets (from a file that is not committed) and a volume for /app/data
docker run -p 8000:8000 --env-file .env -v nutrisense-data:/app/data nutrisense
```

The image runs as a non-root user (uid 1000). Only `/app/data` is writable: the SQLite database (`/app/data/nutrisense.db`) and the trained models. By default it starts in production mode with no demo data, and it refuses to start without `NUTRISENSE_JWT_SECRET` and `NUTRISENSE_ENCRYPTION_KEY`. Docker checks `/api/health` every 30 seconds (`HEALTHCHECK`), and on `docker stop` the server finishes requests in flight (up to 20 seconds).

---

## How it maps to the proposal

**User layer** (caregiver app, Kader/officer app, doctor view)
- `mobile/src/app/(tabs)/*`: role-based tabs
- `child/[id]/*`: child profile, measurements, symptoms, nutrition, NutriScan
- `case/[id]`, `supply/[id]`, `scan`

**Application layer**
- REST API in `backend/app/routers/*`
- Offline-first outbox in `mobile/src/lib/offline.ts` for measurements, meals, symptoms, Catat ibu, ANC, TTD/PMT, ASI and KIA, replayed when the signal returns (idempotent by client UUID or day), with a sync status page (`/sync`)
- Login with a phone number or email; Kaders register a pregnant mother (`POST /api/kader/mothers`) who then logs in with her phone number

**Intelligence layer** (`backend/app/ai/`)
- `computeZScore()`: `growth.py` uses the official WHO 2006 LMS tables, the length/height switch at 24 months with the 0.7 cm correction, and WHO implausibility flags.
- `classify()`: `risk_model.py` is a Random Forest with a logistic-regression baseline that predicts stunting risk from 19 factors known before the child's size: birth (low birth weight, premature), ASI eksklusif, weight gain against the KBM (T/2T), illness, diet, immunisation, the mother (height < 150 cm, KEK in pregnancy) and the household. The child's height and z-scores are **not** inputs (stunting is defined by height-for-age, so the model would only re-read the answer), and neither is the area's stunting prevalence. The WHO status is shown separately; WHO cut-offs, oedema and IMCI danger signs can raise the level after the model but never lower it. Explanations come from perturbation-based feature contributions. Low-confidence results are flagged for human review. All model metrics are demo metrics on a synthetic cohort and are labelled "Data demo" in the dashboard.
- Buku KIA for the child: `kia.py` holds the immunisation / vitamin A / deworming schedule, the minimum weight gain (KBM) behind the 2T badge, and the ASI eksklusif window.
- Ibu hamil: `maternal.py` holds HPL, trimesters, ANC K1–K6, KEK (LiLA < 23.5 cm), anaemia (Hb < 11 g/dL), nifas visits and one risk level for the mother (Belum dicek … Risiko tinggi; missed visits lower it).
- Predictive growth tracker: `trend.py` computes HAZ velocity and projects 3 and 6 months ahead, so a child sliding toward −2 SD is flagged before stunting is visible.
- Triage engine: `triage.py` produces four urgency tiers, next steps, and supply needs.
- Symptom interpretation: `symptoms.py` reads Bahasa Indonesia, English and local terms (*mencret*, *step*, *lepeh*…).
- Nutrition: `nutrition.py` holds 32 local foods, AKG 2019 targets and WHO dietary diversity, gap analysis, and NTT recipes (kelor, jagung bose…). **NutriScan** turns a photo of food or ingredients into foods, then into the best cheap dish for the child (`kitchen.py`).
- NutriBot: `assistant.py`.
- Heat map and prevalence projection: `routers/dashboard.py`.

**Logistics layer (N.E.X.U.S.)**: `services/logistics.py`
- `checkStock()`: inventory with reservations.
- `simulateRoute()`: picks stock in a locker near the family (within 12 km), otherwise the fastest road delivery from a supply hub to the family's locker, using distance and how hard the village is to reach.
- Signed QR plus 6-digit pickup codes, expiry, and restock alerts.

**Governance layer**
- Consent per scope, enforced on AI and SATUSEHAT
- RBAC in `deps.py`; Kaders only see their villages
- Fernet encryption of free-text health notes at rest
- Audit log on every read and write of child data
- Right to deletion
- FHIR R4 export (`Patient`, `Observation` with LOINC 8302-2 / 8306-3 / 29463-7, `RiskAssessment`, `Consent`) and a simulated SATUSEHAT sync

### Design: soft pastel

A light, friendly look for mothers (`mobile/src/theme.ts`, `mobile/src/components/ui.tsx`):
- **Lavender** for main actions, with gentle gradient buttons; frosted-glass cards (translucent white, bright hairline edge, a whisper of shadow) over watercolour washes (peach, mint, lavender), and status dots with a soft glow.
- **One pastel colour per feature:** blue for growth, green for food, lavender for help and Nuri, orange for packages. Feature cards carry a gradient icon square; lists use round pastel icons.
- **Home** is readable in a few seconds: the greeting and child picker, one child card (status, height and weight), "Untuk hari ini" in short lines, four quick actions, then "Jelajahi fitur" cards that fold open.
- **Short flows show numbered step circles** (measuring, sign-up, NutriScan). The food variety of the day is a progress ring (for example 5/8).
- **Type:** Plus Jakarta Sans (designed in Jakarta): 18–22 px page titles, 15–17 px section titles, 15 px body, 12–13 px secondary text; bold only for titles, numbers, statuses and actions.
- **Short on the screen, detail on demand:** each card is a short title, the key number or status, one short line and one action. Reasons, technical numbers and data-use explanations sit behind a tap ("Lihat alasan →", "Detail analisis", "Kenapa bagus? →", "Pelajari grafik →", "Pelajari penggunaan data →").

The caregiver experience still feels warm rather than clinical:
- **Nuri**, a sprout mascot drawn in SVG (it grows with the child), greets, explains and cheers.
- Big feature tiles and big buttons; text size can be raised in Settings.
- Gentle status wording: "🌱 Growing well", "👀 Keep an eye on it", "💛 Needs attention". Emergencies stay unmistakably red. Staff screens keep the clinical labels.
- Small rewards: a food-variety ring (the 8 WHO food groups eaten today), meal-logging streaks, collectable stickers, and a "height vs. peers" bar.

### Simpler, action-first UX

Every screen answers "what should I do next?", following the journey monitor → understand → improve → follow → follow-up.

- **Semantic status colours, never colour alone.** Each status has a marker, a text label and a colour: green on track, yellow monitor, orange action, red urgent, blue info, violet AI. The marker is a coloured dot next to the words (`mobile/src/theme.ts` `statusColor`, `mobile/src/lib/status.ts`). Touch targets are at least 44 px and selected tabs get a filled icon on a soft pill.
- **Mother home:** an "Untuk hari ini" checklist in short lines (`GET /api/children/{id}/today`) and four quick actions. Secondary features sit in collapsible groups.
- **Child profile:** status, three SD tiles (Tinggi / Berat / BB-TB) with words underneath, the growth trend chart with "Pelajari grafik", Nuri's short result and actions, development as ✓/● per area (`/development`), and the care team "Tim {anak}" as avatar, name, role and status.
- **AI vs. professionals:** AI output is labelled "🤖 Nuri — panduan AI" and states that it is not a medical diagnosis. Z-scores and model confidence are on a separate "Detail analisis" screen, reached from "Lihat alasan". Notes a Kader or doctor shares with the family appear separately as "👩‍⚕️ Rekomendasi tenaga kesehatan", with name and time.
- **Guided 4-step measurement:** method, how-to, entry with plausibility warnings, then the result.
- **Symptoms:** "Gejala umum" are kept apart from "Tanda bahaya". Picking a danger sign immediately shows "🚨 Perlu pertolongan" with "Hubungi Kader" and "Lihat panduan".
- **NutriScan:** photo of the food or ingredients at home → check the recognised foods → one recommended dish for this child → a recipe page with ingredients, shopping list and short numbered steps → save it as a meal (see below).
- **Meal log:** "Yang sudah ada", "Yang bisa dilengkapi", one "💡 Ide sederhana", and a "5 / 8 kelompok hari ini" diversity card with a next target.
- **Roomy layout:** generous whitespace, fewer cards per screen, 54 px buttons and 60 px list rows.
- **Tanya Nuri:** topic chips (Pertumbuhan / Makan / Gejala / Perkembangan) with suggested questions that use the child's name. Answers come as one short line plus a few numbered points, with "Lihat panduan lengkap →".
- **Paket gizi:** per child, each package card shows what is in it, a two-word benefit, that it is free, the pickup locker and its progress or QR code. A note says packages are optional support.
- **🔐 Data & privasi:** one switch per permission with a single line, a "Simpan" button, and "Pelajari penggunaan data →" for what is shared and with whom.
- **Offline-first:** measurements, meals and symptoms are queued on the phone with idempotent client UUIDs, and GET responses are cached. A banner always shows the sync state ("📶 3 data menunggu dikirim", "✓ Data berhasil disinkronkan").
- **Kader home:** "Wilayah saya" shows counts for 🔴 Butuh tindak lanjut / 🟠 Perlu perhatian / 🟢 Terpantau. Below it is "Prioritas kunjungan" (name, village, status, "Lihat →") (`GET /api/dashboard/children`) with search, filters (Semua / Prioritas / Baru / Tindak lanjut, plus Wilayah, Status risiko, Terakhir diukur, Perlu kunjungan) and paging, so it scales to many children.
- **Kader review:** Kaders can confirm or raise an AI result, but only a doctor or officer can lower a high one. They can also share a case note with the family.

### NutriScan: from a photo to the best cheap dish

1. `POST /api/children/{id}/nutriscan` recognises the foods in a photo. The photo can be a meal or raw ingredients in the kitchen or market. This needs Claude; without a key, the mother taps the foods instead.
2. `POST /api/children/{id}/nutriscan/recipes` with `{"food_keys": [...]}` ranks the recipes (`backend/app/ai/kitchen.py`) by:
   - how many of the foods on hand they use;
   - nutrition for this child: the share of the child's daily need for protein, iron, zinc, vitamin A, calcium and energy, weighted towards the nutrients the child was short of this week;
   - the extra cost;
   - cooking time.

   It returns the best dish and two alternatives. Each has:
   - plain-language benefits per food;
   - highlights such as "Tinggi protein";
   - what is already at home;
   - what to buy, with estimated NTT prices and where to find it. Garden leaves like kelor are free.
   - a tip for low-value foods such as instant noodles and sweet snacks.

   With Claude enabled, Nuri adds one extra idea made mostly from the foods on hand.

All 22 recipes (`backend/app/ai/recipes.py`):
- use everyday, cheap foods from village kiosks, markets and gardens (egg, tempeh, tofu, moringa, corn, cassava, sweet potato, anchovy, local fish, banana);
- need only a pot, pan or steamer, and give household measures;
- show cooking time (mostly 3–20 minutes), a budget label and the minimum age. Baby-texture versions start at 6 months.

After a meal is logged, `POST /api/children/{id}/menu-suggestions` suggests dishes that add the food groups still missing today.

### Claude AI and the offline fallback

Without internet or an API key, the rules, WHO tables and the scikit-learn model always run. The exceptions are NutriScan photo recognition and open-ended Nuri answers. Without a key, mothers pick foods from a list instead, and Nuri answers from its built-in FAQ.

**Offline symptom reading** (`backend/app/ai/symptoms.py`) handles how mothers actually write:
- It first normalises the text: "-nya" suffixes, hyphens, slang such as *gak*, *bgt*, *lemes* and *cepet*, spelling variants such as *nafas* → *napas*, and stretched words such as *panaaas*.
- It then matches fixed phrases, plus body words and state words that appear close together in either order. So "napasnya cepat sekali", "cepat sekali napasnya" and "BAB-nya cair" are all understood.
- Negated statements ("tidak sesak", "no fever") are ignored.
- Resolved symptoms ("demamnya sudah turun") are ignored. Danger signs are the exception: "kejangnya sudah berhenti" still counts.
- "sudah tidak menyusu" is read as weaned, not as unable to drink.
- `tests/test_ai.py` covers these cases with real phrasings and with statements that must not raise an alarm.

When `NUTRISENSE_ANTHROPIC_API_KEY` is set, Claude (`claude-opus-5` by default) adds:
- **Symptom understanding** of free text in any language. Results are merged with the rule layer by union, so an AI miss can never hide a danger sign.
- **NutriScan photo recognition**, mapped onto the local food database.
- **Personalised weekly meal plans.**
- **NutriBot conversations** that use the child's latest growth results.

Calls use structured JSON outputs and server-side refusal fallbacks. Any error or refusal falls back silently to the offline path.

`GET /api/health` shows which mode is active.

### Check-ups from the Puskesmas or hospital (HL7 FHIR R4)

A pregnant mother's check-ups at the Puskesmas or hospital can reach her app automatically:
- **Consent and link code.** She turns on *Hubungkan ke Puskesmas* in the app and gets a link code (for example `NS-7KQ2MP`), which she shows to the midwife. Turning it off stops the code at once.
- **Sending.** After each visit, the facility's system (SIMPUS or a hospital EMR) sends a FHIR R4 Bundle (Patient with the code, Encounter, Observations) to `POST /api/integrations/fhir` with its own API key. Only a hash of each key is stored.
- **What NutriSense does.** It stores the check-up once (a resend with the same Encounter id updates it), marks the K visit done, adds LiLA, Hb and weight to her checks, and adds high blood pressure and an abnormal fetal heart rate to her risk. It notifies her, and alerts the Kader when something is wrong.
- **Facility keys:** `python -m app.cli facility-add "Puskesmas X"`. The demo data has test keys such as `demo-puskesmas-baumata-key`.
- **Simulator:** `python scripts/send_checkup.py --bp 150/95 --hb 10.2` pretends to be a Puskesmas system.

The guide for facility IT staff and SIMPUS vendors covers the message format, codes, errors and security: **[docs/FACILITY_INTEGRATION.md](docs/FACILITY_INTEGRATION.md)**.

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

## Team
NutriSense is built with a core team of specialist agents: Product Manager, Project Manager, UI/UX Designer,
Frontend Engineer, Backend Engineer, Mobile Developer, QA / Test Engineer, DevOps / Cloud Engineer and Data / AI
Engineer. Each is defined in `.claude/agents/`. Their shared context, the definition of done and who owns which files
are in **[docs/TEAM.md](docs/TEAM.md)**.

What to build next is decided in the **feature arena** (`.claude/skills/arena/`):
1. The agents pitch features, each with evidence from the code.
2. They cross-examine and score each other's pitches.
3. A script totals the scores. Only winners are built, and if nothing wins, nothing changes.

The first round, its scores and the verdict are in [docs/arena/2026-10-09](docs/arena/2026-10-09/VERDICT.md).

## Tests and checks

```bash
cd backend && pytest -q            # 420 tests: WHO z-scores vs published tables, model quality, triage,
                                   # symptom lexicon, the full caregiver→Kader→officer→locker workflow,
                                   # RBAC, consent, encryption at rest, FHIR (out and in), offline sync,
                                   # maternal danger follow-up, young-infant danger signs
cd mobile && npx tsc --noEmit && npx expo lint
cd e2e && npm test                 # 48-step browser walkthrough for every role (see e2e/README.md)
cd e2e && npm run qa               # 37 QA cases for release
cd e2e && npm run features         # every feature once, black-box: 83 features (docs/PENGUJIAN-FITUR.md)
```

The test suite runs on SQLite by default. Set `NUTRISENSE_TEST_DATABASE_URL` to an empty PostgreSQL database to run it there.

**CI** (`.github/workflows/ci.yml`) runs on every push and pull request: backend tests on SQLite and on PostgreSQL 16, mobile typecheck, lint and web export, the browser walkthrough, the QA pass and the feature check, each on a fresh demo database, a Docker build with a smoke test, and a dependency audit (report-only for now).

Useful commands: `python -m app.cli train` (retrain and activate a new model run), `python -m app.cli seed`.

## What is simulated (by design, per the proposal's scope)

- **Training data:** the risk model is trained on a synthetic cohort shaped like rural NTT (about 33% stunted). Replace it with real, consented data via `risk_model.train(X, y)` before any field use.
- **Hardware:** road deliveries and smart-locker hardware are simulated. Officers can fast-forward deliveries from the Logistics tab.
- **SATUSEHAT:** submission is simulated. The FHIR bundle is generated and validated structurally, but not sent to the Ministry's servers.
- **Demo data:** village coordinates are approximate, and every region uses the NTT provincial SSGI 2024 benchmark (37.0%) until district figures are loaded. All demo people are fictional.
- **Nutrient values** are approximations from TKPI and USDA, meant for education and screening.

## Production checklist

Before any real child or pregnancy data goes in:

- **Mode and secrets.** `NUTRISENSE_ENVIRONMENT=production` (the Docker image's default). Set a long random `NUTRISENSE_JWT_SECRET` and `NUTRISENSE_ENCRYPTION_KEY` (a Fernet key, or any random secret that a key is derived from) in the host's secret store, never in the repository or in logs. Keep them fixed for the life of the database. The server refuses to start in production without them.
- **No demo data.** `NUTRISENSE_SEED_DEMO_DATA=false` (the image's default), and do not set `NUTRISENSE_ALLOW_DEMO` or `NUTRISENSE_EPHEMERAL_SECRETS`: those are for public demos only. Create the first admin with `python -m app.cli user-add --role admin ...` (in Docker: `docker compose exec api python -m app.cli user-add ...`).
- **Database.** PostgreSQL over TLS (add `?sslmode=require` to `NUTRISENSE_DATABASE_URL`), with scheduled backups and a restore you have tried (see below).
- **HTTPS only.** Put the app behind a host or proxy that terminates HTTPS (Render and Hugging Face do). Set `FORWARDED_ALLOW_IPS` to the proxy's address range if you know it.
- **CORS.** Set `NUTRISENSE_CORS_ORIGINS` to the exact browser origins that call the API, never `*`. The built-in web app and the native app need none.
- **Facility keys.** Create a real API key for each health facility (`python -m app.cli facility-add`). The demo facility keys are public. See [docs/FACILITY_INTEGRATION.md](docs/FACILITY_INTEGRATION.md#9-security).
- **Health checks.** Point liveness probes at `/api/health` and readiness (when traffic may be sent) at `/api/health/ready`.

## Backup and restore

Back up two things, and keep them apart:
1. **The database** (below).
2. **`NUTRISENSE_ENCRYPTION_KEY`.** Symptom descriptions and clinical notes are encrypted with it. A database restored without the same key shows those notes as "unreadable". Keep the key in a password manager or secret store, not next to the database dumps.

**SQLite** (the default; `backend/nutrisense.db`, or `/app/data/nutrisense.db` in the Docker image). Use SQLite's online backup, which is safe while the server runs. Do not copy the file while the server is running.
```bash
sqlite3 backend/nutrisense.db ".backup 'nutrisense-$(date +%F).db'"            # on a machine with the sqlite3 tool
docker exec <container> python -c "import sqlite3; sqlite3.connect('/app/data/nutrisense.db').backup(sqlite3.connect('/app/data/backup.db'))"
docker cp <container>:/app/data/backup.db nutrisense-$(date +%F).db                # inside the image (no sqlite3 tool there)
```
Restore: stop the server, replace the database file with the backup copy (in Docker: `docker cp` it to `/app/data/nutrisense.db`, owned by uid 1000), and start the server with the same `NUTRISENSE_ENCRYPTION_KEY`.

**PostgreSQL** (custom format, so you can restore all or part of it):
```bash
# Backup (docker compose; for a managed database use its URL: pg_dump -Fc "postgresql://user:pass@host/db?sslmode=require")
docker compose exec -T db pg_dump -U nutrisense -Fc nutrisense > nutrisense-$(date +%F).dump
# Restore into the same database: stop the app first so nothing writes during the restore
docker compose stop api
docker compose exec -T db pg_restore -U nutrisense -d nutrisense --clean --if-exists --no-owner < nutrisense-2026-10-02.dump
docker compose start api
```
`NUTRISENSE_DATABASE_URL` uses `postgresql+psycopg2://`. The `pg_dump` and `pg_restore` tools need plain `postgresql://`.

Then check the restore: `/api/health` answers, you can log in, and an older symptom note can be read. Try a restore into a scratch database at least once before you depend on the backups.
