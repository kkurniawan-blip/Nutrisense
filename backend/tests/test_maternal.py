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
    # A report queued offline and replayed with the same key alerts the Kader once.
    def alerts():
        return sum(n["kind"] == "mother_danger" for n in client.get("/api/notifications", headers=k).json())
    before = alerts()
    body = {"signs": ["fever"], "client_uuid": "danger-replay-1"}
    first = client.post(f"/api/pregnancies/{pid}/danger", headers=h, json=body)
    again = client.post(f"/api/pregnancies/{pid}/danger", headers=h, json=body)
    assert first.status_code == again.status_code == 201 and again.json()["danger"] == first.json()["danger"]
    assert alerts() - before == (1 if first.json()["danger"] else 0)

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


# ---------- danger report: open until staff record an outcome ----------
def _pregnant(client, weeks=30):
    h = _register(client, f"bahaya-{uuid.uuid4().hex[:6]}@test.id")  # region 2: inside kader.oesapa's coverage
    p = client.post("/api/pregnancies", headers=h, json={"gestational_weeks": weeks})
    assert p.status_code == 201, p.text
    return h, p.json()["id"]


def _backdate_report(rid, days):
    from app.database import SessionLocal
    from app.models import PregnancyDangerReport, utcnow

    with SessionLocal() as db:
        db.get(PregnancyDangerReport, rid).created_at = utcnow() - timedelta(days=days)
        db.commit()


def test_later_complaint_does_not_clear_danger_and_item_is_first(client, auth):
    h, pid = _pregnant(client)
    client.post(f"/api/pregnancies/{pid}/danger", headers=h, json={"signs": ["bleeding", "nausea"]})
    client.post(f"/api/pregnancies/{pid}/danger", headers=h, json={"signs": ["nausea"]})
    p = client.get(f"/api/pregnancies/{pid}", headers=h).json()
    assert p["risk"]["key"] == "urgent"
    assert p["today"][0]["key"] == "danger" and p["today"][0]["status"] == "urgent"
    od = p["open_danger"]
    assert od["signs"] == ["bleeding"] and od["sign_labels"] == ["Perdarahan"]  # the complaint is not the alert
    assert od["created_at"] and od["contacted_at"] is None and od["contacted_by_name"] is None
    # The Kader of the area sees the same open report on the pregnancy page.
    assert client.get(f"/api/pregnancies/{pid}", headers=auth("kader.oesapa@nutrisense.id")).json()["open_danger"]["id"] == od["id"]


def test_danger_report_notifies_kader_and_doctor(client, auth):
    h, pid = _pregnant(client)
    client.post(f"/api/pregnancies/{pid}/danger", headers=h, json={"signs": ["convulsions"]})
    rid = client.get(f"/api/pregnancies/{pid}", headers=h).json()["open_danger"]["id"]
    for email in ("kader.oesapa@nutrisense.id", "doctor@nutrisense.id"):
        notes = client.get("/api/notifications", headers=auth(email)).json()
        assert any(n["kind"] == "mother_danger" and n["data"].get("report_id") == rid for n in notes), email
    assert not any(n["data"].get("report_id") == rid for n in client.get("/api/notifications", headers=auth("kader.baa@nutrisense.id")).json())


def test_danger_follow_up_permissions_and_closing(client, auth):
    h, pid = _pregnant(client)
    client.post(f"/api/pregnancies/{pid}/danger", headers=h, json={"signs": ["bleeding"]})
    rid = client.get(f"/api/pregnancies/{pid}", headers=h).json()["open_danger"]["id"]
    url = f"/api/pregnancies/{pid}/danger/{rid}"
    kader = auth("kader.oesapa@nutrisense.id")
    assert client.patch(url, headers=h, json={"action": "contacted"}).status_code == 403  # not the mother
    assert client.patch(url, headers=auth("kader.baa@nutrisense.id"), json={"action": "contacted"}).status_code == 403  # outside her area
    assert client.patch(f"/api/pregnancies/{pid}/danger/999999", headers=kader, json={"action": "contacted"}).status_code == 404
    assert client.patch(url, headers=kader, json={"outcome": "maybe"}).status_code == 422
    assert client.patch(url, headers=kader, json={}).status_code == 422

    # "Sudah saya hubungi": still open (still urgent), and a replay keeps the first time.
    first = client.patch(url, headers=kader, json={"action": "contacted", "client_uuid": "c-1"})
    assert first.status_code == 200, first.text
    od = first.json()["open_danger"]
    assert first.json()["outcome"] is None and od["contacted_at"] and od["contacted_by_name"] == "Kader Martha Lay"
    again = client.patch(url, headers=auth("doctor@nutrisense.id"), json={"action": "contacted", "client_uuid": "c-1"}).json()
    assert again["open_danger"]["contacted_at"] == od["contacted_at"] and again["open_danger"]["contacted_by_name"] == "Kader Martha Lay"
    p = client.get(f"/api/pregnancies/{pid}", headers=h).json()
    assert p["risk"]["key"] == "urgent" and p["open_danger"]["contacted_at"] == od["contacted_at"]

    # The outcome closes it; the same outcome again is a no-op, a different one is refused.
    done = client.patch(url, headers=auth("doctor@nutrisense.id"), json={"outcome": "went_to_facility"})
    assert done.status_code == 200 and done.json() == {"open_danger": None, "outcome": "went_to_facility"}
    assert client.patch(url, headers=kader, json={"outcome": "went_to_facility"}).json()["outcome"] == "went_to_facility"
    assert client.patch(url, headers=kader, json={"outcome": "advised_home"}).status_code == 409
    p = client.get(f"/api/pregnancies/{pid}", headers=h).json()
    assert p["open_danger"] is None and p["risk"]["key"] != "urgent" and all(i["key"] != "danger" for i in p["today"])
    actions = {(a["action"], a["entity_id"]) for a in client.get("/api/audit-logs?entity=pregnancy", headers=auth("admin@nutrisense.id")).json()}
    assert {("danger_contacted", pid), ("danger_outcome", pid)} <= actions

    # An outcome without a recorded contact also sets the contact; a complaint-only report is not followed up.
    client.post(f"/api/pregnancies/{pid}/danger", headers=h, json={"signs": ["less_movement"]})
    rid2 = client.get(f"/api/pregnancies/{pid}", headers=h).json()["open_danger"]["id"]
    # "Tidak bisa dihubungi" is only a logged attempt: the report stays open and urgent, and no contact is recorded.
    r = client.patch(f"/api/pregnancies/{pid}/danger/{rid2}", headers=auth("officer@nutrisense.id"), json={"outcome": "not_reached"})
    assert r.status_code == 200 and r.json()["attempt"] == "not_reached" and r.json()["outcome"] is None
    assert r.json()["open_danger"]["id"] == rid2 and r.json()["open_danger"]["contacted_at"] is None
    assert client.get(f"/api/pregnancies/{pid}", headers=h).json()["risk"]["key"] == "urgent"
    r = client.patch(f"/api/pregnancies/{pid}/danger/{rid2}", headers=auth("officer@nutrisense.id"), json={"outcome": "advised_home"})
    assert r.status_code == 200 and r.json()["open_danger"] is None
    client.post(f"/api/pregnancies/{pid}/danger", headers=h, json={"signs": ["nausea"]})
    from app.database import SessionLocal
    from app.models import PregnancyDangerReport
    from sqlalchemy import select

    with SessionLocal() as db:
        closed = db.get(PregnancyDangerReport, rid2)
        assert closed.contacted_at and closed.outcome_at and closed.outcome_by_id == closed.contacted_by_id
        mild = db.scalar(select(PregnancyDangerReport).where(PregnancyDangerReport.pregnancy_id == pid).order_by(PregnancyDangerReport.id.desc()))
    assert client.patch(f"/api/pregnancies/{pid}/danger/{mild.id}", headers=kader, json={"action": "contacted"}).status_code == 422
    # Another pregnancy's report is not found under this one.
    h2, pid2 = _pregnant(client)
    assert client.patch(f"/api/pregnancies/{pid2}/danger/{rid}", headers=kader, json={"action": "contacted"}).status_code == 404


def test_danger_stays_open_at_most_14_days(client, auth):
    h, pid = _pregnant(client)
    client.post(f"/api/pregnancies/{pid}/danger", headers=h, json={"signs": ["waters_break"]})
    rid = client.get(f"/api/pregnancies/{pid}", headers=h).json()["open_danger"]["id"]
    _backdate_report(rid, 13)  # the old 3-day window would have dropped it already
    p = client.get(f"/api/pregnancies/{pid}", headers=h).json()
    assert p["open_danger"]["id"] == rid and p["risk"]["key"] == "urgent"
    _backdate_report(rid, 15)
    p = client.get(f"/api/pregnancies/{pid}", headers=h).json()
    assert p["open_danger"] is None and all(i["key"] != "danger" for i in p["today"])
    assert all(x["report_id"] != rid for x in client.get("/api/kader/danger-open", headers=auth("kader.oesapa@nutrisense.id")).json())


def test_open_danger_list_is_scoped(client, auth):
    h, pid = _pregnant(client)
    client.post(f"/api/pregnancies/{pid}/danger", headers=h, json={"signs": ["bleeding"]})
    client.post(f"/api/pregnancies/{pid}/danger", headers=h, json={"signs": ["high_fever"]})  # one card per mother: the latest
    mine = client.get("/api/kader/danger-open", headers=auth("kader.oesapa@nutrisense.id"))
    assert mine.status_code == 200
    rows = [x for x in mine.json() if x["pregnancy_id"] == pid]
    assert len(rows) == 1
    row = rows[0]
    assert set(row) == {"report_id", "pregnancy_id", "mother_name", "mother_phone", "region_name", "signs", "sign_labels", "created_at",
                        "contacted_at"}
    assert row["signs"] == ["high_fever"] and row["mother_name"] == "Ibu Hamil Test" and row["region_name"] and row["contacted_at"] is None
    created = [x["created_at"] for x in mine.json()]
    assert created == sorted(created, reverse=True)
    assert all(x["pregnancy_id"] != pid for x in client.get("/api/kader/danger-open", headers=auth("kader.baa@nutrisense.id")).json())
    assert any(x["pregnancy_id"] == pid for x in client.get("/api/kader/danger-open", headers=auth("doctor@nutrisense.id")).json())
    assert client.get("/api/kader/danger-open", headers=h).status_code == 403
    client.patch(f"/api/pregnancies/{pid}/danger/{row['report_id']}", headers=auth("kader.oesapa@nutrisense.id"), json={"outcome": "advised_home"})
    assert all(x["pregnancy_id"] != pid for x in client.get("/api/kader/danger-open", headers=auth("officer@nutrisense.id")).json())
