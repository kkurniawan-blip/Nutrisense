"""Ibu hamil: pregnancy rules (Buku KIA) and the pregnancy workflow from HPHT to birth and nifas."""
from datetime import date, timedelta
import uuid

from app.ai import maternal as M


def _register(client, email):
    body = {"email": email, "password": "Secret123!", "full_name": "Ibu Hamil Test", "region_id": 2, "language": "id",
            "consent_data_processing": True}
    r = client.post("/api/auth/register", json=body)
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_hpl_and_trimester():
    hpht = date(2026, 1, 1)
    assert M.hpl(hpht) == date(2026, 10, 8)  # +280 days
    assert M.trimester(12) == 1 and M.trimester(13) == 2 and M.trimester(24) == 2 and M.trimester(25) == 3


def test_flags_use_kia_thresholds():
    codes = lambda *a: {f["code"] for f in M.mother_flags(*a)}  # noqa: E731
    assert codes(23.4, 11.0, 150) == {"kek"}
    assert codes(23.5, 10.9, 150) == {"anemia"}
    assert codes(25, 6.5, 150) == {"severe_anemia"}
    assert codes(25, 12, 144) == {"short_stature"}
    assert codes(None, None, None) == set()


def test_anc_schedule_is_one_two_three_per_trimester():
    assert [v["trimester"] for v in M.ANC_VISITS] == [1, 2, 2, 3, 3, 3]
    hpht = date.today() - timedelta(weeks=20)
    s = M.anc_schedule(hpht, {1: {"visit_date": "2026-01-01", "place": None}}, date.today())
    status = {v["number"]: v["status"] for v in s}
    assert status[1] == "done" and status[2] == "due" and status[3] == "upcoming" and status[4] == "upcoming"
    assert M.next_anc(s)["number"] == 2
    late = M.anc_schedule(date.today() - timedelta(weeks=30), {}, date.today())
    assert {v["number"]: v["status"] for v in late}[1] == "overdue"
    assert M.next_anc(late)["number"] == 4  # the visit due now comes before the missed ones


def test_seeded_mother_sees_her_pregnancy_with_flags(client, auth):
    h = auth("ibu.maria@nutrisense.id")
    ps = client.get("/api/pregnancies", headers=h).json()
    assert len(ps) == 1
    p = ps[0]
    assert p["gestational_weeks"] == 24 and p["trimester"] == 2
    assert {f["code"] for f in p["flags"]} == {"kek", "anemia"} and p["pmt_needed"]
    assert p["anc_done"] == 2 and p["next_anc"]["number"] == 3
    assert any(i["key"] == "ttd" for i in p["today"])
    # Another mother's pregnancy is private; the Kader of the area can see it.
    other = auth("ibu.sarah@nutrisense.id")
    assert client.get(f"/api/pregnancies/{p['id']}", headers=other).status_code == 403
    assert client.get(f"/api/pregnancies/{p['id']}", headers=auth("kader.oesapa@nutrisense.id")).status_code == 200


def test_pregnancy_journey_to_birth_and_nifas(client, auth):
    h = _register(client, f"hamil-{uuid.uuid4().hex[:6]}@test.id")
    assert client.post("/api/pregnancies", headers=h, json={}).status_code == 400
    r = client.post("/api/pregnancies", headers=h, json={"gestational_weeks": 37, "mother_height_cm": 152, "education": "smp", "gravida": 1})
    assert r.status_code == 201, r.text
    p = r.json()
    pid = p["id"]
    assert p["gestational_weeks"] == 37 and p["trimester"] == 3 and p["hpl"]
    assert client.post("/api/pregnancies", headers=h, json={"gestational_weeks": 10}).status_code == 409  # one active at a time

    # Catat ibu: LiLA 22 cm -> KEK, Hb 10 -> anaemia; the Kader is told.
    r = client.post(f"/api/pregnancies/{pid}/measurements", headers=h, json={"muac_cm": 22.0, "hb_g_dl": 10.0})
    assert r.status_code == 201 and {f["code"] for f in r.json()["flags"]} == {"kek", "anemia"}
    k = auth("kader.oesapa@nutrisense.id")
    assert any(n["kind"] == "mother_flag" for n in client.get("/api/notifications", headers=k).json())

    # ANC visits, TTD/PMT, birth plan.
    p = client.post(f"/api/pregnancies/{pid}/anc", headers=h, json={"number": 1, "visit_date": (date.today() - timedelta(weeks=26)).isoformat(),
                                                                    "place": "puskesmas"}).json()
    assert p["anc_done"] == 1 and p["anc"][0]["status"] == "done"
    p = client.post(f"/api/pregnancies/{pid}/daily", headers=h, json={"ttd": True, "pmt": True}).json()
    assert p["today_log"] == {"ttd": True, "pmt": True} and p["ttd_total"] == 1
    p = client.patch(f"/api/pregnancies/{pid}", headers=h, json={"birth_plan": {"place": "puskesmas", "transport": "ambulans desa",
                                                                                "companion": "Suami", "junk": "x"}}).json()
    assert p["birth_plan"] == {"place": "puskesmas", "transport": "ambulans desa", "companion": "Suami"}

    # Danger sign -> escalation with the Kader's number.
    r = client.post(f"/api/pregnancies/{pid}/danger", headers=h, json={"signs": ["bleeding", "nausea"]}).json()
    assert r["danger"] and r["kader"]["phone"]
    assert client.post(f"/api/pregnancies/{pid}/danger", headers=h, json={"signs": ["nausea"]}).json()["danger"] is False

    # Catat kelahiran creates the child with the birth measurement and starts nifas.
    r = client.post(f"/api/pregnancies/{pid}/birth", headers=h, json={"name": "Bayi Test", "sex": "female", "birth_weight_kg": 2.4,
                                                                      "birth_length_cm": 47})
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["low_birth_weight"] is True
    cid = out["child"]["id"]
    ms = client.get(f"/api/children/{cid}/measurements", headers=h).json()
    assert len(ms) == 1 and ms[0]["weight_kg"] == 2.4 and ms[0]["position"] == "lying"
    assert client.get(f"/api/children/{cid}/assessments", headers=h).json(), "birth size gives the first status"
    assert out["pregnancy"]["status"] == "delivered" and [v["code"] for v in out["pregnancy"]["nifas"]][:2] == ["KF1", "KN1"]
    assert out["pregnancy"]["nifas"][0]["status"] == "due"
    p = client.post(f"/api/pregnancies/{pid}/nifas", headers=h, json={"code": "KF1"}).json()
    assert p["nifas"][0]["status"] == "done"
    assert client.post(f"/api/pregnancies/{pid}/birth", headers=h, json={"name": "X", "sex": "male", "birth_weight_kg": 3,
                                                                         "birth_length_cm": 49}).status_code == 409
    # Still listed during nifas, now with the child linked.
    assert client.get("/api/pregnancies", headers=h).json()[0]["child_id"] == cid
