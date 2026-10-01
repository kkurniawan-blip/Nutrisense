# Sending antenatal check-ups to NutriSense (HL7 FHIR R4)

This guide is for the IT person at a Puskesmas or hospital, or a SIMPUS / EMR vendor. It explains how your system can send a pregnant mother's check-up (pemeriksaan kehamilan, ANC) to NutriSense, so it shows in her app automatically.

In short: after each check-up, your system sends one FHIR R4 `Bundle` with an HTTPS `POST` to `/api/integrations/fhir`. It carries your facility's API key, and NutriSense answers with an `OperationOutcome`.

- [1. How it works](#1-how-it-works)
- [2. Getting an API key](#2-getting-an-api-key)
- [3. The endpoint](#3-the-endpoint)
- [4. The Bundle](#4-the-bundle)
- [5. Codes](#5-codes)
- [6. Responses and errors](#6-responses-and-errors)
- [7. Sending again (idempotency) and corrections](#7-sending-again-idempotency-and-corrections)
- [8. Testing](#8-testing)
- [9. Security](#9-security)
- [10. Connecting to SATUSEHAT later](#10-connecting-to-satusehat-later)
- [11. Not supported yet](#11-not-supported-yet)

## 1. How it works

1. **The mother gives consent.** In the NutriSense app she opens *Kehamilan* and turns on *Hubungkan ke Puskesmas*. The app shows her a **link code** such as `NS-7KQ2MP`.
2. **She shows the code at the check-up.** The midwife types it into your system once, as an identifier on the mother's patient record. The code identifies her pregnancy in NutriSense without her NIK, phone number or name.
3. **Your system sends the check-up.** After the visit, it sends a Bundle with the mother's `Patient` (carrying the code), the visit (`Encounter`) and the measurements (`Observation`s).
4. **NutriSense stores it.** It does these things:
   - finds the pregnancy by the code and checks that consent is still on;
   - stores the check-up, once only, even if you send it again;
   - marks the K visit (K1–K6) as done;
   - adds LiLA, Hb and weight to the mother's own checks;
   - recalculates her risk level and notifies her.

   If something needs attention, it also alerts her **Kader** (community health worker). This happens when:
   - blood pressure is 140/90 mmHg or higher;
   - the fetal heart rate is outside 120–160 per minute;
   - Hb is below 11 g/dL (below 7 g/dL is severe);
   - LiLA is below 23.5 cm (KEK).

**Consent rules**

- The mother can turn the link off at any time. The code stops working at once, and NutriSense refuses anything sent with it, including a resend of an earlier check-up. Check-ups already received stay in her record.
- If she turns the link on again, she gets a **new** code. An old code never works again, and it is never given to another mother.
- Each pregnancy has its own code. After the birth, the code still accepts check-ups dated **before** the birth (a late send). Check-ups dated after the birth are refused, because postpartum (nifas) visits are not received this way yet.
- The endpoint only receives data. It never returns any information about the mother.

## 2. Getting an API key

Each facility has its own key. To get one, ask the NutriSense administrator. They create the facility on the server:

```bash
cd backend
python -m app.cli facility-add "Puskesmas Baumata" puskesmas [Kemenkes facility code]
python -m app.cli facility-list
python -m app.cli facility-rotate-key <id>     # a new key; the old one stops working at once
python -m app.cli facility-disable <id>        # stop accepting this facility's messages
```

- **The key is shown once.** It is a random 256-bit string, such as `nsk_Uqj...`. The administrator sends it to you over a safe channel, not by plain email or chat.
- **NutriSense stores only a SHA-256 hash of the key, never the key itself.** If the key is lost, nobody can look it up: the administrator makes a new one with `facility-rotate-key`.
- **Keep the key on your server, in configuration or a secret store.** Never put it in a mobile app, a web page or source code.

## 3. The endpoint

| | |
|---|---|
| URL | `https://<nutrisense-host>/api/integrations/fhir` |
| Method | `POST` |
| Auth | `Authorization: Bearer <facility key>` (or the header `X-Facility-Key: <facility key>`) |
| Body | One FHIR R4 `Bundle` as JSON; `Content-Type: application/fhir+json` or `application/json` |
| Answer | An `OperationOutcome` (`Content-Type: application/fhir+json`) |
| Limits | Body up to 1,000,000 bytes, up to 200 entries; one check-up per Bundle |

Always use HTTPS in production.

## 4. The Bundle

**Rules**

- **`Bundle.type`:** `collection` is recommended. NutriSense does not check the type.
- **Exactly one `Patient`.** It needs an `identifier` with `system` = `https://nutrisense.id/fhir/link-code` and `value` = the mother's code.
  - The code can be written in different ways: `NS-7KQ2MP`, `ns-7kq2mp`, `NS 7KQ2MP` and `7KQ2MP` are all accepted.
  - No other patient data is needed. Please do not send her name, NIK or address.
- **Exactly one `Encounter`.** These fields matter:
  - **`id` (required):** your system's own id for this visit, 1–64 characters (letters, digits, `-`, `.`). This is the FHIR `id` format. It makes a resend update the check-up instead of adding a second one (see section 7).
  - **`period.start` (required):** the check-up date. Either a date (`2026-09-30`), or a date and time with your local offset (`2026-09-30T10:40:00+08:00`). See the date notes below.
  - **`extension` (recommended):** the K visit number, 1–6. Use `url` = `https://nutrisense.id/fhir/StructureDefinition/anc-visit-number` and `valueInteger`.
    - Without it, NutriSense picks the first open visit whose weeks fit the check-up: K1 for weeks 0–12, K2–K3 for 13–24, K4–K6 for 25–42.
  - **`participant[0].individual.display` (optional):** the midwife's or doctor's name, shown to the mother.
  - **`status`:** `finished`. A Bundle whose Encounter is `cancelled` or `entered-in-error` is refused (see section 11).
- **One `Observation` per measurement**, coded as in section 5.
  - If an Observation has `subject` or `encounter` references, they must point to the Patient and Encounter **in this Bundle**. Use their `fullUrl` (`urn:uuid:...`), or `Patient/<id>` / `Encounter/<id>`.
  - Observations with `status` `entered-in-error` or `cancelled` are skipped.
  - At least one of these is required: weight, blood pressure, LiLA, Hb, fundal height or fetal heart rate.

**Dates and time zones**

- A date without a time is used exactly as written. This is the simplest choice.
- A time with an offset (`+08:00` WITA, `+07:00` WIB, `+09:00` WIT) uses the date as written at your facility.
- A time in UTC (`Z` or `+00:00`) is converted to WITA (UTC+8), the time zone of NTT. For example, `2026-09-29T20:00:00Z` counts as 30 September.
- A date "in the future" is judged by the date in WIT (UTC+9). So a check-up at 07:00 in Kupang is never refused just because the server's UTC date is still the day before.
- The date must fall between the start of the pregnancy (HPHT) and 45 weeks after it.

**A full example** (the K3 visit at 24 weeks, with high blood pressure)

```json
{
  "resourceType": "Bundle",
  "type": "collection",
  "timestamp": "2026-09-30T03:15:00+00:00",
  "entry": [
    {
      "fullUrl": "urn:uuid:7d3c1a52-5f0e-4c47-9a35-1f6b8f4e0001",
      "resource": {
        "resourceType": "Patient",
        "identifier": [{ "system": "https://nutrisense.id/fhir/link-code", "value": "NS-7KQ2MP" }]
      }
    },
    {
      "fullUrl": "urn:uuid:7d3c1a52-5f0e-4c47-9a35-1f6b8f4e0002",
      "resource": {
        "resourceType": "Encounter",
        "id": "SIMPUS-BMT-2026-00412",
        "status": "finished",
        "class": { "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode", "code": "AMB", "display": "ambulatory" },
        "serviceType": { "text": "Pemeriksaan kehamilan (ANC)" },
        "subject": { "reference": "urn:uuid:7d3c1a52-5f0e-4c47-9a35-1f6b8f4e0001" },
        "period": { "start": "2026-09-30T10:40:00+08:00" },
        "extension": [{ "url": "https://nutrisense.id/fhir/StructureDefinition/anc-visit-number", "valueInteger": 3 }],
        "participant": [{ "individual": { "display": "Bidan Yohana Seran" } }]
      }
    },
    {
      "fullUrl": "urn:uuid:7d3c1a52-5f0e-4c47-9a35-1f6b8f4e0010",
      "resource": {
        "resourceType": "Observation",
        "status": "final",
        "category": [{ "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "vital-signs" }] }],
        "code": { "coding": [{ "system": "http://loinc.org", "code": "29463-7", "display": "Body weight" }] },
        "subject": { "reference": "urn:uuid:7d3c1a52-5f0e-4c47-9a35-1f6b8f4e0001" },
        "encounter": { "reference": "urn:uuid:7d3c1a52-5f0e-4c47-9a35-1f6b8f4e0002" },
        "effectiveDateTime": "2026-09-30",
        "valueQuantity": { "value": 58.0, "unit": "kg", "system": "http://unitsofmeasure.org", "code": "kg" }
      }
    },
    {
      "fullUrl": "urn:uuid:7d3c1a52-5f0e-4c47-9a35-1f6b8f4e0011",
      "resource": {
        "resourceType": "Observation",
        "status": "final",
        "category": [{ "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "vital-signs" }] }],
        "code": { "coding": [{ "system": "http://loinc.org", "code": "85354-9", "display": "Blood pressure panel" }] },
        "subject": { "reference": "urn:uuid:7d3c1a52-5f0e-4c47-9a35-1f6b8f4e0001" },
        "encounter": { "reference": "urn:uuid:7d3c1a52-5f0e-4c47-9a35-1f6b8f4e0002" },
        "effectiveDateTime": "2026-09-30",
        "component": [
          {
            "code": { "coding": [{ "system": "http://loinc.org", "code": "8480-6", "display": "Systolic blood pressure" }] },
            "valueQuantity": { "value": 150, "unit": "mmHg", "system": "http://unitsofmeasure.org", "code": "mm[Hg]" }
          },
          {
            "code": { "coding": [{ "system": "http://loinc.org", "code": "8462-4", "display": "Diastolic blood pressure" }] },
            "valueQuantity": { "value": 95, "unit": "mmHg", "system": "http://unitsofmeasure.org", "code": "mm[Hg]" }
          }
        ]
      }
    },
    {
      "fullUrl": "urn:uuid:7d3c1a52-5f0e-4c47-9a35-1f6b8f4e0012",
      "resource": {
        "resourceType": "Observation",
        "status": "final",
        "category": [{ "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "exam" }] }],
        "code": { "coding": [{ "system": "http://loinc.org", "code": "56072-2" }], "text": "Lingkar lengan atas (LiLA)" },
        "subject": { "reference": "urn:uuid:7d3c1a52-5f0e-4c47-9a35-1f6b8f4e0001" },
        "encounter": { "reference": "urn:uuid:7d3c1a52-5f0e-4c47-9a35-1f6b8f4e0002" },
        "effectiveDateTime": "2026-09-30",
        "valueQuantity": { "value": 23.0, "unit": "cm", "system": "http://unitsofmeasure.org", "code": "cm" }
      }
    },
    {
      "fullUrl": "urn:uuid:7d3c1a52-5f0e-4c47-9a35-1f6b8f4e0013",
      "resource": {
        "resourceType": "Observation",
        "status": "final",
        "category": [{ "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "laboratory" }] }],
        "code": { "coding": [{ "system": "http://loinc.org", "code": "718-7", "display": "Hemoglobin [Mass/volume] in Blood" }] },
        "subject": { "reference": "urn:uuid:7d3c1a52-5f0e-4c47-9a35-1f6b8f4e0001" },
        "encounter": { "reference": "urn:uuid:7d3c1a52-5f0e-4c47-9a35-1f6b8f4e0002" },
        "effectiveDateTime": "2026-09-30",
        "valueQuantity": { "value": 10.2, "unit": "g/dL", "system": "http://unitsofmeasure.org", "code": "g/dL" }
      }
    },
    {
      "fullUrl": "urn:uuid:7d3c1a52-5f0e-4c47-9a35-1f6b8f4e0014",
      "resource": {
        "resourceType": "Observation",
        "status": "final",
        "category": [{ "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "exam" }] }],
        "code": { "coding": [{ "system": "http://loinc.org", "code": "11881-0" }], "text": "Tinggi fundus uteri (TFU)" },
        "subject": { "reference": "urn:uuid:7d3c1a52-5f0e-4c47-9a35-1f6b8f4e0001" },
        "encounter": { "reference": "urn:uuid:7d3c1a52-5f0e-4c47-9a35-1f6b8f4e0002" },
        "effectiveDateTime": "2026-09-30",
        "valueQuantity": { "value": 24.0, "unit": "cm", "system": "http://unitsofmeasure.org", "code": "cm" }
      }
    },
    {
      "fullUrl": "urn:uuid:7d3c1a52-5f0e-4c47-9a35-1f6b8f4e0015",
      "resource": {
        "resourceType": "Observation",
        "status": "final",
        "category": [{ "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "exam" }] }],
        "code": { "coding": [{ "system": "http://loinc.org", "code": "55283-6" }], "text": "Denyut jantung janin (DJJ)" },
        "subject": { "reference": "urn:uuid:7d3c1a52-5f0e-4c47-9a35-1f6b8f4e0001" },
        "encounter": { "reference": "urn:uuid:7d3c1a52-5f0e-4c47-9a35-1f6b8f4e0002" },
        "effectiveDateTime": "2026-09-30",
        "valueQuantity": { "value": 140, "unit": "beats/minute", "system": "http://unitsofmeasure.org", "code": "/min" }
      }
    },
    {
      "fullUrl": "urn:uuid:7d3c1a52-5f0e-4c47-9a35-1f6b8f4e0016",
      "resource": {
        "resourceType": "Observation",
        "status": "final",
        "code": { "coding": [{ "system": "https://nutrisense.id/fhir/CodeSystem/anc", "code": "iron-tablets" }], "text": "Tablet tambah darah (TTD) diberikan" },
        "subject": { "reference": "urn:uuid:7d3c1a52-5f0e-4c47-9a35-1f6b8f4e0001" },
        "encounter": { "reference": "urn:uuid:7d3c1a52-5f0e-4c47-9a35-1f6b8f4e0002" },
        "effectiveDateTime": "2026-09-30",
        "valueQuantity": { "value": 30, "unit": "tablet", "system": "http://unitsofmeasure.org", "code": "{tablet}" }
      }
    }
  ]
}
```

**Blood pressure** can be sent in either of two ways:
- one Observation with two `component`s, coded `8480-6` (systolic) and `8462-4` (diastolic). The panel's own code can be `85354-9` or another panel code your system uses;
- two separate Observations, coded `8480-6` and `8462-4`.

## 5. Codes

NutriSense reads `code.coding[].system` + `code.coding[].code`. The `display` and `text` fields are for people and are not checked.

**Measurements (LOINC, `system` = `http://loinc.org`)**

| What (Indonesian) | LOINC | Value | Units accepted (`valueQuantity.code` or `unit`) | Code status |
|---|---|---|---|---|
| Weight (berat badan) | `29463-7` Body weight | `valueQuantity` | `kg`; also `g`, `[lb_av]` (converted to kg) | Confirmed (FHIR vital-signs profile) |
| Systolic BP (tekanan darah sistolik) | `8480-6` Systolic blood pressure | `valueQuantity` (alone or as a component) | `mm[Hg]`, `mmHg` | Confirmed (FHIR vital-signs profile) |
| Diastolic BP (diastolik) | `8462-4` Diastolic blood pressure | `valueQuantity` (alone or as a component) | `mm[Hg]`, `mmHg` | Confirmed (FHIR vital-signs profile) |
| BP panel | `85354-9` Blood pressure panel with all children optional | `component`s | n/a | Confirmed (FHIR vital-signs profile) |
| Haemoglobin (Hb) | `718-7` Hemoglobin [Mass/volume] in Blood | `valueQuantity` | `g/dL`; also `g/L` (converted). **`mmol/L` is refused**, see below | Confirmed |
| Mid-upper arm circumference (LiLA) | `56072-2` | `valueQuantity` | `cm`; also `mm` | **To verify**: the code, and whether SATUSEHAT uses it for LiLA |
| Fundal height (TFU) | `11881-0` Uterus Fundal height by Tape measure | `valueQuantity` | `cm`; also `mm` | **To verify** against the SATUSEHAT ANC profile |
| Fetal heart rate (DJJ) | `55283-6` Fetal heart rate | `valueQuantity` | `/min`; also `{beats}/min`, `beats/min`, `bpm` | **To verify** against the SATUSEHAT ANC profile |
| Gestational age (usia kehamilan) | `18185-9` Gestational age | `valueQuantity` | `wk`; also `d` (converted to weeks) | **To verify** against the SATUSEHAT ANC profile |
| Urine protein (protein urin) | `20454-5` Protein [Presence] in Urine by Test strip | `valueCodeableConcept` (`text` or `display`, e.g. `negatif`, `+1`) or `valueString` | n/a | **To verify** against the SATUSEHAT ANC profile |

- If a value has no unit, NutriSense assumes the unit shown first in the table.
- A unit that is not in the table is refused, so a wrong unit is never stored as if it were right.
- **Hb in `mmol/L` is refused.** Labs use two different conversion factors (Hb monomer or tetramer), and a wrong guess would hide or invent anaemia. Please send g/dL.
- Values outside a plausible range are refused as typing or unit errors. For example: weight 25–150 kg, systolic BP 60–260, diastolic 30–160, LiLA 12–50 cm, Hb 3–20 g/dL, TFU 5–50 cm, DJJ 60–240/min.

**NutriSense codes** (`system` = `https://nutrisense.id/fhir/CodeSystem/anc`), for items that have no LOINC code here yet:

| What | `code` | Value |
|---|---|---|
| Iron tablets given (TTD) | `iron-tablets` | `valueQuantity`, number of tablets (0–120) |
| Fetal presentation (letak janin) | `fetal-presentation` | `valueCodeableConcept` code `head`, `breech` or `transverse`. The words `kepala`, `sungsang` and `lintang` also work. Anything else is ignored. |
| Td / TT immunisation given | `td-immunization` | `valueCodeableConcept` code, e.g. `TT2` (up to 10 characters) |
| K visit number (alternative to the Encounter extension) | `visit-number` | `valueInteger` or `valueQuantity`, 1–6 |

**Other NutriSense URIs**

| Use | URI |
|---|---|
| Link code (`Patient.identifier.system`) | `https://nutrisense.id/fhir/link-code` |
| K visit number (`Encounter.extension.url`) | `https://nutrisense.id/fhir/StructureDefinition/anc-visit-number` |
| Result in the answer (`OperationOutcome.issue.details`) | `https://nutrisense.id/fhir/CodeSystem/sync-result` (`created`, `updated`) |

**To verify** before a production connection:
- that the project controls the `nutrisense.id` domain used in these URIs;
- whether LOINC or SNOMED CT codes can replace the NutriSense codes for fetal presentation;
- whether Td should be sent as a FHIR `Immunization` resource (SATUSEHAT records vaccines that way), and iron tablets as a `MedicationDispense`.

## 6. Responses and errors

Every answer is an `OperationOutcome`. `issue[0].diagnostics` explains what happened in plain English.

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{
    "severity": "information", "code": "informational",
    "diagnostics": "Check-up stored (K3, 2026-09-30)",
    "details": { "coding": [{ "system": "https://nutrisense.id/fhir/CodeSystem/sync-result", "code": "created" }],
                 "text": "Check-up stored (K3, 2026-09-30)" }
  }]
}
```

| HTTP | `issue.code` | Meaning | What to do |
|---|---|---|---|
| 201 | `informational` | Stored (a new check-up) | Nothing |
| 200 | `informational` | Updated (same Encounter id sent before) | Nothing |
| 400 | `structure` | The body is not valid JSON | Fix the message |
| 401 | `security` | Missing, wrong or disabled key | Check the key; ask the administrator |
| 403 | `forbidden` | The mother withdrew consent, or this code was replaced by a new one | Stop sending with this code. Ask her for her current code at the next visit |
| 404 | `not-found` | No pregnancy has this code | Check the code with the mother (typing error?) |
| 409 | `conflict` | Either the Encounter id was already used for another mother, or the pregnancy is closed in NutriSense, or the check-up is dated after the birth | Do not resend unchanged. Check the id and the code |
| 413 | `too-long` | Body over 1,000,000 bytes or over 200 entries | Send one check-up per Bundle |
| 422 | `invalid` | The Bundle was read but is not acceptable (see the list below) | Fix and send again |
| 503 | `transient` | The same check-up arrived twice at the same moment | Send again |

Typical 422 reasons:
- no Patient with a link code, or more than one Patient or Encounter;
- `Encounter.id` or `period.start` missing or badly formed;
- a date in the future, before the pregnancy, or more than 45 weeks after it;
- no measurement at all;
- a value that is not a number, outside its plausible range, or in an unsupported unit;
- an Observation that refers to another patient or encounter;
- a cancelled Encounter.

**Retry rule:** retry on network errors, on timeouts and on 5xx answers, with the **same** Bundle and a growing pause (for example 1 minute, 5 minutes, 30 minutes, then hourly). Do not retry a 4xx answer unchanged.

## 7. Sending again (idempotency) and corrections

- A check-up is identified by **your facility + `Encounter.id`**. Sending the same Encounter id again never creates a second check-up. This makes retries safe.
- **A resend replaces the check-up.** If the midwife corrects a value, send the whole check-up again with the same Encounter id. Any value left out is removed in NutriSense too.
- If you change the K visit number, the visit moves: the old K visit is unmarked, unless someone recorded it by hand.
- If a correction brings a new problem (for example a higher blood pressure), the Kader is alerted again. The mother is notified only the first time.
- Two facilities may use the same Encounter id: each facility's ids are separate.
- One Encounter id always belongs to one mother. Reusing it for another mother is refused (409).

## 8. Testing

**Demo server.** The demo data (`NUTRISENSE_SEED_DEMO_DATA=true`, the default for development) creates these facilities. Their keys are public: use them only for testing.

| Facility | Demo key |
|---|---|
| Puskesmas Baumata | `demo-puskesmas-baumata-key` |
| Puskesmas Oesapa | `demo-puskesmas-oesapa-key` |
| RSUD Prof. Dr. W. Z. Johannes Kupang | `demo-rsud-johannes-key` |
| Puskesmas Soe | `demo-puskesmas-soe-key` |

The demo mother Maria (`ibu.maria@nutrisense.id`, password `Demo1234!`) is linked with the code `NS-7KQ2MP`. Her K1 and K2 already came from Puskesmas Baumata.

**The simulator** (`backend/scripts/send_checkup.py`) uses only the Python standard library, so it runs anywhere with Python 3.9 or newer. It builds a Bundle like the one in section 4 and sends it:

```bash
cd backend
python scripts/send_checkup.py --visit 3 --bp 150/95 --hb 10.2 --lila 23.0 --weight 58 --tfu 24 --djj 140
python scripts/send_checkup.py --encounter-id SIMPUS-BMT-0001 --bp 118/76 --hb 11.4      # first send: HTTP 201
python scripts/send_checkup.py --encounter-id SIMPUS-BMT-0001 --bp 118/76 --hb 11.8      # same id: HTTP 200, updated
python scripts/send_checkup.py --url https://nutrisense.example.org --key "$FACILITY_KEY" --code NS-ABC234 --hb 11
```

| Option | Default | Meaning |
|---|---|---|
| `--url` | `http://localhost:8000` | NutriSense address |
| `--key` | `demo-puskesmas-baumata-key` | Facility API key |
| `--code` | `NS-7KQ2MP` | The mother's link code |
| `--visit` | none | K visit number, 1–6 |
| `--bp`, `--hb`, `--lila`, `--weight`, `--tfu`, `--djj` | none | BP (`120/80`), Hb g/dL, LiLA cm, weight kg, fundal height cm, fetal heart rate per minute. With none of these, it sends BP 118/76 and weight 55 kg |
| `--date` | today | Check-up date, `YYYY-MM-DD` |
| `--encounter-id` | a new random id | Reuse an id to test a resend |
| `--examiner` | `Bidan Simulasi` | Midwife's name |

The simulator prints the HTTP status and the OperationOutcome. Its exit code is 0 if the check-up was accepted, 1 if it was refused, and 2 if it could not connect. You can also use it as a starting point for your own code: `build_bundle()` makes the message and `send()` posts it.

**With curl:**

```bash
curl -X POST http://localhost:8000/api/integrations/fhir \
  -H "Authorization: Bearer demo-puskesmas-baumata-key" \
  -H "Content-Type: application/fhir+json" \
  --data @checkup.json
```

**Seeing the result.** Log in as Maria in the app and open *Kehamilan*: the check-up, the K visit and the risk level are updated. Log in as the Kader `kader.oesapa@nutrisense.id` to see the alert.

There is also an in-app demo portal for doctors and officers, `POST /api/facility-portal/checkup`. It builds the same Bundle and sends it through the same checks.

## 9. Security

**In place now**
- **HTTPS:** required in production. TLS is handled by the host in front of NutriSense.
- **Keys:** one key per facility, random 256-bit, shown once. NutriSense keeps only a SHA-256 hash, so a database leak does not reveal usable keys.
- **Disabling and rotating:** a disabled facility, or a rotated key, stops working at once.
- **Consent:** a code works only while the mother's consent is on. A withdrawn code is never reissued.
- **Write-only endpoint:** it returns no patient data. A wrong code gets only "not found" or "not allowed".
- **Safety checks:**
  - one mother per Bundle;
  - Observations must refer to that mother;
  - units are checked and values are range-checked;
  - the body is size-limited (1 MB), and malformed input gets a clear 4xx error, never a server error.
- **Logs:** every received check-up is written to the audit log (facility, your Encounter id, created or updated, flags). No key is ever logged, and no link code or personal data is logged.

**Recommended next steps**
- **Key rotation with overlap:** today, rotating a key cuts over at once. Agree a time with the facility, or add a second active key per facility.
- **Rotate keys yearly**, whenever staff with access leave, and at once if a leak is suspected.
- **IP allow-list** per facility (for example the SIMPUS server's fixed IP), set at the reverse proxy or in NutriSense.
- **Rate limiting** per key. This blocks guessing of link codes by a facility system that has been compromised.
- **Mutual TLS** for hospital EMRs that support it.
- **Demo data:** never run production with `NUTRISENSE_SEED_DEMO_DATA=true`. The demo keys above are public.

## 10. Connecting to SATUSEHAT later

SATUSEHAT is the Ministry of Health's national FHIR R4 platform. This interface was kept close to it so the step later is small:
- the same resources (Patient, Encounter, Observation);
- standard LOINC and UCUM codes;
- one Encounter per visit.

Two ways forward:

1. **Fork at the facility (simplest).** A SIMPUS that already sends ANC visits to SATUSEHAT also sends the same Encounter and Observations to NutriSense, with the link code added to the Patient. NutriSense ignores fields it does not use, so SATUSEHAT-style resources can be reused almost as they are.
2. **NutriSense reads from SATUSEHAT.** With the mother's consent, NutriSense would fetch her ANC Observations from SATUSEHAT, so no facility needs a direct connection. This needs:
   - NutriSense registered with Kemenkes as an application, with OAuth2 client credentials (to verify: the onboarding steps and whether a consumer app like this is allowed);
   - the mother's SATUSEHAT patient id (IHS number) in place of the link code;
   - codes mapped to the SATUSEHAT ANC profile. The rows marked "To verify" in section 5 are the ones to check.

## 11. Not supported yet

- **Removing a check-up sent in error.** An Encounter with status `cancelled` or `entered-in-error` is refused for now. To correct values, resend with the same Encounter id. To remove a whole check-up, contact the NutriSense administrator.
- **Postpartum (nifas, KF/KN) visits and births.**
- **Several check-ups in one Bundle.** Send one Bundle per visit.
- **Reading data back.** The endpoint is write-only.
