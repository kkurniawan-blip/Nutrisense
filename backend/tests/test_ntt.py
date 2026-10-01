"""NTT field needs: phone login, Kader-registered mothers, Buku KIA schedule, ASI eksklusif, 2T, oedema, emergency contacts,
the mother's risk level, birth details, and the officer's maternal indicators."""
import uuid
from datetime import date, timedelta

from app.ai import kia
from app.ai import maternal as M


def _phone():
    return "0852" + uuid.uuid4().hex[:8].translate(str.maketrans("abcdef", "123456"))


def test_phone_login_and_phone_only_signup(client):
    # Seeded mothers can log in with their phone number in any common format.
    for ident in ("081300000001", "+62 813-0000-0001", "6281300000001"):
        r = client.post("/api/auth/login", json={"email": ident, "password": "Demo1234!"})
        assert r.status_code == 200, (ident, r.text)
        assert r.json()["user"]["email"] == "ibu.maria@nutrisense.id"
    phone = _phone()
    r = client.post("/api/auth/register", json={"phone": phone, "password": "Anakku2026!", "full_name": "Ibu Tanpa Email",
                                                "consent_data_processing": True})
    assert r.status_code == 201, r.text
    assert r.json()["user"]["email"] is None
    assert client.post("/api/auth/login", json={"phone": phone, "password": "Anakku2026!"}).status_code == 200
    dup = client.post("/api/auth/register", json={"phone": phone, "password": "Anakku2026!", "full_name": "Ibu X", "consent_data_processing": True})
    assert dup.status_code == 409
    none = client.post("/api/auth/register", json={"password": "Anakku2026!", "full_name": "Ibu X", "consent_data_processing": True})
    assert none.status_code == 400


def test_kader_registers_a_mother_who_then_logs_in_by_phone(client, auth):
    kader = auth("kader.oesapa@nutrisense.id")
    regions = {r["name"]: r["id"] for r in client.get("/api/regions").json()}
    phone = _phone()
    body = {"full_name": "Ibu Rosa Ndun", "phone": phone, "region_id": regions["Baumata"], "gestational_weeks": 14,
            "mother_height_cm": 147, "education": "sd", "gravida": 2, "consent_given": True}
    assert client.post("/api/kader/mothers", headers=kader, json={**body, "consent_given": False}).status_code == 400
    r = client.post("/api/kader/mothers", headers=kader, json=body)
    assert r.status_code == 201, r.text
    out = r.json()
    assert len(out["temp_password"]) == 8 and out["pregnancy"]["gestational_weeks"] == 14
    # Outside the Kader's area is refused.
    far = client.post("/api/kader/mothers", headers=kader, json={**body, "phone": _phone(), "region_id": regions["Baa"]})
    assert far.status_code == 403
    # The Kader sees her in the list; she logs in with her phone and the temporary password.
    assert any(p["mother_name"] == "Ibu Rosa Ndun" for p in client.get("/api/pregnancies", headers=kader).json())
    login = client.post("/api/auth/login", json={"email": phone, "password": out["temp_password"]})
    assert login.status_code == 200
    h = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert client.get("/api/pregnancies", headers=h).json()[0]["mother_name"] == "Ibu Rosa Ndun"
    # A second active pregnancy for the same phone is refused.
    assert client.post("/api/kader/mothers", headers=kader, json=body).status_code == 409


def test_mother_risk_levels():
    kek, anemia = {"code": "kek", "status": "action"}, {"code": "anemia", "status": "action"}
    assert M.mother_risk([], False, 0, False, "id")["label"] == "Belum dicek"
    assert M.mother_risk([], True, 0, False, "id")["key"] == "ok"
    assert M.mother_risk([kek], True, 0, False, "id")["key"] == "action"
    high = M.mother_risk([kek, anemia], True, 0, False, "id")
    assert high["label"] == "Risiko tinggi" and high["contact"] and high["reasons"] == ["Lengan kecil (KEK)", "Kurang darah (anemia)"]
    # Missed K visits lower the status, even before any check.
    assert M.mother_risk([], False, 1, False, "id")["key"] == "monitor"
    assert M.mother_risk([], True, 2, False, "id")["key"] == "action"
    assert M.mother_risk([], True, 0, True, "id")["key"] == "urgent"


def test_seeded_mother_is_high_risk_with_facility(client, auth):
    h = auth("ibu.maria@nutrisense.id")
    p = client.get("/api/pregnancies", headers=h).json()[0]
    assert p["risk"]["key"] == "urgent" and p["risk"]["label"] == "Risiko tinggi" and p["risk"]["contact"]
    assert p["latest"] == {"muac_cm": 22.8, "hb_g_dl": 10.4}
    assert p["facility"]["name"] == "Puskesmas Baumata" and p["facility"]["phone"] and p["facility"]["ambulance"] == "119"
    assert p["facility"]["distance_km"] > 0
    agustina = client.get("/api/pregnancies", headers=auth("ibu.agustina@nutrisense.id")).json()[0]
    assert agustina["risk"]["label"] == "Belum dicek"


def test_danger_report_returns_puskesmas_and_119(client, auth):
    h = auth("ibu.yuliana@nutrisense.id")
    pid = client.get("/api/pregnancies", headers=h).json()[0]["id"]
    r = client.post(f"/api/pregnancies/{pid}/danger", headers=h, json={"signs": ["bleeding"]}).json()
    assert r["danger"] and r["facility"]["phone"] and r["facility"]["ambulance"] == "119" and r["kader"]["phone"]
    # A danger sign in the last days makes the pregnancy high risk.
    assert client.get(f"/api/pregnancies/{pid}", headers=h).json()["risk"]["key"] == "urgent"


def test_birth_plan_extras_and_birth_details(client):
    phone = _phone()
    r = client.post("/api/auth/register", json={"phone": phone, "password": "Anakku2026!", "full_name": "Ibu Lahir",
                                                "consent_data_processing": True}).json()
    h = {"Authorization": f"Bearer {r['access_token']}"}
    p = client.post("/api/pregnancies", headers=h, json={"gestational_weeks": 35}).json()
    plan = {"place": "puskesmas", "helper": "bidan", "blood_donor": "Kakak (gol. O)", "funding": "jkn", "junk": "x"}
    saved = client.patch(f"/api/pregnancies/{p['id']}", headers=h, json={"birth_plan": plan}).json()["birth_plan"]
    assert saved == {"place": "puskesmas", "helper": "bidan", "blood_donor": "Kakak (gol. O)", "funding": "jkn"}
    out = client.post(f"/api/pregnancies/{p['id']}/birth", headers=h, json={
        "name": "Bayi Cepat", "sex": "male", "birth_weight_kg": 2.3, "birth_length_cm": 45, "birth_place": "puskesmas",
        "birth_attendant": "bidan"}).json()
    assert out["premature"] is True and out["gestational_weeks"] == 35 and out["low_birth_weight"] is True
    assert out["pregnancy"]["birth_info"] == {"place": "puskesmas", "attendant": "bidan", "gestational_weeks": 35}
    assert out["child"]["birth_gestational_weeks"] == 35


def test_kia_schedule_rules():
    birth = date.today() - timedelta(days=int(10 * 30.44))
    s = kia.schedule(birth, {"imm_0": birth, "imm_1": birth})
    status = {r["key"]: r["status"] for r in s["immunization"]}
    assert status["imm_0"] == "done" and status["imm_2"] == "overdue" and status["imm_9"] == "due" and status["imm_12"] == "upcoming"
    assert s["vitamin_a"][0]["key"] == "vita_6" and s["vitamin_a"][0]["status"] == "due"
    assert all(r["status"] == "upcoming" for r in s["deworming"])
    assert kia.immunization_complete(birth, {}) is None
    assert kia.immunization_complete(birth, {"imm_0": birth}) == 0.0


def test_two_t_uses_minimum_weight_gain():
    d0 = date(2026, 1, 1)
    pts = [(d0, 10.0, 8.0), (d0 + timedelta(days=30), 11.0, 8.4), (d0 + timedelta(days=60), 12.0, 8.45),
           (d0 + timedelta(days=91), 13.0, 8.5)]
    res = [w["result"] for w in kia.weighings(pts)]
    assert res == ["N", "T", "T"] and kia.not_gaining(pts) == 2
    # Weighings far apart are not judged.
    assert kia.weighings([(d0, 10, 8), (d0 + timedelta(days=120), 14, 8)])[0]["result"] == "O"


def test_child_kia_asi_and_local_services(client, auth):
    h = auth("ibu.sarah@nutrisense.id")
    kids = {c["name"]: c for c in client.get("/api/children", headers=h).json()}
    baby = kids["Kristo Pello"]
    assert baby["age_months"] < 6
    s = client.get(f"/api/children/{baby['id']}/kia", headers=h).json()
    assert s["next"]["key"] == "imm_3" and s["source"].startswith("Buku KIA")
    s = client.post(f"/api/children/{baby['id']}/kia", headers=h, json={"item_key": "imm_3"}).json()
    assert {r["key"]: r["status"] for r in s["immunization"]}["imm_3"] == "done"
    assert client.post(f"/api/children/{baby['id']}/kia", headers=h, json={"item_key": "nope"}).status_code == 400
    # ASI: the checklist asks for ASI, not meals, before 6 months.
    items = {i["key"] for i in client.get(f"/api/children/{baby['id']}/today", headers=h).json()["items"]}
    assert "asi" in items and "meals" not in items
    a = client.get(f"/api/children/{baby['id']}/asi", headers=h).json()
    assert a["in_window"] and a["streak"] >= 7 and len(a["week"]) == 7
    a = client.post(f"/api/children/{baby['id']}/asi", headers=h, json={"asi_only": False, "other": ["water"]}).json()
    assert a["broken"] and a["today"]["other"] == ["water"] and a["streak"] == 0
    assert client.get(f"/api/children/{baby['id']}", headers=h).json()["exclusive_breastfeeding"] is False
    # Local services for the family's village.
    loc = client.get("/api/local", headers=h).json()
    assert loc["facility"]["ambulance"] == "119" and loc["posyandu"]["days"] >= 0
    detail = client.get(f"/api/children/{baby['id']}", headers=h).json()
    assert detail["posyandu"]["date"] and detail["facility"]["phone"]


def test_two_t_badge_and_oedema(client, auth):
    h = auth("ibu.maria@nutrisense.id")
    kids = {c["name"]: c for c in client.get("/api/children", headers=h).json()}
    assert kids["Budi Fanggidae"]["weight_gain"]["two_t"] is True
    assert kids["Adel Fanggidae"]["weight_gain"]["two_t"] is False
    items = {i["key"] for i in client.get(f"/api/children/{kids['Budi Fanggidae']['id']}/today", headers=h).json()["items"]}
    assert "two_t" in items
    # Measured by the mother, with oedema: urgent referral like a danger sign.
    adel = kids["Adel Fanggidae"]
    last = adel["latest_measurement"]
    r = client.post(f"/api/children/{adel['id']}/measurements", headers=h, json={
        "weight_kg": last["weight_kg"] + 0.3, "height_cm": last["height_cm"] + 0.5, "position": "lying", "measured_by": "mother",
        "oedema": True}).json()
    assert r["measurement"]["measured_by"] == "mother" and r["measurement"]["oedema"] is True
    assert r["assessment"]["triage"]["urgency"] == "emergency" and r["assessment"]["risk_level"] == "high"
    assert any(x["code"] == "oedema" for x in r["assessment"]["reasons"])
    officer = auth("officer@nutrisense.id")
    flagged = client.get("/api/dashboard/flagged", headers=officer).json()
    row = next(x for x in flagged["rows"] if x["kind"] == "child" and x["id"] == adel["id"])
    assert "oedema" in row["flags"] and row["urgent"] and row["measured_by"] == "mother"
    assert flagged["source"]["year"]


def test_officer_maternal_indicators(client, auth):
    m = client.get("/api/dashboard/mothers", headers=auth("officer@nutrisense.id")).json()
    assert m["active"] >= 9 and m["kek"]["of"] >= 7 and 0 < m["kek"]["pct"] < 100
    assert m["anemia"]["reference"]["year"] == 2018 and m["k6"]["of"] >= 6 and m["k6"]["pct"] is not None
    assert m["source"]["year"] == date.today().year
    assert any(r["kind"] == "mother" and "kek" in r["flags"] for r in client.get("/api/dashboard/flagged", headers=auth("officer@nutrisense.id")).json()["rows"])
