"""Check-ups sent by the Puskesmas/hospital system (FHIR) reach the mother's pregnancy page."""
import copy
import importlib.util
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.database import SessionLocal
from app.models import AncExam, FacilityLinkCode, Pregnancy
from app.services import facility_sync as FS

KEY = {"Authorization": "Bearer demo-puskesmas-oesapa-key"}
FHIR = "/api/integrations/fhir"


class _Facility:  # build_bundle only reads the name
    name = "Puskesmas Oesapa"


def _bundle(code, enc_id, on, **obs):
    """A SIMPUS-style Bundle: Patient (link code), Encounter, Observations."""
    return FS.build_bundle(code, {"external_id": enc_id, "exam_date": on, **obs}, _Facility)


def _post(client, bundle, headers=KEY):
    return client.post(FHIR, json=bundle, headers=headers)


def _maria(client, auth):
    h = auth("ibu.maria@nutrisense.id")
    p = client.get("/api/pregnancies", headers=h).json()[0]
    return h, p


def _mother(client, auth, weeks=12):
    """A new mother in Oesapa, registered by the Kader, so no seeded mother changes."""
    regions = {r["name"]: r["id"] for r in client.get("/api/regions").json()}
    phone = "0853" + uuid.uuid4().hex[:8].translate(str.maketrans("abcdef", "123456"))
    r = client.post("/api/kader/mothers", headers=auth("kader.oesapa@nutrisense.id"), json={
        "full_name": "Ibu Agustina Lay", "phone": phone, "region_id": regions["Oesapa"], "gestational_weeks": weeks, "consent_given": True})
    assert r.status_code == 201, r.text
    tok = client.post("/api/auth/login", json={"phone": phone, "password": r.json()["temp_password"]}).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    return h, client.get("/api/pregnancies", headers=h).json()[0]


def _linked(client, auth, weeks=12):
    h, p = _mother(client, auth, weeks)
    link = client.post(f"/api/pregnancies/{p['id']}/link", json={"enabled": True}, headers=h).json()
    return h, p, link["code"]


def _obs(code, value, unit, system=FS.LOINC):
    return {"resource": {"resourceType": "Observation", "status": "final", "code": {"coding": [{"system": system, "code": code}]},
                         "valueQuantity": {"value": value, "unit": unit, "system": FS.UCUM, "code": unit}}}


def _bare(code, enc_id, on, *observations):
    """A Bundle with hand-written Observations, as another vendor might send it."""
    b = _bundle(code, enc_id, on, weight_kg=55.0)
    b["entry"] = b["entry"][:2] + list(observations)
    return b


def _exam(enc_id, facility_id=None):
    with SessionLocal() as db:
        q = db.query(AncExam).filter(AncExam.external_id == enc_id)
        return q.filter(AncExam.facility_id == facility_id).one() if facility_id else q.one()


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
    h, p, code = _linked(client, auth)
    on = date.today() - timedelta(days=1)
    b = _bundle(code, "SIMPUS-OSP-T1", on, visit_number=1, examiner="Bidan Yohana", weight_kg=56.0,
                bp_systolic=150, bp_diastolic=95, muac_cm=23.0, hb_g_dl=10.9, fundal_height_cm=22.0, fetal_heart_rate=140,
                fetal_presentation="head", td_immunization="TT3", iron_tablets=30, urine_protein="+1")
    r = _post(client, b)
    assert r.status_code == 201, r.text
    issue = r.json()["issue"][0]
    assert r.json()["resourceType"] == "OperationOutcome" and issue["details"]["coding"][0]["code"] == "created"
    # Sent again (a retry): updated, not duplicated.
    r2 = _post(client, b)
    assert r2.status_code == 200 and r2.json()["issue"][0]["details"]["coding"][0]["code"] == "updated"

    p = client.get(f"/api/pregnancies/{p['id']}", headers=h).json()
    assert p["anc"][0]["status"] == "done" and p["anc"][0]["place"] == "Puskesmas Oesapa"
    assert p["latest_exam"]["bp_systolic"] == 150 and p["latest_exam"]["fetal_presentation"] == "head"
    assert p["latest_exam"]["urine_protein"] == "+1" and p["latest_exam"]["iron_tablets"] == 30
    assert p["risk"]["key"] == "urgent" and "Tekanan darah tinggi" in p["risk"]["reasons"]
    assert p["latest"]["muac_cm"] == 23.0  # facility LiLA joins the mother's checks
    link = client.get(f"/api/pregnancies/{p['id']}/link", headers=h).json()
    assert sum(1 for e in link["exams"] if e["visit_number"] == 1) == 1
    notes = client.get("/api/notifications", headers=h).json()
    assert sum(1 for n in notes if n["kind"] == "anc_result") == 1
    kader_notes = client.get("/api/notifications", headers=auth("kader.oesapa@nutrisense.id")).json()
    assert any(n["kind"] == "mother_danger" and "tekanan darah tinggi" in n["body"] for n in kader_notes)


def test_resend_replaces_the_checkup(client, auth):
    """A correction from the facility: a removed value is removed here, a changed K number moves the visit."""
    kader = auth("kader.oesapa@nutrisense.id")
    h, p, code = _linked(client, auth, weeks=20)
    on = date.today()
    assert _post(client, _bundle(code, "FIX-1", on, visit_number=2, hb_g_dl=12.0, bp_systolic=110, bp_diastolic=70)).status_code == 201
    before = len(client.get("/api/notifications", headers=kader).json())
    r = _post(client, _bundle(code, "FIX-1", on, visit_number=3, bp_systolic=150, bp_diastolic=100))
    assert r.status_code == 200, r.text
    view = client.get(f"/api/pregnancies/{p['id']}", headers=h).json()
    assert view["latest_exam"]["hb_g_dl"] is None and view["latest"]["hb_g_dl"] is None
    assert {v["number"] for v in view["anc"] if v["status"] == "done"} == {3}
    # The correction brought a new problem, so the Kader hears about it.
    assert len(client.get("/api/notifications", headers=kader).json()) > before
    # A resend without a K number keeps the one already given.
    assert _post(client, _bundle(code, "FIX-1", on, bp_systolic=150, bp_diastolic=100)).status_code == 200
    assert _exam("FIX-1").visit_number == 3


def test_visit_number_from_the_weeks(client, auth):
    """Without a K number, the visit is the first open one whose weeks fit, not simply K1."""
    h, p, code = _linked(client, auth, weeks=30)
    assert _post(client, _bundle(code, "WK-30", date.today(), weight_kg=60.0)).status_code == 201
    assert _exam("WK-30").visit_number == 4


def test_fhir_rejections(client, auth):
    _, _, code = _linked(client, auth)
    on = date.today()
    good = _bundle(code, "X-1", on, bp_systolic=110, bp_diastolic=70)
    r = _post(client, good, {"Authorization": "Bearer wrong"})
    assert r.status_code == 401 and r.json()["issue"][0]["code"] == "security"
    assert client.post(FHIR, json=good).status_code == 401
    assert _post(client, _bundle("NS-ZZZZZZ", "X-2", on, bp_systolic=110)).status_code == 404
    assert _post(client, {"resourceType": "Patient"}).status_code == 422
    assert _post(client, _bundle(code, "X-3", on)).status_code == 422  # nothing measured
    assert _post(client, _bundle(code, "X-4", on, hb_g_dl=110.0)).status_code == 422  # a typing error at the source
    assert _post(client, _bundle(code, "X-5", on + timedelta(days=2), hb_g_dl=11.0)).status_code == 422  # future
    assert _post(client, _bundle(code, "X-6", on - timedelta(weeks=20), hb_g_dl=11.0)).status_code == 422  # before HPHT
    assert _post(client, _bundle(code, "X 7/bad", on, hb_g_dl=11.0)).status_code == 422  # not a FHIR id


def test_one_encounter_id_cannot_serve_two_mothers(client, auth):
    _, _, a = _linked(client, auth)
    _, _, b = _linked(client, auth)
    assert _post(client, _bundle(a, "SHARED-1", date.today(), hb_g_dl=11.0)).status_code == 201
    r = _post(client, _bundle(b, "SHARED-1", date.today(), hb_g_dl=11.0))
    assert r.status_code == 409 and r.json()["issue"][0]["code"] == "conflict"
    # The same id from another facility is another check-up.
    soe = {"Authorization": "Bearer demo-puskesmas-soe-key"}
    assert _post(client, _bundle(b, "SHARED-1", date.today(), hb_g_dl=11.0), soe).status_code == 201


@pytest.mark.parametrize("mutate, status", [
    (lambda b: b.update(entry="nope"), 422),
    (lambda b: b.update(entry=[1, "x", None]), 422),
    (lambda b: b["entry"][0].update(resource=["Patient"]), 422),
    (lambda b: b["entry"][0]["resource"].update(identifier="NS-7KQ2MP"), 422),
    (lambda b: b["entry"][1]["resource"].update(period="2026-01-01"), 422),
    (lambda b: b["entry"][1]["resource"].pop("period"), 422),
    (lambda b: b["entry"][1]["resource"].update(extension=[{"url": FS.VISIT_EXT, "valueInteger": "two"}]), 422),
    (lambda b: b["entry"][1]["resource"].update(participant=[{"individual": "Bidan"}]), 201),
    (lambda b: b["entry"][1]["resource"].update(status="entered-in-error"), 422),
    (lambda b: b["entry"].append(copy.deepcopy(b["entry"][0])), 422),  # two Patients
    (lambda b: b["entry"][2]["resource"].update(subject={"reference": "Patient/someone-else"}), 422),
    (lambda b: b["entry"][2]["resource"]["valueQuantity"].update(value="1e400"), 422),
    (lambda b: b["entry"][2]["resource"]["valueQuantity"].update(value="NaN"), 422),
    (lambda b: b["entry"][2]["resource"]["valueQuantity"].update(value=True), 422),
    (lambda b: b["entry"][2]["resource"].update(valueQuantity=[1]), 422),
    (lambda b: b["entry"][2]["resource"].update(code={"coding": "29463-7"}), 422),  # no measurement left
    (lambda b: b.update(entry=b["entry"] * 101), 413),
])
def test_malformed_bundles_get_a_clear_4xx(client, auth, mutate, status):
    _, _, code = _linked(client, auth)
    b = _bundle(code, f"M-{uuid.uuid4().hex[:8]}", date.today(), weight_kg=55.0)
    mutate(b)
    r = _post(client, b)
    assert r.status_code == status, r.text
    assert r.json()["resourceType"] == "OperationOutcome"


def test_body_limits_and_bad_json(client):
    assert client.post(FHIR, content=b"{not json", headers={**KEY, "Content-Type": "application/fhir+json"}).status_code == 400
    assert client.post(FHIR, json=[1, 2], headers=KEY).status_code == 422
    big = b'{"resourceType": "Bundle", "entry": [], "pad": "' + b"x" * 1_100_000 + b'"}'
    r = client.post(FHIR, content=big, headers={**KEY, "Content-Type": "application/json"})
    assert r.status_code == 413 and r.json()["issue"][0]["code"] == "too-long"


def test_units_are_converted_or_refused(client, auth):
    _, _, code = _linked(client, auth, weeks=20)
    on = date.today()
    ok = _bare(code, "U-1", on, _obs("718-7", 112, "g/L"), _obs("29463-7", 56000, "g"), _obs("56072-2", 235, "mm"),
               _obs("18185-9", 140, "d"), _obs("55283-6", 140, "{beats}/min"))
    assert _post(client, ok).status_code == 201
    e = _exam("U-1")
    assert (e.hb_g_dl, e.weight_kg, e.muac_cm, e.gestational_weeks, e.fetal_heart_rate) == (11.2, 56.0, 23.5, 20.0, 140)
    # mmol/L Hb has two conventions (monomer, tetramer): refused rather than guessed.
    r = _post(client, _bare(code, "U-2", on, _obs("718-7", 6.9, "mmol/L")))
    assert r.status_code == 422 and "unit" in r.json()["issue"][0]["diagnostics"]
    assert _post(client, _bare(code, "U-3", on, _obs("29463-7", 120, "[lb_av]"))).status_code == 201
    assert _exam("U-3").weight_kg == 54.4
    assert _post(client, _bare(code, "U-4", on, _obs("29463-7", 56, "kg/m2"))).status_code == 422


def test_blood_pressure_as_two_observations_or_any_panel(client, auth):
    _, _, code = _linked(client, auth)
    on = date.today()
    two = _bare(code, "BP-1", on, _obs("8480-6", 142, "mm[Hg]"), _obs("8462-4", 88, "mm[Hg]"))
    assert _post(client, two).status_code == 201
    assert (_exam("BP-1").bp_systolic, _exam("BP-1").bp_diastolic) == (142, 88)
    panel = _bundle(code, "BP-2", on, bp_systolic=128, bp_diastolic=84)
    bp = next(e for e in panel["entry"] if e["resource"].get("component"))
    bp["resource"]["code"]["coding"] = [{"system": FS.LOINC, "code": "55284-4"}]  # another panel code some systems use
    assert _post(client, panel).status_code == 201
    assert (_exam("BP-2").bp_systolic, _exam("BP-2").bp_diastolic) == (128, 84)


def test_period_start_time_zones():
    enc = {"period": {"start": "2026-03-04T20:00:00Z"}}
    assert FS._exam_date(enc) == date(2026, 3, 5)  # 04:00 next morning in NTT (WITA)
    assert FS._exam_date({"period": {"start": "2026-03-04T23:30:00+07:00"}}) == date(2026, 3, 4)  # as written at the facility
    assert FS._exam_date({"period": {"start": "2026-03-04"}}) == date(2026, 3, 4)
    with pytest.raises(FS.SyncError):
        FS._exam_date({"period": {"start": "2026-03"}})


def test_morning_checkup_in_ntt_is_not_in_the_future(client, auth):
    _, _, code = _linked(client, auth)
    wit_today = datetime.now(timezone(timedelta(hours=9))).date()
    assert _post(client, _bundle(code, "TZ-1", wit_today, hb_g_dl=11.5)).status_code == 201


def test_consent_controls_the_link(client, auth):
    h, p = _mother(client, auth)
    assert not client.get(f"/api/pregnancies/{p['id']}/link", headers=h).json()["enabled"]
    # Only the mother may connect her pregnancy.
    kader = auth("kader.oesapa@nutrisense.id")
    assert client.post(f"/api/pregnancies/{p['id']}/link", json={"enabled": True}, headers=kader).status_code == 403
    on = client.post(f"/api/pregnancies/{p['id']}/link", json={"enabled": True}, headers=h).json()
    code = on["code"]
    assert on["enabled"] and code.startswith("NS-") and len(code) == 9
    assert _post(client, _bundle(code, "C-1", date.today(), hb_g_dl=11.6)).status_code == 201
    # Consent withdrawn: further results, even a resend, are refused.
    client.post(f"/api/pregnancies/{p['id']}/link", json={"enabled": False}, headers=h)
    assert _post(client, _bundle(code, "C-2", date.today(), hb_g_dl=11.6)).status_code == 403
    assert _post(client, _bundle(code, "C-1", date.today(), hb_g_dl=11.6)).status_code == 403
    # Turning it on again gives a new code; the old one stays refused (403, not "unknown").
    again = client.post(f"/api/pregnancies/{p['id']}/link", json={"enabled": True}, headers=h).json()
    assert again["code"] != code
    assert _post(client, _bundle(code, "C-3", date.today(), hb_g_dl=11.6)).status_code == 403
    assert _post(client, _bundle(again["code"], "C-3", date.today(), hb_g_dl=11.6)).status_code == 201


def test_a_withdrawn_code_is_never_given_out_again(client, auth, monkeypatch):
    _, p, old = _linked(client, auth)
    with SessionLocal() as db:
        preg = db.get(Pregnancy, p["id"])
        FS.revoke_link_code(db, preg)
        # The random draw first lands on the withdrawn code, then on a fresh one.
        draws = iter(old.removeprefix("NS-") + "ABCDEF")
        monkeypatch.setattr(FS.secrets, "choice", lambda _: next(draws))
        assert FS.issue_link_code(db, preg) == "NS-ABCDEF"
        assert db.query(FacilityLinkCode).filter(FacilityLinkCode.code == old).one().revoked_at is not None
        db.rollback()


def test_delivered_pregnancy(client, auth):
    h, p, code = _linked(client, auth, weeks=38)
    born = date.today() - timedelta(days=3)
    r = client.post(f"/api/pregnancies/{p['id']}/birth", headers=h, json={
        "birth_date": born.isoformat(), "name": "Bayi Lay", "sex": "female", "birth_weight_kg": 3.1, "birth_length_cm": 49})
    assert r.status_code == 201, r.text
    kader = auth("kader.oesapa@nutrisense.id")
    before = len(client.get("/api/notifications", headers=kader).json())
    # After the birth: refused. Before it (sent late): stored, but no alarm and no effect on her risk now.
    assert _post(client, _bundle(code, "D-1", date.today(), bp_systolic=150, bp_diastolic=100)).status_code == 409
    assert _post(client, _bundle(code, "D-2", born - timedelta(days=2), bp_systolic=150, bp_diastolic=100)).status_code == 201
    assert len(client.get("/api/notifications", headers=kader).json()) == before
    view = client.get(f"/api/pregnancies/{p['id']}", headers=h).json()
    assert "Tekanan darah tinggi" not in view["risk"]["reasons"]
    # A delivered pregnancy cannot be connected again.
    client.post(f"/api/pregnancies/{p['id']}/link", json={"enabled": False}, headers=h)
    assert client.post(f"/api/pregnancies/{p['id']}/link", json={"enabled": True}, headers=h).status_code == 409


def test_link_code_spellings():
    for typed in ("NS-7KQ2MP", "ns-7kq2mp", "NS 7KQ2MP", "NS7KQ2MP", "7kq2mp", " 7KQ-2MP "):
        assert FS.normalize_code(typed) == "NS-7KQ2MP"
    assert FS.normalize_code("NS7KQ2") == "NS-NS7KQ2"  # a bare code that happens to start with N, S


def test_measurement_client_uuid_stays_with_its_pregnancy(client, auth):
    h1, p1 = _mother(client, auth)
    h2, p2 = _mother(client, auth)
    cid = str(uuid.uuid4())
    assert client.post(f"/api/pregnancies/{p1['id']}/measurements", headers=h1, json={"hb_g_dl": 9.1, "client_uuid": cid}).status_code == 201
    r = client.post(f"/api/pregnancies/{p2['id']}/measurements", headers=h2, json={"hb_g_dl": 12.0, "client_uuid": cid})
    assert r.status_code == 409 and "9.1" not in r.text


def test_demo_portal_uses_the_fhir_path(client, auth):
    _, _, code = _linked(client, auth)
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


def _simulator():
    path = Path(__file__).resolve().parent.parent / "scripts" / "send_checkup.py"
    spec = importlib.util.spec_from_file_location("send_checkup", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # importing must not send anything
    return mod


def test_simulator_bundle_matches_the_parser():
    sim = _simulator()
    assert (sim.LINK_SYSTEM, sim.VISIT_EXT) == (FS.LINK_SYSTEM, FS.VISIT_EXT)
    b = sim.build_bundle("NS-7KQ2MP", "SIM-T1", date(2026, 9, 1), visit=3, bp=(150, 95), hb=10.2, lila=23.0, weight=58.0, tfu=24.0, djj=140)
    code, exam = FS.parse_bundle(b)
    assert code == "NS-7KQ2MP"
    assert exam == {"external_id": "SIM-T1", "exam_date": date(2026, 9, 1), "visit_number": 3, "examiner": "Bidan Simulasi",
                    "weight_kg": 58.0, "bp_systolic": 150, "bp_diastolic": 95, "muac_cm": 23.0, "hb_g_dl": 10.2,
                    "fundal_height_cm": 24.0, "fetal_heart_rate": 140}


def test_simulator_reports_an_unreachable_server(capsys):
    assert _simulator().main(["--url", "http://127.0.0.1:9", "--hb", "11"]) == 2
    assert "Could not reach" in capsys.readouterr().err


def test_the_documented_example_is_accepted():
    """docs/FACILITY_INTEGRATION.md shows facility IT staff a full Bundle: it must stay valid."""
    import json
    import re

    doc = (Path(__file__).resolve().parents[2] / "docs" / "FACILITY_INTEGRATION.md").read_text()
    code, exam = FS.parse_bundle(json.loads(re.findall(r"```json\n(.*?)```", doc, re.S)[0]))
    assert code == "NS-7KQ2MP" and exam["visit_number"] == 3 and exam["bp_systolic"] == 150 and exam["iron_tablets"] == 30


def test_demo_portal_is_off_in_production(client, auth, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "environment", "production")
    r = client.post("/api/facility-portal/checkup", headers=auth("doctor@nutrisense.id"),
                    json={"facility_id": 1, "link_code": "NS-7KQ2MP", "bp_systolic": 110})
    assert r.status_code == 404
