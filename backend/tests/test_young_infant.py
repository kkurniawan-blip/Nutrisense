"""Danger signs for babies under 2 months (arena 2026-10-09, winner 2).

WHO IMCI chart booklet 2014 (sick young infant up to 2 months) and Buku KIA 2020 (tanda bahaya bayi baru lahir).
The child's age comes from the record; rules for children aged 2-59 months must not change.
"""
from datetime import date, timedelta
import uuid

import pytest

from app.ai import assistant as A
from app.ai import llm, symptoms

# The 2-59 month danger set as it was before this change (WHO IMCI 2014 general danger signs + same-day signs).
OLD_DANGER = {"unable_to_drink", "vomits_everything", "convulsions", "lethargy", "fast_breathing", "bloody_stool", "oedema"}
YOUNG_EXTRA = {"fever", "high_fever", "poor_appetite", "jaundice", "cord_infection", "hypothermia", "grunting"}


# --- New keys: Indonesian lexicon, "-nya" forms, negation, look-alikes ---------------------------------------------
@pytest.mark.parametrize("text,key", [
    ("badannya kuning", "jaundice"), ("kuning sampai telapak kaki", "jaundice"), ("matanya kuning", "jaundice"),
    ("kulit bayi saya kuning", "jaundice"), ("bayinya kuning", "jaundice"), ("the baby's skin is yellow", "jaundice"),
    ("tali pusat merah", "cord_infection"), ("tali pusatnya bernanah", "cord_infection"), ("tali pusat bau", "cord_infection"),
    ("pusarnya merah dan bengkak", "cord_infection"), ("umbilical cord is red", "cord_infection"),
    ("badan dingin", "hypothermia"), ("badannya dingin", "hypothermia"), ("badannya dingin sekali", "hypothermia"),
    ("bayi saya dingin sekali", "hypothermia"), ("suhu 35 derajat", "hypothermia"), ("baby feels cold", "hypothermia"),
    ("merintih", "grunting"), ("napasnya merintih terus", "grunting"), ("bayi merintih", "grunting"),
    ("isapannya lemah", "poor_appetite"), ("malas menyusu", "poor_appetite"),
    ("suhu badannya 37,8", "fever"),
])
def test_new_keys_are_recognised(text, key):
    assert key in symptoms.interpret_rules(text)["symptoms"]


@pytest.mark.parametrize("text,key", [
    ("tidak kuning", "jaundice"), ("badannya tidak kuning", "jaundice"), ("kulitnya gak kuning", "jaundice"),
    ("BAB-nya kuning", "jaundice"), ("pupnya kuning", "jaundice"),  # yellow stool is normal for a breastfed baby
    ("bayi saya kuning langsat", "jaundice"), ("kulit kuning langsat", "jaundice"), ("ingusnya kuning", "jaundice"),
    ("pisang kuning", "jaundice"), ("labu kuning untuk MPASI", "jaundice"),
    ("tali pusatnya tidak merah", "cord_infection"), ("tali pusat sudah lepas, kering", "cord_infection"),
    ("badannya tidak dingin", "hypothermia"), ("badannya panas dingin", "hypothermia"), ("keringat dingin di badan", "hypothermia"),
    ("minum air dingin", "hypothermia"), ("cuaca dingin sekali", "hypothermia"), ("suhu ruangan 30", "hypothermia"),
    ("tidak merintih", "grunting"), ("makan tempe 25 gram", "hypothermia"),
])
def test_new_keys_negation_and_look_alikes(text, key):
    assert key not in symptoms.interpret_rules(text)["symptoms"]


# --- Age-aware danger set --------------------------------------------------------------------------------------------
@pytest.mark.parametrize("age_days", [0, 14, 59])
def test_young_infant_danger_set(age_days):
    assert set(symptoms.danger_signs_for(symptoms.SYMPTOM_KEYS, age_days)) == OLD_DANGER | YOUNG_EXTRA
    for key in YOUNG_EXTRA:
        assert symptoms.interpret("", [key], age_days=age_days)["danger_signs"] == [key]


@pytest.mark.parametrize("age_days", [60, 61, 365, 59 * 30, None, -3])
def test_rules_for_2_to_59_months_do_not_change(age_days):
    # Same danger set as before for every key, including the new ones (unknown or impossible age: the 2-59 month set).
    assert set(symptoms.danger_signs_for(symptoms.SYMPTOM_KEYS, age_days)) == OLD_DANGER
    assert symptoms.DANGER_SIGNS == OLD_DANGER
    for key in YOUNG_EXTRA:
        assert symptoms.interpret("", [key], age_days=age_days)["danger_signs"] == []
    r = symptoms.interpret("demam 3 hari, tidak mau makan, badannya kuning", age_days=age_days)
    assert {"fever", "poor_appetite", "jaundice"} <= set(r["symptoms"]) and r["danger_signs"] == []
    assert symptoms.interpret("anak kejang", age_days=age_days)["danger_signs"] == ["convulsions"]


def test_free_text_fever_in_a_two_week_old():
    r = symptoms.interpret("bayi 2 minggu panas 38 derajat", age_days=14)
    assert "fever" in r["danger_signs"] and r["duration_days"] is None
    # The same words for a 3-month-old: fever is a symptom, not a danger sign.
    assert symptoms.interpret("bayi 2 minggu panas 38 derajat", age_days=90)["danger_signs"] == []


def test_claude_merge_path_is_age_aware(monkeypatch):
    seen = {}

    def fake(system, user, schema, **k):
        seen["user"] = user
        return {"symptoms": ["jaundice"], "duration_days": 14, "appetite": None, "summary": "Bayi kuning.", "other_concerns": []}
    monkeypatch.setattr(llm, "complete_json", fake)
    r = symptoms.interpret("bayi 2 minggu, panas", lang="id", age_days=14)
    assert r["interpreted_by"] == "claude+rules"
    assert {"fever", "jaundice"} <= set(r["danger_signs"])
    assert "14 days" in seen["user"]
    assert r["duration_days"] == 14  # the rules found no duration, so Claude's is used (its prompt says: never the age)
    monkeypatch.setattr(llm, "complete_json", lambda *a, **k: {
        "symptoms": ["jaundice"], "duration_days": None, "appetite": None, "summary": "", "other_concerns": []})
    assert symptoms.interpret("bayi kuning", age_days=200)["danger_signs"] == []


# --- Age is not illness duration -------------------------------------------------------------------------------------
@pytest.mark.parametrize("text,days", [
    ("bayi 2 minggu panas 38 derajat", None), ("bayi saya umur 10 hari, demam", None), ("usianya baru 3 minggu", None),
    ("berumur 5 hari dan kuning", None), ("my 2 week old baby has a fever", None), ("bayi seminggu panas", None),
    ("bayi 2 minggu, demam 3 hari", 3), ("usia bayi 3 minggu, batuk seminggu", 7), ("bayi demam 3 hari", 3),
    ("demam sejak 2 hari lalu", 2), ("mencret sejak kemarin", 1),
])
def test_age_is_not_read_as_duration(text, days):
    assert symptoms.interpret_rules(text)["duration_days"] == days


@pytest.mark.parametrize("text,age", [
    ("bayi 2 minggu panas", 14), ("umur 1 bulan", 30), ("bayi 2 bulan", 60), ("baru lahir, kuning", 0), ("bayi demam 3 hari", None),
])
def test_stated_age(text, age):
    assert symptoms.stated_age_days(text) == age


# --- Nuri agrees with the symptom checker ----------------------------------------------------------------------------
@pytest.mark.parametrize("text,code", [
    ("bayi saya badannya dingin", "newborn:hypothermia"), ("bayinya badannya dingin sekali", "newborn:hypothermia"),
    ("Kulit bayi saya kuning", "newborn:jaundice"), ("bayi kuning sampai telapak kaki", "newborn:jaundice"),
    ("Tali pusat bayi merah dan bernanah", "newborn:cord_infection"), ("Bayi merintih terus", "newborn:grunting"),
    ("bayi 2 minggu panas 38 derajat", "newborn:fever"), ("bayi umur 1 bulan malas menyusu", "newborn:poor_appetite"),
])
def test_nuri_young_infant_danger(text, code):
    assert code in A.danger_signs(text)
    answer = A.faq(text, "id")
    assert A.is_urgent(answer) and "kulit ke kulit" in answer


@pytest.mark.parametrize("text", ["bayi 3 bulan demam", "bayi saya kuning langsat", "bayi tidak kuning", "anak 2 tahun panas 38 derajat"])
def test_nuri_no_young_infant_alarm_without_cause(text):
    assert not A.danger_signs(text)


def test_nuri_answers_cold_body_and_jaundice_without_a_baby_word():
    assert A.faq_topic("badannya dingin") == "cold_body" and "dekap kulit ke kulit" in A.faq("badannya dingin", "id")
    assert A.faq_topic("badannya panas dingin") == "fever"
    assert A.faq_topic("anak saya matanya kuning") == "jaundice"


# --- End to end: a young-infant danger sign raises the same emergency, case and Kader alert -------------------------
def _register(client, email, **consents):
    body = {"email": email, "password": "Secret123!", "full_name": "Ibu Test", "region_id": 3, "language": "id",
            "consent_data_processing": True, **consents}
    r = client.post("/api/auth/register", json=body)
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _child(client, h, age_days):
    birth = date.today() - timedelta(days=age_days)
    r = client.post("/api/children", headers=h, json={"name": f"Bayi {uuid.uuid4().hex[:5]}", "sex": "female",
                                                      "birth_date": birth.isoformat()})
    assert r.status_code == 201, r.text
    return r.json()["id"]


@pytest.mark.parametrize("ai_consent", [True, False])
def test_young_infant_fever_is_an_emergency_end_to_end(client, auth, ai_consent):
    h = _register(client, f"neonate-{uuid.uuid4().hex[:6]}@test.id", consent_ai_analysis=ai_consent)
    cid = _child(client, h, 20)  # 20 days old, no measurement yet
    r = client.post(f"/api/children/{cid}/symptoms", headers=h, json={"description": "", "symptoms": ["fever"]})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["report"]["danger_signs"] == ["fever"]
    a = body["assessment"]
    assert a is not None and a["triage"]["urgency"] == "emergency" and a["guardrail"] == "danger_signs_present"
    assert a["risk_level"] == "high" and a["triage"]["actions"][0]["code"] == "go_facility_now"
    assert a["reasons"][0]["text"].startswith("Ada tanda bahaya: demam")

    kader = auth("kader.oesapa@nutrisense.id")
    case = next(c for c in client.get("/api/cases", headers=kader).json() if c["child_id"] == cid)
    assert case["priority"] == "emergency" and case["urgency"] == "emergency"
    alert = next(n for n in client.get("/api/notifications", headers=kader).json() if (n["data"] or {}).get("case_id") == case["id"])
    assert alert["kind"] == "case_escalated" and alert["title"].startswith("DARURAT") and alert["data"]["priority"] == "emergency"
    assert "demam" in alert["body"]


def test_young_infant_free_text_and_new_keys_end_to_end(client, auth):
    h = _register(client, f"neonate-{uuid.uuid4().hex[:6]}@test.id", consent_ai_analysis=False)
    cid = _child(client, h, 14)
    r = client.post(f"/api/children/{cid}/symptoms", headers=h, json={"description": "bayi 2 minggu panas 38 derajat, badannya kuning"})
    rep = r.json()["report"]
    assert {"fever", "jaundice"} <= set(rep["danger_signs"]) and rep["duration_days"] is None
    assert r.json()["assessment"]["triage"]["urgency"] == "emergency"
    for key in ("cord_infection", "hypothermia", "grunting", "poor_appetite"):
        r = client.post(f"/api/children/{cid}/symptoms", headers=h, json={"symptoms": [key]})
        assert r.json()["report"]["danger_signs"] == [key] and r.json()["assessment"]["triage"]["urgency"] == "emergency"


def test_older_baby_fever_is_not_an_emergency(client):
    h = _register(client, f"older-{uuid.uuid4().hex[:6]}@test.id")
    cid = _child(client, h, 90)
    r = client.post(f"/api/children/{cid}/symptoms", headers=h, json={"symptoms": ["fever", "jaundice"]})
    assert r.status_code == 201
    assert r.json()["report"]["danger_signs"] == [] and r.json()["assessment"] is None  # no measurement, no danger sign


def test_catalog_lists_the_young_infant_set(client):
    cat = client.get("/api/symptoms/catalog").json()
    assert cat["young_infant_days"] == 60
    assert set(cat["young_infant_danger_signs"]) == OLD_DANGER | YOUNG_EXTRA
    assert set(cat["danger_signs"]) == OLD_DANGER
    assert YOUNG_EXTRA - {"fever", "high_fever", "poor_appetite"} <= set(cat["symptoms"])
