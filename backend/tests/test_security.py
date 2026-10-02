"""Security and safety regressions from the backend audit. Every write test registers its own people, so the seeded
demo accounts that other tests read are never changed."""
from datetime import date, timedelta
import uuid

KADER = "kader.oesapa@nutrisense.id"  # covers Oesapa (1), Baumata (2) and Semau (3)


def _uid() -> str:
    return uuid.uuid4().hex[:8]


def _register(client, region_id=3, password="Secret123!", **extra):
    body = {"email": f"sec-{_uid()}@test.id", "password": password, "full_name": "Ibu Uji", "region_id": region_id,
            "language": "en", "consent_data_processing": True, **extra}
    r = client.post("/api/auth/register", json=body)
    assert r.status_code == 201, r.text
    data = r.json()
    return {"Authorization": f"Bearer {data['access_token']}"}, data["user"], body


def _staff(client, auth, role, region_id=3, covered=None):
    """A new staff account created by the demo admin (never a seeded one)."""
    email = f"{role}-{_uid()}@test.id"
    r = client.post("/api/users", headers=auth("admin@nutrisense.id"),
                    json={"email": email, "password": "Secret123!", "full_name": f"{role} uji", "role": role,
                          "region_id": region_id, "covered_region_ids": covered or []})
    assert r.status_code == 201, r.text
    return auth(email, "Secret123!"), r.json()


def _child(client, h, months=24, **extra):
    birth = date.today() - timedelta(days=int(months * 30.44))
    r = client.post("/api/children", headers=h, json={"name": "Anak Uji", "sex": "male", "birth_date": birth.isoformat(), **extra})
    assert r.status_code == 201, r.text
    return r.json()


# ---------- 1. staff cannot widen their own area ----------
def test_staff_cannot_change_own_region(client, auth):
    h, _ = _staff(client, auth, "kader", region_id=1)
    r = client.patch("/api/auth/me", headers=h, json={"region_id": 6})
    assert r.status_code == 403
    assert client.get("/api/auth/me", headers=h).json()["region_id"] == 1
    # The app sends the unchanged region with every profile save: that still works.
    r = client.patch("/api/auth/me", headers=h, json={"full_name": "Kader Baru", "region_id": 1})
    assert r.status_code == 200 and r.json()["full_name"] == "Kader Baru"
    # A mother may still move to another village.
    hm, _, _ = _register(client)
    assert client.patch("/api/auth/me", headers=hm, json={"region_id": 6}).json()["region_id"] == 6


# ---------- safety: WHO rules and danger signs run without the AI consent ----------
def test_danger_sign_escalates_without_ai_consent(client, auth):
    h, _, _ = _register(client, consent_ai_analysis=False)
    cid = _child(client, h)["id"]
    r = client.post(f"/api/children/{cid}/measurements", headers=h, json={"weight_kg": 8.0, "height_cm": 76, "position": "standing"})
    assert r.status_code == 201 and r.json()["assessment"] is not None
    r = client.post(f"/api/children/{cid}/symptoms", headers=h, json={"symptoms": ["convulsions"]})
    assert r.status_code == 201 and r.json()["assessment"]["triage"]["urgency"] == "emergency"
    kader = auth(KADER)
    assert any(c["child_id"] == cid for c in client.get("/api/cases", headers=kader).json())
    notes = client.get("/api/notifications", headers=kader).json()
    assert any(n["kind"] == "case_escalated" and n["data"].get("child_id") == cid for n in notes)


def _phone() -> str:
    return "0857" + "".join(str(int(c, 16) % 10) for c in uuid.uuid4().hex[:8])


def _mother_body(phone, region_id=1, **extra):
    return {"full_name": "Ibu Hamil Uji", "phone": phone, "region_id": region_id, "gestational_weeks": 20,
            "consent_given": True, **extra}


# ---------- 2. a Kader cannot attach records to someone else's account ----------
def test_kader_cannot_claim_accounts_outside_area(client, auth):
    kader = auth(KADER)
    far_phone = _phone()
    _register(client, region_id=6, phone=far_phone)  # a mother in Baa, outside this Kader's villages
    r = client.post("/api/kader/mothers", headers=kader, json=_mother_body(far_phone))
    assert r.status_code == 409 and far_phone not in r.text and "@" not in r.text
    r = client.post("/api/children", headers=kader, json={"name": "Anak", "sex": "male", "birth_date": date.today().isoformat(),
                                                         "caregiver_phone": far_phone, "region_id": 1})
    assert r.status_code == 409 and far_phone not in r.text
    # A staff phone number gets the same plain answer.
    staff_phone = "081200000003"  # seeded Kader Baa
    assert client.post("/api/kader/mothers", headers=kader, json=_mother_body(staff_phone)).status_code == 409
    r = client.post("/api/children", headers=kader, json={"name": "Anak", "sex": "male", "birth_date": date.today().isoformat(),
                                                         "caregiver_phone": staff_phone, "region_id": 1})
    assert r.status_code == 409
    # A mother in the Kader's own village is fine, and the answer shows only her id and name.
    near_phone = _phone()
    _, near, _ = _register(client, region_id=2, phone=near_phone)
    r = client.post("/api/kader/mothers", headers=kader, json=_mother_body(near_phone, region_id=2))
    assert r.status_code == 201, r.text
    assert r.json()["mother"] == {"id": near["id"], "full_name": near["full_name"], "phone": None}
    assert r.json()["temp_password"] is None


# ---------- 3. login throttling, audit and password rules ----------
def test_login_throttle_audit_and_password_rules(client, auth):
    from app.routers import auth as auth_router

    _, _, body = _register(client)
    try:
        for _ in range(5):
            r = client.post("/api/auth/login", json={"email": body["email"], "password": "Wrong-pass-1"})
            assert r.status_code == 401
        r = client.post("/api/auth/login", json={"email": body["email"], "password": body["password"]})
        assert r.status_code == 429 and "15 menit" in r.json()["detail"]
        r = client.post("/api/auth/login?lang=en", json={"email": body["email"], "password": body["password"]})
        assert r.status_code == 429 and "15 minutes" in r.json()["detail"]
        logs = client.get("/api/audit-logs?entity=user&limit=50", headers=auth("admin@nutrisense.id")).json()
        failed = [x for x in logs if x["action"] == "login_failed"]
        assert failed and not any(body["email"] in str(x) for x in failed)  # no email in the audit trail
    finally:
        auth_router.ACCOUNT_LIMIT.clear()
        auth_router.IP_LIMIT.clear()
    assert client.post("/api/auth/login", json={"email": body["email"], "password": body["password"]}).status_code == 200
    # Too long or too common passwords are refused.
    assert client.post("/api/auth/login", json={"email": body["email"], "password": "x" * 129}).status_code == 422
    for weak in ("12345678", "Password", "x" * 129):
        r = client.post("/api/auth/register", json={**body, "email": f"weak-{_uid()}@test.id", "password": weak})
        assert r.status_code == 422


def test_login_throttle_per_address(client, monkeypatch):
    from app.routers import auth as auth_router

    auth_router.IP_LIMIT.clear()
    monkeypatch.setattr(auth_router.IP_LIMIT, "max_failures", 3)
    try:
        for _ in range(3):  # unknown accounts still count, and take as long as a wrong password
            assert client.post("/api/auth/login", json={"email": f"nobody-{_uid()}@test.id", "password": "Secret123!"}).status_code == 401
        assert client.post("/api/auth/login", json={"email": "admin@nutrisense.id", "password": "Demo1234!"}).status_code == 429
    finally:
        auth_router.IP_LIMIT.clear()
        auth_router.ACCOUNT_LIMIT.clear()


# ---------- 4. no demo accounts in production unless allowed; first admin from the CLI ----------
def test_production_refuses_demo_seed(monkeypatch):
    import asyncio

    import pytest

    from app import main

    for k, v in (("environment", "production"), ("jwt_secret", "x" * 40), ("encryption_key", "k" * 40),
                 ("seed_demo_data", True), ("allow_demo", False)):
        monkeypatch.setattr(main.settings, k, v)
    with pytest.raises(RuntimeError, match="NUTRISENSE_SEED_DEMO_DATA=false"):
        asyncio.run(main.lifespan(main.app).__aenter__())


def test_cli_user_add(client):
    from app import cli

    email = f"first-admin-{_uid()}@test.id"
    assert cli.main(["cli", "user-add", "--role", "admin", "--email", email, "--name", "Admin Uji", "--password", "12345678"]) == 1
    assert cli.main(["cli", "user-add", "--role", "admin", "--email", email, "--name", "Admin Uji", "--password", "Admin-Pass-99"]) == 0
    r = client.post("/api/auth/login", json={"email": email, "password": "Admin-Pass-99"})
    assert r.status_code == 200 and r.json()["user"]["role"] == "admin"
    assert cli.main(["cli", "user-add", "--role", "admin", "--email", email, "--name", "Again", "--password", "Admin-Pass-99"]) == 1


# ---------- 5. token revocation ----------
def test_logout_and_password_change_revoke_tokens(client):
    import jwt

    from app.config import get_settings

    h, user, body = _register(client)
    assert client.get("/api/auth/me", headers=h).status_code == 200
    # Tokens from before revocation existed have no "tv" claim: still valid while the version is 0.
    old = jwt.encode({"sub": str(user["id"]), "role": "caregiver"}, get_settings().jwt_secret, algorithm="HS256")
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {old}"}).status_code == 200
    assert client.post("/api/auth/logout", headers=h).status_code == 204
    assert client.get("/api/auth/me", headers=h).status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {old}"}).status_code == 401

    tok = client.post("/api/auth/login", json={"email": body["email"], "password": body["password"]}).json()["access_token"]
    h2 = {"Authorization": f"Bearer {tok}"}
    r = client.post("/api/auth/change-password", headers=h2, json={"current_password": body["password"], "new_password": "Another-Pass-7"})
    assert r.status_code == 200
    assert client.get("/api/auth/me", headers=h2).status_code == 401  # other devices are signed out
    fresh = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.get("/api/auth/me", headers=fresh).status_code == 200  # this device keeps working


# ---------- 6. locker pickup ----------
GENERIC_PICKUP_ERROR = {"Kode tidak cocok untuk loker ini. Periksa lagi 6 angkanya.", "This code does not match this locker. Check the 6 digits again."}


def test_pickup_only_family_or_area_staff(client, auth, monkeypatch):
    from app.routers import logistics as logistics_router

    kader = auth(KADER)
    hm, _, _ = _register(client, region_id=2)  # Baumata: its locker has ORS + zinc in stock
    cid = _child(client, hm)["id"]
    req = client.post("/api/supply-requests", headers=kader, json={"child_id": cid, "items": [{"item_key": "ors_zinc", "quantity": 1}]}).json()
    assert client.post(f"/api/supply-requests/{req['id']}/approve", headers=kader, json={}).json()["status"] == "ready_for_pickup"
    mine = next(x for x in client.get("/api/supply-requests", headers=hm).json() if x["id"] == req["id"])
    code, locker = mine["pickup_code"], mine["locker"]["code"]
    other_locker = next(lk["code"] for lk in client.get("/api/lockers?kind=locker", headers=hm).json() if lk["code"] != locker)

    wrong = client.post(f"/api/lockers/by-code/{locker}/pickup", headers=hm, json={"pickup_code": "999999" if code != "999999" else "999998"})
    elsewhere = client.post(f"/api/lockers/by-code/{other_locker}/pickup", headers=hm, json={"pickup_code": code})
    assert wrong.status_code == elsewhere.status_code == 403 and wrong.json() == elsewhere.json()  # one generic answer
    assert wrong.json()["detail"] in GENERIC_PICKUP_ERROR
    far_kader, _ = _staff(client, auth, "kader", region_id=6)
    other_mother, _, _ = _register(client, region_id=2)
    for h in (far_kader, other_mother):  # the right code, but not their family or village
        r = client.post(f"/api/lockers/by-code/{locker}/pickup", headers=h, json={"pickup_code": code})
        assert r.status_code == 403 and r.json()["detail"] in GENERIC_PICKUP_ERROR

    monkeypatch.setattr(logistics_router.PICKUP_LIMIT, "max_failures", 1)
    try:
        assert client.post(f"/api/lockers/by-code/{locker}/pickup", headers=far_kader, json={"pickup_code": code}).status_code == 429
    finally:
        logistics_router.PICKUP_LIMIT.clear()
    ok = client.post(f"/api/lockers/by-code/{locker}/pickup", headers=hm, json={"pickup_code": code})
    assert ok.status_code == 200 and ok.json()["supply_request"]["status"] == "picked_up"


# ---------- 7. case and child assignment rules ----------
def test_case_priority_and_assignee_rules(client, auth):
    hm, mom, _ = _register(client)
    cid = _child(client, hm)["id"]
    client.post(f"/api/children/{cid}/symptoms", headers=hm, json={"symptoms": ["convulsions"]})
    kader = auth(KADER)
    case = next(c for c in client.get("/api/cases", headers=kader).json() if c["child_id"] == cid)
    assert case["priority"] == "emergency"
    url = f"/api/cases/{case['id']}"
    assert client.patch(url, headers=kader, json={"priority": "low"}).status_code == 403
    _, far_kader = _staff(client, auth, "kader", region_id=6)
    _, doctor = _staff(client, auth, "doctor", region_id=1)
    for body in ({"assigned_to_id": mom["id"]}, {"assigned_to_id": 999999}, {"assigned_to_id": far_kader["id"]},
                 {"doctor_id": far_kader["id"]}):
        assert client.patch(url, headers=kader, json=body).status_code == 422, body
    r = client.patch(url, headers=kader, json={"doctor_id": doctor["id"]})
    assert r.status_code == 200 and r.json()["doctor_id"] == doctor["id"]
    officer = auth("officer@nutrisense.id")
    assert client.patch(f"/api/children/{cid}", headers=officer, json={"kader_id": mom["id"]}).status_code == 422
    assert client.patch(f"/api/children/{cid}", headers=officer, json={"region_id": 999999}).status_code == 400


# ---------- 8. offline ids are per child ----------
def test_measurement_client_uuid_scoped_to_child(client):
    hm, _, _ = _register(client)
    a, b = _child(client, hm)["id"], _child(client, hm)["id"]
    body = {"weight_kg": 11.0, "height_cm": 85, "position": "standing", "client_uuid": f"uuid-{_uid()}", "run_assessment": False}
    first = client.post(f"/api/children/{a}/measurements", headers=hm, json=body)
    assert first.status_code == 201 and first.json()["created"] is True
    again = client.post(f"/api/children/{a}/measurements", headers=hm, json=body)
    assert again.json()["created"] is False and again.json()["measurement"]["id"] == first.json()["measurement"]["id"]
    assert client.post(f"/api/children/{b}/measurements", headers=hm, json=body).status_code == 409


# ---------- 9. what a Kader sees of other users ----------
def test_users_list_for_kader(client, auth):
    h, _ = _staff(client, auth, "kader", region_id=1)
    rows = client.get("/api/users", headers=h).json()
    assert rows and all(u["email"] is None and u["phone"] is None for u in rows)
    assert all(u["role"] != "caregiver" or u["region_id"] == 1 for u in rows)
    assert any(u["role"] == "caregiver" for u in rows) and any(u["role"] == "doctor" for u in rows)
    officer_rows = client.get("/api/users", headers=auth("officer@nutrisense.id")).json()
    assert any(u["email"] for u in officer_rows)


# ---------- 10. deleting a child removes everything that refers to it ----------
def test_child_delete_removes_linked_rows(client):
    from sqlalchemy import select

    from app.database import SessionLocal
    from app.models import BreastfeedingLog, KiaRecord, Notification, Pregnancy

    hm, _, _ = _register(client)
    pid = client.post("/api/pregnancies", headers=hm, json={"gestational_weeks": 39}).json()["id"]
    born = client.post(f"/api/pregnancies/{pid}/birth", headers=hm, json={"name": "Bayi Uji", "sex": "female", "birth_weight_kg": 2.2,
                                                                         "birth_length_cm": 46})
    assert born.status_code == 201, born.text
    cid = born.json()["child"]["id"]
    assert client.post(f"/api/children/{cid}/kia", headers=hm, json={"item_key": "imm_0"}).status_code == 200
    assert client.post(f"/api/children/{cid}/asi", headers=hm, json={"asi_only": True}).status_code in (200, 201)
    client.post(f"/api/children/{cid}/symptoms", headers=hm, json={"symptoms": ["convulsions"]})
    assert client.delete(f"/api/children/{cid}", headers=hm).status_code == 204
    with SessionLocal() as db:
        assert not db.scalars(select(KiaRecord).where(KiaRecord.child_id == cid)).all()
        assert not db.scalars(select(BreastfeedingLog).where(BreastfeedingLog.child_id == cid)).all()
        assert not [n for n in db.scalars(select(Notification)).all() if (n.data or {}).get("child_id") == cid]
        assert db.get(Pregnancy, pid).child_id is None


# ---------- 11. staff chat respects the mother's AI consent ----------
def test_staff_chat_without_child_context_when_no_consent(client, auth, monkeypatch):
    from app.routers import nutrition as nutrition_router

    seen = []
    monkeypatch.setattr(nutrition_router.assistant, "reply", lambda turns, msg, ctx, lang: (seen.append(ctx), ("ok", "test"))[1])
    hm, _, _ = _register(client, consent_ai_analysis=False)
    cid = _child(client, hm)["id"]
    kader = auth(KADER)
    r = client.post("/api/assistant/chat", headers=kader, json={"message": "Bagaimana anak ini?", "child_id": cid})
    assert r.status_code == 200 and seen == [None]  # answered, but without the child's details
    hc, _, _ = _register(client)
    consented = _child(client, hc)["id"]
    client.post("/api/assistant/chat", headers=kader, json={"message": "Bagaimana anak ini?", "child_id": consented})
    assert seen[-1] and "Anak Uji" in seen[-1]


# ---------- 12. input bounds ----------
def test_input_bounds(client, auth):
    kader = auth(KADER)
    hm, _, _ = _register(client)
    cid = _child(client, hm)["id"]
    for url in ("/api/dashboard/flagged?days=-1", "/api/dashboard/projection?until=99999", "/api/dashboard/children?offset=-1",
                "/api/dashboard/children?limit=0", "/api/dashboard/priority?limit=-5"):
        assert client.get(url, headers=kader).status_code == 422, url
    assert client.get(f"/api/children/{cid}/meals?limit=0", headers=hm).status_code == 422
    assert client.post("/api/children", headers=hm, json={"name": "   ", "sex": "male", "birth_date": date.today().isoformat()}).status_code == 422
    assert client.patch(f"/api/children/{cid}", headers=hm, json={"name": None}).status_code == 400
    r = client.post("/api/kader/mothers", headers=kader, json=_mother_body("telepon-saya"))
    assert r.status_code == 400
    pid = client.post("/api/pregnancies", headers=hm, json={"gestational_weeks": 10}).json()["id"]
    for hpht in ((date.today() + timedelta(days=3)).isoformat(), (date.today() - timedelta(weeks=60)).isoformat()):
        assert client.patch(f"/api/pregnancies/{pid}", headers=hm, json={"hpht": hpht}).status_code == 400
    big = b"\xff\xd8" + b"0" * (5 * 1024 * 1024 + 10)
    r = client.post(f"/api/children/{cid}/nutriscan", headers=hm, files={"image": ("meal.jpg", big, "image/jpeg")})
    assert r.status_code == 413


# ---------- 13 / 14. health checks and indexes ----------
def test_health_ready_and_head(client):
    assert client.get("/api/health/ready").json() == {"status": "ok", "database": "ok"}
    assert client.head("/api/health").status_code == 200
    assert client.head("/api/health/ready").status_code == 200


def test_declared_indexes_exist(client):
    from sqlalchemy import inspect

    from app.database import engine

    insp = inspect(engine)
    for table, column in (("users", "phone"), ("cases", "status"), ("supply_requests", "pickup_code")):
        assert any(ix["column_names"] == [column] for ix in insp.get_indexes(table)), (table, column)


# ---------- web app: compressed and cached ----------
def test_api_and_web_assets_are_gzipped(client, tmp_path):
    from fastapi import FastAPI
    from fastapi.middleware.gzip import GZipMiddleware
    from fastapi.testclient import TestClient

    from app import main
    from app.webapp import serve_web_app

    r = client.get("/api/foods", headers={"Accept-Encoding": "gzip"})
    assert r.status_code == 200 and r.headers.get("content-encoding") == "gzip"
    assert any(m.cls is GZipMiddleware for m in main.app.user_middleware)

    # No web build exists in tests: serve a small one from a temporary folder with the same middleware.
    (tmp_path / "_expo" / "static" / "js").mkdir(parents=True)
    (tmp_path / "index.html").write_text("<html>" + "x" * 2000 + "</html>")
    (tmp_path / "_expo" / "static" / "js" / "entry-abc123.js").write_text("console.log('nutrisense');" * 200)
    web = FastAPI()
    web.add_middleware(GZipMiddleware, minimum_size=1000)
    assert serve_web_app(web, tmp_path)
    with TestClient(web) as c:
        js = c.get("/_expo/static/js/entry-abc123.js", headers={"Accept-Encoding": "gzip"})
        assert js.status_code == 200 and js.headers["content-encoding"] == "gzip"
        assert js.headers["cache-control"] == "public, max-age=31536000, immutable"
        for path in ("/", "/index.html", "/child/3"):
            assert c.get(path).headers["cache-control"] == "no-cache", path
