"""Check-ups sent by the Puskesmas/hospital system (FHIR) reach the mother's pregnancy page."""
import uuid
from datetime import date, timedelta

from app.services import facility_sync as FS

KEY = {"Authorization": "Bearer demo-puskesmas-oesapa-key"}


def _bundle(code, enc_id, on, **obs):
    """A minimal SIMPUS-style Bundle: Patient (link code), Encounter, Observations."""
    exam = {"external_id": enc_id, "exam_date": on, **obs}

    class F:  # build_bundle only reads the name
        name = "Puskesmas Baumata"

    return FS.build_bundle(code, exam, F)


def _maria(client, auth):
    h = auth("ibu.maria@nutrisense.id")
    p = client.get("/api/pregnancies", headers=h).json()[0]
    return h, p


_NEW: dict = {}


def _agustina(client, auth):
    """A new mother in Oesapa (registered by the Kader) and connected here, so no seeded mother changes."""
    if not _NEW:
        regions = {r["name"]: r["id"] for r in client.get("/api/regions").json()}
        phone = "0853" + uuid.uuid4().hex[:8].translate(str.maketrans("abcdef", "123456"))
        r = client.post("/api/kader/mothers", headers=auth("kader.oesapa@nutrisense.id"), json={
            "full_name": "Ibu Agustina Lay", "phone": phone, "region_id": regions["Oesapa"], "gestational_weeks": 12, "consent_given": True})
        assert r.status_code == 201, r.text
        tok = client.post("/api/auth/login", json={"phone": phone, "password": r.json()["temp_password"]}).json()["access_token"]
        _NEW["h"] = {"Authorization": f"Bearer {tok}"}
    h = _NEW["h"]
    p = client.get("/api/pregnancies", headers=h).json()[0]
    link = client.get(f"/api/pregnancies/{p['id']}/link", headers=h).json()
    if not link["enabled"]:
        link = client.post(f"/api/pregnancies/{p['id']}/link", json={"enabled": True}, headers=h).json()
    return h, p, link["code"]


def test_seeded_link_and_checkups(client, auth):
    h, p = _maria(client, auth)
    link = client.get(f"/api/pregnancies/{p['id']}/link", headers=h).json()
    assert link["enabled"] and link["code"] == "NS-7KQ2MP" and link["facility"] == "Puskesmas Baumata"
    assert [e["visit_number"] for e in link["exams"]] == [2, 1]
    assert p["facility_link"]["enabled"] and p["latest_exam"]["bp_systolic"] == 118
    # The Kader sees the results but never the mother's code.
    k = client.get(f"/api/pregnancies/{p['id']}/link", headers=auth("kader.oesapa@nutrisense.id")).json()
    assert k["code"] is None and len(k["exams"]) == 2


def test_fhir_checkup_syncs_once_and_flags_high_blood_pressure(client, auth):
    h, p, code = _agustina(client, auth)
    on = date.today() - timedelta(days=1)
    b = _bundle(code, "SIMPUS-OSP-T1", on, visit_number=1, examiner="Bidan Yohana", weight_kg=56.0,
                bp_systolic=150, bp_diastolic=95, muac_cm=23.0, hb_g_dl=10.9, fundal_height_cm=22.0, fetal_heart_rate=140,
                fetal_presentation="head", td_immunization="TT3", iron_tablets=30, urine_protein="+1")
    r = client.post("/api/integrations/fhir", json=b, headers=KEY)
    assert r.status_code == 201, r.text
    assert r.json()["resourceType"] == "OperationOutcome" and r.json()["created"]
    # Sent again (a retry): updated, not duplicated.
    r2 = client.post("/api/integrations/fhir", json=b, headers=KEY)
    assert r2.status_code == 200 and not r2.json()["created"]

    p = client.get(f"/api/pregnancies/{p['id']}", headers=h).json()
    assert p["anc"][0]["status"] == "done" and p["anc"][0]["place"] == "Puskesmas Oesapa"
    assert p["latest_exam"]["bp_systolic"] == 150 and p["latest_exam"]["fetal_presentation"] == "head"
    assert p["risk"]["key"] == "urgent" and "Tekanan darah tinggi" in p["risk"]["reasons"]
    assert p["latest"]["muac_cm"] == 23.0  # facility LiLA joins the mother's checks
    link = client.get(f"/api/pregnancies/{p['id']}/link", headers=h).json()
    assert sum(1 for e in link["exams"] if e["visit_number"] == 1) == 1
    notes = client.get("/api/notifications", headers=h).json()
    assert any(n["kind"] == "anc_result" for n in notes)
    kader_notes = client.get("/api/notifications", headers=auth("kader.oesapa@nutrisense.id")).json()
    assert any(n["kind"] == "mother_danger" and "tekanan darah tinggi" in n["body"] for n in kader_notes)


def test_fhir_rejections(client, auth):
    _, _, code = _agustina(client, auth)
    on = date.today()
    good = _bundle(code, "X-1", on, bp_systolic=110, bp_diastolic=70)
    assert client.post("/api/integrations/fhir", json=good, headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.post("/api/integrations/fhir", json=good).status_code == 401
    assert client.post("/api/integrations/fhir", json=_bundle("NS-ZZZZZZ", "X-2", on, bp_systolic=110), headers=KEY).status_code == 404
    assert client.post("/api/integrations/fhir", json={"resourceType": "Patient"}, headers=KEY).status_code == 422
    assert client.post("/api/integrations/fhir", json=_bundle(code, "X-3", on), headers=KEY).status_code == 422  # nothing measured
    bad = _bundle(code, "X-4", on, hb_g_dl=110.0)  # a unit/typing error at the source
    assert client.post("/api/integrations/fhir", json=bad, headers=KEY).status_code == 422


def test_consent_controls_the_link(client, auth):
    h = auth("ibu.yuliana@nutrisense.id")
    p = client.get("/api/pregnancies", headers=h).json()[0]
    assert not client.get(f"/api/pregnancies/{p['id']}/link", headers=h).json()["enabled"]
    # Only the mother may connect her pregnancy.
    assert client.post(f"/api/pregnancies/{p['id']}/link", json={"enabled": True}, headers=auth("kader.soe@nutrisense.id")).status_code == 403
    on = client.post(f"/api/pregnancies/{p['id']}/link", json={"enabled": True}, headers=h).json()
    code = on["code"]
    assert on["enabled"] and code.startswith("NS-") and len(code) == 9
    soe = {"Authorization": "Bearer demo-puskesmas-soe-key"}
    assert client.post("/api/integrations/fhir", json=_bundle(code, "SOE-1", date.today(), hb_g_dl=11.6), headers=soe).status_code == 201
    # Consent withdrawn: further results are refused; turning it on again gives a new code.
    client.post(f"/api/pregnancies/{p['id']}/link", json={"enabled": False}, headers=h)
    assert client.post("/api/integrations/fhir", json=_bundle(code, "SOE-2", date.today(), hb_g_dl=11.6), headers=soe).status_code == 403
    again = client.post(f"/api/pregnancies/{p['id']}/link", json={"enabled": True}, headers=h).json()
    assert again["code"] != code


def test_demo_portal_uses_the_fhir_path(client, auth):
    _, _, code = _agustina(client, auth)
    doc = auth("doctor@nutrisense.id")
    facs = client.get("/api/facilities", headers=doc).json()
    pkm = next(f for f in facs if f["name"] == "Puskesmas Oesapa")
    r = client.post("/api/facility-portal/checkup", headers=doc, json={
        "facility_id": pkm["id"], "link_code": code.removeprefix("NS-").lower(), "visit_number": 2, "bp_systolic": 112, "bp_diastolic": 72,
        "fetal_heart_rate": 100, "examiner": "dr. Benu"})
    assert r.status_code == 201, r.text
    assert r.json()["mother_name"] == "Ibu Agustina Lay" and r.json()["exam"]["visit_number"] == 2
    assert "Detak jantung janin perlu dicek" in r.json()["risk"]["reasons"]
    # Mothers and Kader cannot use the facility portal.
    assert client.post("/api/facility-portal/checkup", headers=auth("kader.oesapa@nutrisense.id"),
                       json={"facility_id": pkm["id"], "link_code": code, "bp_systolic": 110}).status_code == 403
