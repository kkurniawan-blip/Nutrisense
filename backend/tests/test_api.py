"""End-to-end workflow tests (Appendix A scenarios) against the seeded demo database."""
from datetime import date, timedelta
import uuid

from app.ai import llm


def _register(client, email, **consents):
    body = {"email": email, "password": "Secret123!", "full_name": "Ibu Test", "region_id": 3, "language": "en",
            "consent_data_processing": True, **consents}
    r = client.post("/api/auth/register", json=body)
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_health_reports_fallback_ai(client):
    r = client.get("/api/health").json()
    assert r["status"] == "ok" and r["ai"]["claude_enabled"] is False


def test_registration_requires_consent(client):
    r = client.post("/api/auth/register", json={"email": "x@y.id", "password": "Secret123!", "full_name": "Ibu X",
                                                "consent_data_processing": False})
    assert r.status_code == 400


def test_auth_rejects_bad_credentials(client):
    assert client.post("/api/auth/login", json={"email": "admin@nutrisense.id", "password": "wrong"}).status_code == 401
    assert client.get("/api/children").status_code == 401


def test_caregiver_journey(client, auth):
    """Register -> child profile -> measurements -> AI assessment -> symptoms -> nutrition -> chat."""
    h = _register(client, f"journey-{uuid.uuid4().hex[:6]}@test.id")
    birth = date.today() - timedelta(days=int(22 * 30.44))
    r = client.post("/api/children", headers=h, json={"name": "Test Child", "sex": "male", "birth_date": birth.isoformat(),
                                                      "clean_water_access": False, "sanitation_access": False, "birth_weight_kg": 2.3})
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    assert r.json()["kader_id"] is not None  # auto-assigned to the region's Kader

    # Two past visits then today, trending down.
    for months_ago, w, hgt in ((4, 9.3, 76.4), (2, 9.4, 77.0), (0, 9.5, 77.4)):
        d = date.today() - timedelta(days=int(months_ago * 30.44))
        r = client.post(f"/api/children/{cid}/measurements", headers=h, json={"measured_at": d.isoformat(), "weight_kg": w,
                                                                                "height_cm": hgt, "position": "lying"})
        assert r.status_code == 201, r.text
    body = r.json()
    a = body["assessment"]
    assert body["measurement"]["haz"] < -2
    assert a["risk_level"] in ("medium", "high")
    assert a["reasons"] and a["explanation"] and a["triage"]["actions"]
    assert a["trend"]["status"] in ("declining", "projected_stunting", "stable", "catching_up")

    chart = client.get(f"/api/children/{cid}/growth-chart", headers=h).json()
    assert len(chart["points"]) == 3 and set(chart["reference"]) == {"-3", "-2", "0", "2"}

    r = client.post(f"/api/children/{cid}/symptoms", headers=h, json={"description": "He has had diarrhea for 3 days and won't eat"})
    assert r.status_code == 201
    assert {"diarrhea", "poor_appetite"} <= set(r.json()["report"]["symptoms"])
    assert any(s["item_key"] == "ors_zinc" for s in r.json()["assessment"]["triage"]["supplies"])

    plan = client.get(f"/api/children/{cid}/nutrition-plan?refresh=true", headers=h).json()
    assert plan["recipes"] and plan["daily_targets"]["energy_kcal"] == 1350

    meal = client.post(f"/api/children/{cid}/meals", headers=h, json={"items": [{"food_key": "telur"}, {"food_key": "daun_kelor"}]})
    assert meal.status_code == 201 and "eggs" in meal.json()["food_groups"]

    chat = client.post("/api/assistant/chat", headers=h, json={"message": "What should I feed him?", "child_id": cid}).json()
    assert chat["generated_by"] == "faq" and chat["reply"]
    assert len(client.get(f"/api/assistant/history?child_id={cid}", headers=h).json()) == 2

    # Staff see the escalated case; caregiver cannot see the dashboard.
    kader = auth("kader.oesapa@nutrisense.id")
    assert any(c["child_id"] == cid for c in client.get("/api/cases", headers=kader).json())
    assert client.get("/api/dashboard/summary", headers=h).status_code == 403


def test_danger_signs_trigger_emergency(client, auth):
    h = auth("ibu.yuliana@nutrisense.id")
    kids = client.get("/api/children", headers=h).json()
    r = client.post(f"/api/children/{kids[0]['id']}/symptoms", headers=h,
                    json={"description": "anak kejang tadi malam, sekarang tidak mau minum"})
    a = r.json()["assessment"]
    assert a["triage"]["urgency"] == "emergency" and a["risk_level"] == "high"
    assert a["guardrail"] == "danger_signs_present"
    assert a["triage"]["actions"][0]["code"] == "go_facility_now"
    # Reasons and notifications use plain words, never internal codes, in the reader's language.
    assert a["reasons"][0]["text"].startswith("Ada tanda bahaya: ") and "_" not in a["reasons"][0]["text"]
    kader = auth("kader.oesapa@nutrisense.id")
    staff_notes = client.get("/api/notifications", headers=kader).json()
    mom_notes = client.get("/api/notifications", headers=h).json()
    for n in staff_notes + mom_notes:
        assert " / " not in n["title"] and "_" not in n["body"], n


def test_implausible_measurement_rejected(client, auth):
    h = auth("ibu.maria@nutrisense.id")
    cid = client.get("/api/children", headers=h).json()[0]["id"]
    r = client.post(f"/api/children/{cid}/measurements", headers=h, json={"weight_kg": 35, "height_cm": 70})
    assert r.status_code == 422


def test_rbac_child_isolation(client, auth):
    maria = auth("ibu.maria@nutrisense.id")
    sarah_kids = client.get("/api/children", headers=auth("ibu.sarah@nutrisense.id")).json()
    assert client.get(f"/api/children/{sarah_kids[0]['id']}", headers=maria).status_code == 403
    # A Kader only sees children in their own region.
    kader_baa = auth("kader.baa@nutrisense.id")
    regions = {c["region_id"] for c in client.get("/api/children", headers=kader_baa).json()}
    assert regions == {6}


def test_offline_sync_is_idempotent(client, auth):
    kader = auth("kader.oesapa@nutrisense.id")
    cid = client.get("/api/children", headers=kader).json()[0]["id"]
    item = {"child_id": cid, "weight_kg": 11.2, "height_cm": 84.0, "client_uuid": f"offline-{uuid.uuid4()}"}
    first = client.post("/api/sync", headers=kader, json={"measurements": [item, {"child_id": cid, "weight_kg": 99, "height_cm": 84}]}).json()
    assert first["results"][0]["status"] == "created"
    assert first["results"][1]["status"] == "error"
    again = client.post("/api/sync", headers=kader, json={"measurements": [item]}).json()
    assert again["results"][0]["status"] == "duplicate"


def test_logistics_locker_and_drone_flow(client, auth):
    officer = auth("officer@nutrisense.id")
    maria = auth("ibu.maria@nutrisense.id")
    kader = auth("kader.oesapa@nutrisense.id")
    child = client.get("/api/children", headers=maria).json()[0]

    # Semau island locker is nearly empty, so a supply request for a Semau child needs the drone.
    semau_kid = next(c for c in client.get("/api/children", headers=officer).json() if c["region_id"] == 3)
    req = client.post("/api/supply-requests", headers=officer, json={
        "child_id": semau_kid["id"], "items": [{"item_key": "pmt_biscuit", "quantity": 2}], "urgency": "doctor_48h"}).json()
    plan = client.get(f"/api/supply-requests/{req['id']}/plan", headers=officer).json()
    assert plan["chosen"]["type"] in ("drone", "courier")
    assert any(o["type"] == "locker_stock" and not o["feasible"] for o in plan["options"])
    approved = client.post(f"/api/supply-requests/{req['id']}/approve", headers=officer, json={}).json()
    assert approved["status"] == "in_transit"
    client.post("/api/logistics/simulate?minutes=600", headers=officer)
    after = next(r for r in client.get("/api/supply-requests", headers=officer).json() if r["id"] == req["id"])
    assert after["status"] == "ready_for_pickup" and after["pickup_code"] is None  # codes hidden from staff

    # Locker-stock path for Maria's child: approve, then collect with the 6-digit code.
    req2 = client.post("/api/supply-requests", headers=kader, json={
        "child_id": child["id"], "items": [{"item_key": "ors_zinc", "quantity": 1}]}).json()
    r = client.post(f"/api/supply-requests/{req2['id']}/approve", headers=kader, json={})
    assert r.json()["status"] == "ready_for_pickup" and r.json()["fulfillment"] == "locker_stock"
    mine = next(x for x in client.get("/api/supply-requests", headers=maria).json() if x["id"] == req2["id"])
    assert len(mine["pickup_code"]) == 6 and mine["qr_payload"].startswith("NEXUS:")
    locker = mine["locker"]["code"]
    assert client.post(f"/api/lockers/by-code/{locker}/pickup", headers=kader, json={"pickup_code": "000000"}).status_code == 403
    tampered = mine["qr_payload"][:-1] + ("0" if mine["qr_payload"][-1] != "0" else "1")
    assert client.post(f"/api/lockers/by-code/{locker}/pickup", headers=kader, json={"qr_payload": tampered}).status_code == 403
    ok = client.post(f"/api/lockers/by-code/{locker}/pickup", headers=kader, json={"pickup_code": mine["pickup_code"]})
    assert ok.status_code == 200 and ok.json()["supply_request"]["status"] == "picked_up"


def test_doctor_only_items(client, auth):
    kader = auth("kader.soe@nutrisense.id")
    cid = client.get("/api/children", headers=kader).json()[0]["id"]
    req = client.post("/api/supply-requests", headers=kader, json={"child_id": cid, "items": [{"item_key": "rutf", "quantity": 1}]}).json()
    assert client.post(f"/api/supply-requests/{req['id']}/approve", headers=kader, json={}).status_code == 403
    r = client.post(f"/api/supply-requests/{req['id']}/approve", headers=auth("doctor@nutrisense.id"), json={})
    assert r.status_code == 200


def test_human_review_and_case_update(client, auth):
    doctor = auth("doctor@nutrisense.id")
    pending = client.get("/api/reviews/pending", headers=doctor).json()
    assert pending
    a = pending[0]
    r = client.post(f"/api/assessments/{a['id']}/review", headers=doctor, json={"reviewed_level": "medium", "note": "Clinical exam OK"})
    assert r.json()["risk_level"] == "medium" and r.json()["model_risk_level"] == a["model_risk_level"]
    case = client.get("/api/cases", headers=doctor).json()[0]
    upd = client.patch(f"/api/cases/{case['id']}", headers=doctor, json={"status": "referred", "note": "Referred to RSUD"}).json()
    assert upd["status"] == "referred" and upd["notes"][-1]["text"] == "Referred to RSUD"
    ev = client.get("/api/dashboard/evaluation", headers=doctor).json()
    assert ev["human_review_rate"] > 0


def test_dashboard_endpoints(client, auth):
    officer = auth("officer@nutrisense.id")
    s = client.get("/api/dashboard/summary", headers=officer).json()
    assert s["children"] >= 48 and sum(s["risk_distribution"].values()) > 0
    heat = client.get("/api/dashboard/heatmap", headers=officer).json()
    assert len(heat) == 6 and all("child" not in k for row in heat for k in row if k != "children")
    proj = client.get("/api/dashboard/projection?series=ntt", headers=officer).json()
    assert proj["selected_degree"] in (1, 2, 3) and proj["projection"]
    model = client.get("/api/dashboard/model", headers=officer).json()
    assert model["metrics"]["f1_macro"] > 0.8


def test_consent_controls_ai_and_fhir(client, auth):
    h = _register(client, f"consent-{uuid.uuid4().hex[:6]}@test.id", consent_ai_analysis=False, consent_satusehat_sharing=False)
    birth = date.today() - timedelta(days=400)
    cid = client.post("/api/children", headers=h, json={"name": "C", "sex": "female", "birth_date": birth.isoformat()}).json()["id"]
    r = client.post(f"/api/children/{cid}/measurements", headers=h, json={"weight_kg": 9.0, "height_cm": 74, "position": "lying"})
    assert r.status_code == 201 and r.json()["assessment"] is None  # no AI without consent
    assert client.post(f"/api/children/{cid}/assess", headers=h).status_code == 403

    kader = auth("kader.oesapa@nutrisense.id")
    assert client.post(f"/api/children/{cid}/fhir/sync", headers=kader).status_code == 403
    client.post("/api/consents", headers=h, json={"scope": "satusehat_sharing", "granted": True})
    sync = client.post(f"/api/children/{cid}/fhir/sync", headers=kader).json()
    assert sync["status"] == "simulated_success" and not sync["errors"]

    bundle = client.get(f"/api/children/{cid}/fhir", headers=h).json()
    types = {e["resource"]["resourceType"] for e in bundle["entry"]}
    assert {"Patient", "Observation", "Consent"} <= types
    loinc = {c["code"] for e in bundle["entry"] if e["resource"]["resourceType"] == "Observation"
             for c in e["resource"]["code"]["coding"]}
    assert {"8306-3", "29463-7"} <= loinc

    # Right to deletion
    assert client.delete(f"/api/children/{cid}", headers=h).status_code == 204
    assert client.get(f"/api/children/{cid}", headers=h).status_code == 404

    audit = client.get("/api/audit-logs?entity=child", headers=auth("admin@nutrisense.id")).json()
    assert any(x["action"] == "delete_child" and x["entity_id"] == cid for x in audit)


def test_encrypted_at_rest(client, auth):
    from sqlalchemy import text

    from app.database import engine

    with engine.connect() as conn:
        raw = conn.execute(text("SELECT description FROM symptom_reports WHERE description IS NOT NULL LIMIT 1")).scalar()
    assert raw and raw.startswith("gAAAA")  # Fernet token, not plain text


def test_claude_path_used_when_available(client, auth, monkeypatch):
    monkeypatch.setattr(llm, "is_enabled", lambda: True)
    monkeypatch.setattr(llm, "complete_chat", lambda system, messages, max_tokens=2000: "Berikan telur setiap hari.")
    r = client.post("/api/assistant/chat", headers=auth("ibu.maria@nutrisense.id"), json={"message": "Menu apa yang bagus?"}).json()
    assert r == {"reply": "Berikan telur setiap hari.", "generated_by": "claude"}


def test_menu_suggestions_after_nutriscan(client, auth):
    h = auth("ibu.maria@nutrisense.id")
    cid = client.get("/api/children", headers=h).json()[1]["id"]  # Budi, 30 months
    before = client.post(f"/api/children/{cid}/menu-suggestions", headers=h, json={}).json()
    after = client.post(f"/api/children/{cid}/menu-suggestions", headers=h,
                        json={"items": [{"food_key": "telur"}, {"food_key": "bayam"}]}).json()
    assert "eggs" in after["groups_today"] and "vita_fruit_veg" in after["groups_today"]
    assert len(after["missing_groups"]) <= len(before["missing_groups"])
    s = after["suggestions"][0]
    assert s["ingredients"] and s["steps"] and s["minutes"] and s["cost_label"] and s["why"]


def test_today_checklist(client, auth):
    h = auth("ibu.maria@nutrisense.id")
    kids = client.get("/api/children", headers=h).json()
    r = client.get(f"/api/children/{kids[1]['id']}/today", headers=h).json()
    keys = {i["key"] for i in r["items"]}
    assert {"measure", "symptoms"} <= keys
    assert all(i["status"] in ("ok", "monitor", "action", "urgent", "info") and i["text"] for i in r["items"])
    # Logging a meal flips the meal item to done.
    client.post(f"/api/children/{kids[0]['id']}/meals", headers=h, json={"items": [{"food_key": "telur"}]})
    r = client.get(f"/api/children/{kids[0]['id']}/today", headers=h).json()
    assert next(i for i in r["items"] if i["key"] == "meals")["status"] == "ok"
    assert "eggs" in r["groups_today"]


def test_development_tracker(client, auth):
    h = auth("ibu.maria@nutrisense.id")
    cid = client.get("/api/children", headers=h).json()[1]["id"]  # Budi, 30 months
    d = client.get(f"/api/children/{cid}/development", headers=h).json()
    assert d["band_months"] == 30 and len(d["domains"]) == 4 and d["activities"]
    assert all(dom["status"] == "unknown" for dom in d["domains"])
    motor = next(x for x in d["domains"] if x["key"] == "motor")["items"][0]["key"]
    lang = next(x for x in d["domains"] if x["key"] == "language")["items"][0]["key"]
    d = client.post(f"/api/children/{cid}/development", headers=h, json={"answers": {motor: True, lang: False, "bogus": True}}).json()
    status_of = {x["key"]: x["status"] for x in d["domains"]}
    assert status_of["motor"] == "on_track" and status_of["language"] == "monitor"


def test_child_detail_has_care_team_and_shared_notes(client, auth):
    kader = auth("kader.oesapa@nutrisense.id")
    maria = auth("ibu.maria@nutrisense.id")
    budi = client.get("/api/children", headers=maria).json()[1]
    case = next(c for c in client.get("/api/cases", headers=kader).json() if c["child_id"] == budi["id"])
    client.patch(f"/api/cases/{case['id']}", headers=kader, json={"note": "Internal: check house", "share_with_family": False})
    client.patch(f"/api/cases/{case['id']}", headers=kader, json={"note": "Berikan telur setiap hari", "share_with_family": True})
    d = client.get(f"/api/children/{budi['id']}", headers=maria).json()
    roles = [m["role"] for m in d["care_team"]]
    assert roles[:2] == ["caregiver", "kader"] and "facility" in roles
    texts = [r["text"] for r in d["professional_recommendations"]]
    assert "Berikan telur setiap hari" in texts and "Internal: check house" not in texts
    assert d["last_reviewed"]["author"].startswith("Kader")


def test_kader_review_cannot_downgrade_high(client, auth):
    kader = auth("kader.soe@nutrisense.id")
    kids = client.get("/api/children", headers=kader).json()
    high = next(c for c in kids if c["latest_assessment"] and c["latest_assessment"]["model_risk_level"] == "high")
    aid = high["latest_assessment"]["id"]
    assert client.post(f"/api/assessments/{aid}/review", headers=kader, json={"reviewed_level": "low"}).status_code == 403
    r = client.post(f"/api/assessments/{aid}/review", headers=kader, json={"reviewed_level": "high", "note": "Confirmed at home visit"})
    assert r.status_code == 200 and r.json()["reviewed_by_name"].startswith("Kader")


def test_growth_chart_indicators_and_meaning(client, auth):
    h = auth("ibu.maria@nutrisense.id")
    cid = client.get("/api/children", headers=h).json()[1]["id"]
    for ind in ("hfa", "wfa", "wfh"):
        r = client.get(f"/api/children/{cid}/growth-chart?indicator={ind}", headers=h).json()
        assert r["points"] and r["meaning"] and r["details"]["label"]
        assert set(r["reference"]) == {"-3", "-2", "0", "2"}
    wfh = client.get(f"/api/children/{cid}/growth-chart?indicator=wfh", headers=h).json()
    assert wfh["x_unit"] == "cm" and wfh["points"][0]["x"] > 60  # x is height, not age


def test_area_children_filters(client, auth):
    kader = auth("kader.oesapa@nutrisense.id")
    r = client.get("/api/dashboard/children", headers=kader).json()
    c = r["counts"]
    assert c["total"] == c["followup"] + c["attention"] + c["monitored"] + c["unassessed"]
    pr = client.get("/api/dashboard/children?filter=priority", headers=kader).json()
    assert all(x["group"] in ("followup", "attention") for x in pr["rows"])
    page = client.get("/api/dashboard/children?limit=2&offset=0", headers=kader).json()
    assert len(page["rows"]) <= 2 and page["matched"] == c["total"]
    region = r["rows"][0]["region_id"]
    assert region in {x["id"] for x in r["regions"]}
    p2 = client.get("/api/dashboard/children?limit=2&offset=2", headers=kader).json()
    assert not {x["child_id"] for x in page["rows"]} & {x["child_id"] for x in p2["rows"]}
    assert all(x["region_id"] == region for x in client.get(f"/api/dashboard/children?region_id={region}", headers=kader).json()["rows"])
    assert all(x["risk_level"] == "high" for x in client.get("/api/dashboard/children?risk=high", headers=kader).json()["rows"])
    assert client.get("/api/dashboard/children", headers=auth("ibu.maria@nutrisense.id")).status_code == 403


def test_offline_replay_is_idempotent_for_meals_and_symptoms(client, auth):
    h = auth("ibu.maria@nutrisense.id")
    cid = client.get("/api/children", headers=h).json()[0]["id"]
    body = {"items": [{"food_key": "pisang"}], "client_uuid": f"meal-{uuid.uuid4()}"}
    a = client.post(f"/api/children/{cid}/meals", headers=h, json=body).json()
    b = client.post(f"/api/children/{cid}/meals", headers=h, json=body).json()
    assert a["id"] == b["id"]
    sb = {"description": "batuk", "client_uuid": f"sym-{uuid.uuid4()}"}
    a = client.post(f"/api/children/{cid}/symptoms", headers=h, json=sb).json()
    b = client.post(f"/api/children/{cid}/symptoms", headers=h, json=sb).json()
    assert a["report"]["id"] == b["report"]["id"] and b["duplicate"] is True


def test_simple_menu_idea_and_recipe_list(client, auth):
    h = auth("ibu.maria@nutrisense.id")
    cid = client.get("/api/children", headers=h).json()[1]["id"]
    r = client.post(f"/api/children/{cid}/menu-suggestions", headers=h, json={"items": [{"food_key": "nasi"}]}).json()
    assert r["simple_idea"]["text"].startswith("Tambahkan") and any(g["key"] == "grains_roots" for g in r["present_groups"])
    recipes = client.get(f"/api/children/{cid}/recipes", headers=h).json()
    assert len(recipes) >= 10 and recipes[0]["minutes"] <= recipes[-1]["minutes"]


def test_account_settings_and_password_change(client):
    body = {"email": "settings.mom@example.id", "password": "Awal12345", "full_name": "Ibu Settings", "consent_data_processing": True}
    r = client.post("/api/auth/register", json=body)
    assert r.status_code == 201
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    region = client.get("/api/regions").json()[0]["id"]

    me = client.patch("/api/auth/me", json={"full_name": "Ibu Settings Baru", "phone": " ", "region_id": region, "language": "en"}, headers=h).json()
    assert me["full_name"] == "Ibu Settings Baru" and me["phone"] is None and me["language"] == "en" and me["region_id"] == region
    assert client.patch("/api/auth/me", json={"region_id": 999999}, headers=h).status_code == 400
    assert client.patch("/api/auth/me", json={"full_name": "x"}, headers=h).status_code == 422

    assert client.post("/api/auth/change-password", json={"current_password": "salah123", "new_password": "Baru12345"}, headers=h).status_code == 400
    assert client.post("/api/auth/change-password", json={"current_password": "Awal12345", "new_password": "pendek"}, headers=h).status_code == 422
    assert client.post("/api/auth/change-password", json={"current_password": "Awal12345", "new_password": "Baru12345"}, headers=h).status_code == 200
    assert client.post("/api/auth/login", json={"email": body["email"], "password": "Awal12345"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": body["email"], "password": "Baru12345"}).status_code == 200
    assert client.post("/api/auth/change-password", json={"current_password": "x", "new_password": "Baru12345"}).status_code == 401


def test_notifications_follow_recipient_language(client, auth):
    kader = auth("kader.oesapa@nutrisense.id")
    mom = auth("ibu.maria@nutrisense.id")
    child_ids = {c["id"] for c in client.get("/api/children", headers=mom).json()}
    case = next(c for c in client.get("/api/cases", headers=kader).json() if c["child_id"] in child_ids)
    client.patch("/api/auth/me", json={"language": "en"}, headers=mom)
    try:
        client.patch(f"/api/cases/{case['id']}", headers=kader, json={"note": "Please give an egg every day.", "share_with_family": True})
        latest = client.get("/api/notifications", headers=mom).json()[0]
        assert latest["title"] == "Message from your health worker" and latest["body"] == "Please give an egg every day."
    finally:
        client.patch("/api/auth/me", json={"language": "id"}, headers=mom)
