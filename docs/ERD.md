# NutriSense & N.E.X.U.S.: Entity Relationship Diagram (ERD)

| | |
|---|---|
| **Source of truth** | [`backend/app/models.py`](../backend/app/models.py) (SQLAlchemy 2), at commit `90d64d9` |
| **Database** | SQLite for demos and tests, PostgreSQL in production. Columns added after the first release are created on start-up by `database.py` (`_ADDED_COLUMNS`). |
| **Size** | 30 tables in 7 areas |
| **Related** | [PRD](PRD.md) (requirement IDs such as `MAT-07` are used below) · [Facility integration](FACILITY_INTEGRATION.md) |

The overview is generated from the models by [`backend/scripts/erd_dot.py`](../backend/scripts/erd_dot.py) (Graphviz), so
it cannot drift from the code: [`images/erd.svg`](images/erd.svg) (vector, for the thesis document) and
[`images/erd.png`](images/erd.png). The diagrams per area are written in [Mermaid](https://mermaid.js.org/) and render on
GitHub. A test (`backend/tests/test_erd_doc.py`) fails if a table is added to the models but not to this document.

How to read the diagrams:
- `||` exactly one, `|o` zero or one, `o{` zero or many.
- A line drawn from `users` means a foreign key to `users.id`; its label says which column (for example `mother_id`).
- `PK` primary key, `FK` foreign key, `UK` unique. Every table has an integer `id` primary key.
- Times are stored as timezone-aware UTC (`UTCDateTime`). `json` columns hold lists or objects (SQLite JSON, PostgreSQL JSON).

---

## 1. Overview

![NutriSense ERD: 30 tables in 7 areas, crow's-foot notation](images/erd.png)

Each box lists the table's keys: `PK` primary key, `FK` foreign key (with the table it points to), `UK` unique, `UK*` part
of a unique pair, and `?` for a column that may be empty. The other columns are counted at the bottom of each box and
listed in the diagrams per area below. On a line, `||` means exactly one, `|o` zero or one and `o<` zero or many.
Staff columns that point to `users` (who recorded, reviewed, approved or followed up) are listed in the boxes but not
drawn as lines, to keep the picture readable; they are all in [§9](#9-foreign-keys-to-users).

To regenerate after a model change:

```sh
cd backend
python scripts/erd_dot.py > /tmp/erd.dot
dot -Tsvg /tmp/erd.dot -o ../docs/images/erd.svg
dot -Tpng -Gdpi=150 /tmp/erd.dot -o ../docs/images/erd.png
```

---

## 2. People and places

```mermaid
erDiagram
  regions |o--o{ users : "region_id"
  regions {
    int id PK
    string name "village (desa)"
    string district "kabupaten"
    string province
    float lat
    float lng
    bool rural
    float prevalence_benchmark "nullable; % stunting, reference data"
    int transport_difficulty "1 easy .. 3 island or no road"
    string puskesmas_name "nullable; emergency card"
    string puskesmas_phone "nullable"
    float facility_km "nullable; village to Puskesmas"
    int posyandu_day "nullable; day of the month"
  }
  users {
    int id PK
    string email UK "nullable; phone-only accounts have none"
    string password_hash "PBKDF2-SHA256"
    string full_name
    string phone "nullable, indexed; login by phone"
    string role "caregiver | kader | officer | doctor | admin"
    int region_id FK "nullable"
    string language "id | en"
    json covered_region_ids "Kader coverage: extra region ids"
    bool is_active
    int token_version "bumped on logout or password change"
    datetime created_at
  }
```

| Table | What one row is | Rules |
|---|---|---|
| `regions` | A village (desa) with its district, the nearest Puskesmas and the posyandu day | Read-mostly reference data, seeded |
| `users` | A person who logs in. A mother is a `caregiver`, whether she has a child, a pregnancy or both | Log in by `email` or `phone`. A Kader's coverage is `region_id` plus `covered_region_ids` (AUTH-04). Raising `token_version` revokes every session (AUTH-06) |

---

## 3. Child health

```mermaid
erDiagram
  children ||--o{ growth_measurements : "child_id"
  children ||--o{ symptom_reports : "child_id"
  children ||--o{ meal_logs : "child_id"
  children ||--o{ development_checks : "child_id"
  children ||--o{ kia_records : "child_id"
  children ||--o{ breastfeeding_logs : "child_id"
  children {
    int id PK
    string name
    string sex "male | female"
    date birth_date
    int caregiver_id FK "users"
    int kader_id FK "users, nullable"
    int region_id FK "nullable"
    float birth_weight_kg "nullable"
    float birth_length_cm "nullable"
    bool clean_water_access
    bool sanitation_access
    bool exclusive_breastfeeding "nullable"
    float birth_gestational_weeks "nullable; under 37 = premature"
    datetime created_at
  }
  growth_measurements {
    int id PK
    int child_id FK
    date measured_at
    float age_months
    float weight_kg
    float height_cm
    float muac_cm "nullable"
    string position "lying | standing"
    float haz "nullable; WHO height-for-age z"
    float waz "nullable; weight-for-age z"
    float whz "nullable; weight-for-height z"
    string source "app | kader | iot"
    string measured_by "nullable; mother | kader"
    bool oedema "nullable"
    string client_uuid UK "nullable; offline replay key"
    int recorded_by_id FK "users, nullable"
    datetime created_at
  }
  symptom_reports {
    int id PK
    int child_id FK
    int reported_by_id FK "users"
    text description "ENCRYPTED, nullable"
    json symptoms
    json danger_signs
    string appetite "nullable"
    int duration_days "nullable"
    string interpreted_by "rules | claude+rules"
    text summary "nullable"
    string client_uuid "nullable, indexed"
    datetime created_at
  }
  meal_logs {
    int id PK
    int child_id FK
    int logged_by_id FK "users"
    datetime eaten_at
    string meal_type "nullable"
    json items
    json nutrients
    json food_groups "of the 8 WHO groups"
    string source "manual | nutriscan"
    text ai_notes "nullable"
    string client_uuid "nullable, indexed"
    datetime created_at
  }
  development_checks {
    int id PK
    int child_id FK "UK with milestone_key"
    string milestone_key
    bool achieved
    int recorded_by_id FK "users"
    datetime updated_at
  }
  kia_records {
    int id PK
    int child_id FK "UK with item_key"
    string item_key "imm_2, vita_12, worm_18 ..."
    date given_at
    int recorded_by_id FK "users, nullable"
  }
  breastfeeding_logs {
    int id PK
    int child_id FK "UK with day"
    date day
    bool asi_only
    int feeds "nullable"
    json other "water, formula, honey ..."
    string client_uuid "nullable"
  }
```

| Table | What one row is | Rules |
|---|---|---|
| `children` | A child under five | Owned by one caregiver (`caregiver_id`), followed by one Kader (`kader_id`). Deleting a child deletes all its rows in the tables of this section, its assessments, cases, requests and links (GOV-05) |
| `growth_measurements` | One weighing and height measurement | z-scores computed by the server from the WHO 2006 tables (GRW-03). `client_uuid` is unique, so an offline replay never creates a second row (OFF-02) |
| `symptom_reports` | One symptom report | The free-text `description` is encrypted at rest (GOV-04). `danger_signs` drives the emergency screen (SYM-03) |
| `meal_logs` | One meal | `food_groups` feeds the diversity ring (NUT-04) |
| `development_checks` | The answer to one age milestone | One row per child and milestone |
| `kia_records` | A Buku KIA item marked as given | One row per child and item. The schedule itself is code (`ai/kia.py`), not a table |
| `breastfeeding_logs` | One day of the ASI eksklusif tracker | One row per child and day, so a resend of the same day updates it |

---

## 4. AI assessment and cases

```mermaid
erDiagram
  children ||--o{ risk_assessments : "child_id"
  growth_measurements |o--o{ risk_assessments : "measurement_id"
  symptom_reports |o--o{ risk_assessments : "symptom_report_id"
  model_runs |o--o{ risk_assessments : "model_run_id"
  risk_assessments |o--o{ nutrition_recommendations : "assessment_id"
  risk_assessments |o--o{ cases : "assessment_id"
  children ||--o{ cases : "child_id"
  cases ||--o{ case_notes : "case_id"
  model_runs {
    int id PK
    string name
    string algorithm "Random Forest, LR baseline"
    string version
    int n_samples
    json metrics
    json feature_importances
    bool is_active
    text notes "nullable"
    datetime trained_at
  }
  risk_assessments {
    int id PK
    int child_id FK
    int measurement_id FK "nullable"
    int symptom_report_id FK "nullable"
    int model_run_id FK "nullable"
    string risk_level "low | medium | high"
    json probabilities
    float confidence
    bool needs_review "confidence under 0.6 or guardrail"
    string guardrail "nullable; rule that raised the level"
    json explanation "factor contributions"
    json reasons "plain-language reasons"
    json triage "urgency tier, actions, supplies"
    json trend "HAZ velocity and projection"
    json features "model inputs"
    int reviewed_by_id FK "users, nullable"
    text review_note "nullable"
    string reviewed_level "nullable"
    datetime reviewed_at "nullable"
    datetime created_at
  }
  nutrition_recommendations {
    int id PK
    int child_id FK
    int assessment_id FK "nullable"
    json content
    string generated_by "rules | claude+rules"
    datetime created_at
  }
  cases {
    int id PK
    int child_id FK
    int assessment_id FK "nullable"
    string status "open | in_progress | referred | resolved | closed"
    string priority "low | medium | high | emergency"
    string urgency "nullable; triage tier"
    int assigned_to_id FK "users (Kader), nullable"
    int doctor_id FK "users, nullable"
    datetime created_at
    datetime updated_at
    datetime resolved_at "nullable"
  }
  case_notes {
    int id PK
    int case_id FK
    int author_id FK "users"
    text text "ENCRYPTED"
    bool visible_to_caregiver "shared with the family"
    datetime created_at
  }
```

| Table | What one row is | Rules |
|---|---|---|
| `model_runs` | One trained version of the risk model | One active version at a time (`is_active`); retraining adds a row (RSK-08) |
| `risk_assessments` | The result of assessing a child, usually after a measurement or a symptom report | The model's level can only be raised by `guardrail` rules (RSK-02). A doctor's review fills the `reviewed_*` columns and keeps the original (RSK-05) |
| `nutrition_recommendations` | Feeding advice produced for an assessment | |
| `cases` | A child who needs follow-up by the Kader or doctor | Opened by a high, emergency or review result (CAS-01). `urgency` copies the triage tier (`emergency`, `doctor_48h`, `kader_7d`) |
| `case_notes` | A note on a case | Encrypted. A note with `visible_to_caregiver` shows in the mother's app (CAS-03) |

---

## 5. Pregnancy, birth and nifas

```mermaid
erDiagram
  pregnancies ||--o{ maternal_measurements : "pregnancy_id"
  pregnancies ||--o{ anc_visits : "pregnancy_id"
  pregnancies ||--o{ pregnancy_daily_logs : "pregnancy_id"
  pregnancies ||--o{ pregnancy_danger_reports : "pregnancy_id"
  pregnancies |o--o| children : "child_id (the baby)"
  pregnancies {
    int id PK
    int mother_id FK "users"
    int kader_id FK "users, nullable"
    int region_id FK "nullable"
    date hpht "first day of the last period"
    float mother_height_cm "nullable"
    string education "nullable"
    int gravida "nullable"
    string status "active | delivered | ended"
    json birth_plan "place, transport, companion, donor, funding"
    json birth_info "place, attendant, weeks at birth"
    date delivered_at "nullable"
    int child_id FK "children, nullable; set at birth"
    json nifas_done "KF1..KF4, KN1..KN3 codes"
    bool facility_sync "mother's consent to the link"
    string link_code "nullable; current NS- code"
    int linked_facility_id FK "health_facilities, nullable"
    datetime last_sync_at "nullable"
    datetime created_at
  }
  maternal_measurements {
    int id PK
    int pregnancy_id FK
    date measured_at
    float gestational_weeks
    float muac_cm "nullable; LiLA, KEK under 23.5"
    float hb_g_dl "nullable; anaemia under 11"
    float weight_kg "nullable"
    string client_uuid UK "nullable"
    int recorded_by_id FK "users, nullable"
    datetime created_at
  }
  anc_visits {
    int id PK
    int pregnancy_id FK "UK with number"
    int number "K1..K6"
    date visit_date
    string place "nullable"
    int recorded_by_id FK "users, nullable"
  }
  pregnancy_daily_logs {
    int id PK
    int pregnancy_id FK "UK with day"
    date day
    bool ttd "iron tablet taken"
    bool pmt "supplementary food eaten"
  }
  pregnancy_danger_reports {
    int id PK
    int pregnancy_id FK
    json signs
    bool danger
    int reported_by_id FK "users, nullable"
    string client_uuid "nullable, indexed; offline replay"
    datetime created_at
    datetime contacted_at "nullable"
    int contacted_by_id FK "users, nullable"
    string outcome "nullable; went_to_facility | advised_home"
    datetime outcome_at "nullable"
    int outcome_by_id FK "users, nullable"
  }
```

| Table | What one row is | Rules |
|---|---|---|
| `pregnancies` | One pregnancy, from the HPHT through birth and the 42-day nifas | The due date, trimester, K1–K6 windows and risk are computed, not stored (MAT-01, MAT-05). At birth, `child_id` points to the new child row (MAT-10) |
| `maternal_measurements` | One LiLA and Hb record | `client_uuid` unique (offline) |
| `anc_visits` | One completed antenatal visit, K1–K6 | One row per pregnancy and visit number |
| `pregnancy_daily_logs` | One day of TTD and PMT | One row per pregnancy and day |
| `pregnancy_danger_reports` | One danger-sign report by the mother | **Open** while `danger` is true, `outcome` is empty and it is under 14 days old. An open report keeps the mother urgent, even after a later minor complaint (MAT-07). "Not reached" does not set `outcome`; it is written to `audit_logs` as an attempt, so the report stays open |

---

## 6. Check-ups from the health facility (HL7 FHIR R4)

```mermaid
erDiagram
  health_facilities |o--o{ pregnancies : "linked_facility_id"
  health_facilities ||--o{ anc_exams : "facility_id"
  pregnancies ||--o{ anc_exams : "pregnancy_id"
  pregnancies ||--o{ facility_link_codes : "pregnancy_id"
  health_facilities {
    int id PK
    string name
    string kind "puskesmas | rs | bidan"
    string code "nullable; Kemenkes facility code"
    int region_id FK "nullable"
    string api_key_hash UK "SHA-256 of the facility key"
    bool active
    datetime created_at
  }
  facility_link_codes {
    int id PK
    string code UK "NS-XXXXXX, never reused"
    int pregnancy_id FK
    datetime issued_at
    datetime revoked_at "nullable"
  }
  anc_exams {
    int id PK
    int pregnancy_id FK
    int facility_id FK "UK with external_id"
    string external_id "facility Encounter id"
    int visit_number "nullable; K1..K6"
    date exam_date
    float gestational_weeks "nullable"
    string examiner "nullable"
    float weight_kg "nullable"
    int bp_systolic "nullable"
    int bp_diastolic "nullable"
    float muac_cm "nullable"
    float hb_g_dl "nullable"
    float fundal_height_cm "nullable"
    int fetal_heart_rate "nullable"
    string fetal_presentation "nullable"
    string urine_protein "nullable"
    string td_immunization "nullable"
    int iron_tablets "nullable"
    text notes "ENCRYPTED, nullable"
    datetime received_at
  }
```

| Table | What one row is | Rules |
|---|---|---|
| `health_facilities` | A Puskesmas, hospital or midwife practice whose system sends check-ups | Only the SHA-256 hash of its API key is stored (FAC-02) |
| `facility_link_codes` | Every link code ever issued | `code` is unique and never reissued, so a code a facility still holds after the mother revoked it cannot reach another mother (FAC-03) |
| `anc_exams` | One check-up received from a facility | Unique on (`facility_id`, `external_id`): a resend updates the row, never duplicates it (FAC-03) |

---

## 7. N.E.X.U.S. logistics

```mermaid
erDiagram
  lockers ||--o{ inventory_items : "locker_id"
  lockers |o--o{ supply_requests : "locker_id"
  children ||--o{ supply_requests : "child_id"
  cases |o--o{ supply_requests : "case_id"
  lockers {
    int id PK
    string code UK "LKR-BMT ..."
    string name
    string kind "locker | hub"
    int region_id FK "nullable"
    float lat
    float lng
    string status "default online; heartbeat"
    int slots_total
    datetime last_heartbeat
  }
  inventory_items {
    int id PK
    int locker_id FK "UK with item_key"
    string item_key "pmt_biscuit, rutf, mnp_taburia ..."
    int quantity
    int reserved "held for approved requests"
    int restock_threshold
    datetime updated_at
  }
  supply_requests {
    int id PK
    int child_id FK
    int case_id FK "nullable"
    int requested_by_id FK "users"
    json items "item_key and quantity"
    string urgency "routine | kader_7d | doctor_48h | emergency"
    string status "pending_approval | awaiting_stock | in_transit | ready_for_pickup | picked_up | expired | rejected"
    string fulfillment "nullable; locker_stock | courier"
    int locker_id FK "nullable; pickup locker"
    string pickup_code "nullable, indexed; 6 digits"
    string qr_payload "nullable; signed"
    json decision "route options and reasons"
    int approved_by_id FK "users, nullable"
    datetime approved_at "nullable"
    datetime ready_at "nullable"
    datetime picked_up_at "nullable"
    datetime expires_at "nullable"
    datetime created_at
  }
```

| Table | What one row is | Rules |
|---|---|---|
| `lockers` | A smart locker at a posyandu (`kind = locker`) or a supply hub that restocks lockers by road (`kind = hub`) | Hardware is simulated |
| `inventory_items` | The stock of one item in one locker | One row per locker and item. Available = `quantity` − `reserved` (LOG-06) |
| `supply_requests` | A package for one child | Lifecycle: `pending_approval` → approved with stock reserved and a route chosen (LOG-02, LOG-03): `ready_for_pickup` at once from locker stock, or `in_transit` (or `awaiting_stock`) for a road delivery → `ready_for_pickup` with a code and QR (LOG-04) → `picked_up` (LOG-05). It can also end `rejected` or `expired`. `decision` keeps the reasons shown to the officer |

---

## 8. Consent, audit, notifications and assistant

```mermaid
erDiagram
  users ||--o{ consents : "user_id"
  children |o--o{ consents : "child_id"
  users |o--o{ audit_logs : "user_id"
  users ||--o{ notifications : "user_id"
  users ||--o{ chat_messages : "user_id"
  children |o--o{ chat_messages : "child_id"
  children ||--o{ fhir_sync_logs : "child_id"
  consents {
    int id PK
    int user_id FK
    int child_id FK "nullable"
    string scope "data_processing | ai_analysis | satusehat_sharing | research_use"
    bool granted
    string version
    datetime updated_at
  }
  audit_logs {
    int id PK
    int user_id FK "nullable; system or failed login"
    string action "view_child, record_measurement, login, consent_change ..."
    string entity
    int entity_id "nullable"
    json detail
    datetime created_at "indexed"
  }
  notifications {
    int id PK
    int user_id FK
    string kind "mother_danger, birth, pickup_expired ..."
    string title
    text body
    json data "link to the screen"
    bool read
    datetime created_at
  }
  chat_messages {
    int id PK
    int user_id FK
    int child_id FK "nullable"
    string role "user | assistant"
    text content "ENCRYPTED"
    string generated_by "nullable; faq | claude"
    datetime created_at
  }
  fhir_sync_logs {
    int id PK
    int child_id FK
    int triggered_by_id FK "users"
    string status "simulated_success | blocked_no_consent"
    int resource_count
    text message "nullable"
    datetime created_at
  }
```

| Table | What one row is | Rules |
|---|---|---|
| `consents` | A consent decision for one scope | Each change adds a row, and the newest row counts. `data_processing` cannot be withdrawn in the app; AI calls and SATUSEHAT sharing check their scope first (GOV-01, GOV-02) |
| `audit_logs` | One action on personal data | Written on every read and write of child and pregnancy data, consent changes, logins and staff follow-up, including `danger_not_reached` attempts (GOV-03). Append-only |
| `notifications` | One in-app message | Created by the server for results, cases, danger reports, births, packages and facility results (GOV-07) |
| `chat_messages` | One message to or from Nuri | Encrypted. `generated_by` tells the offline FAQ (`faq`) from Claude (`claude`) (AST-01, AST-03) |
| `fhir_sync_logs` | One FHIR export or simulated SATUSEHAT sync | `blocked_no_consent` when the family has not agreed to sharing (GOV-06) |

---

## 9. Foreign keys to `users`

Many tables record **who** did something. Every column below is a foreign key to `users.id`:

| Table | Column | Meaning | Required |
|---|---|---|---|
| `children` | `caregiver_id` | The mother or carer who owns the record | yes |
| `children` | `kader_id` | The Kader who follows the child | no |
| `pregnancies` | `mother_id` | The pregnant mother | yes |
| `pregnancies` | `kader_id` | Her Kader | no |
| `growth_measurements`, `maternal_measurements`, `anc_visits`, `kia_records`, `development_checks` | `recorded_by_id` | Who entered it | `development_checks`: yes; others: no |
| `symptom_reports` | `reported_by_id` | Who reported | yes |
| `meal_logs` | `logged_by_id` | Who logged | yes |
| `risk_assessments` | `reviewed_by_id` | The doctor or officer who reviewed the AI result | no |
| `cases` | `assigned_to_id`, `doctor_id` | The Kader and the doctor on the case | no |
| `case_notes` | `author_id` | Who wrote the note | yes |
| `supply_requests` | `requested_by_id`, `approved_by_id` | Who asked and who approved | requested: yes |
| `pregnancy_danger_reports` | `reported_by_id`, `contacted_by_id`, `outcome_by_id` | Who reported, who called the mother, who recorded the outcome | no |
| `consents`, `notifications`, `chat_messages` | `user_id` | The owner | yes |
| `audit_logs` | `user_id` | Who acted (empty for the system or a failed login) | no |
| `fhir_sync_logs` | `triggered_by_id` | Who started the export | yes |

## 10. Rules that cut across tables

| Rule | Where | Why |
|---|---|---|
| **Offline idempotency.** `client_uuid` on `growth_measurements` and `maternal_measurements` (unique), and on `symptom_reports`, `meal_logs`, `breastfeeding_logs` and `pregnancy_danger_reports` (checked by the server). Day-based tables are unique on (owner, `day`) | OFF-02 | A report replayed after the signal returns is stored once |
| **Encryption at rest.** `symptom_reports.description`, `case_notes.text`, `chat_messages.content`, `anc_exams.notes` use `EncryptedText` (Fernet, key `NUTRISENSE_ENCRYPTION_KEY`) | GOV-04 | Free text can hold anything; a database copy without the key cannot read it |
| **Unique pairs.** (`child_id`, `milestone_key`), (`child_id`, `item_key`), (`child_id`, `day`), (`pregnancy_id`, `number`), (`pregnancy_id`, `day`), (`locker_id`, `item_key`), (`facility_id`, `external_id`) | — | One fact, one row; a resend updates it |
| **Region scoping.** `children.region_id`, `pregnancies.region_id` and the user's coverage decide what a Kader can see | AUTH-04 | Kaders see only their villages |
| **Computed, not stored.** WHO z-scores are stored with each measurement; the due date, trimester, K windows, maternal risk, KIA due items and the "Untuk hari ini" list are computed on each request | — | Rules can improve without migrating data |
| **References by code, not by foreign key.** `users.covered_region_ids` (region ids in JSON), `kia_records.item_key` and `development_checks.milestone_key` (schedules in `ai/kia.py`, `ai/development.py`), `inventory_items.item_key` (catalogue in `ai/triage.py`), `pregnancies.nifas_done` (KF/KN codes) | — | The schedules and catalogue are part of the clinical rules in code |
| **Deletion.** Deleting a child removes its measurements, reports, logs, assessments, cases, requests, consents, chat and links | GOV-05 | Right to deletion |
