"""Hosted deployment: one server for the API and the web app, and secrets in any format."""
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import security
from app.webapp import serve_web_app


def _app(tmp_path):
    web = tmp_path / "web"
    (web / "_expo" / "static" / "js").mkdir(parents=True)
    (web / "index.html").write_text("<html>NutriSense</html>")
    (web / "_expo" / "static" / "js" / "entry.js").write_text("console.log(1)")
    (tmp_path / "secret.txt").write_text("do not serve")
    app = FastAPI()

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    assert serve_web_app(app, web)
    return TestClient(app)


def test_web_app_and_api_share_one_address(tmp_path):
    c = _app(tmp_path)
    assert c.get("/api/health").json() == {"status": "ok"}
    assert c.get("/").text == "<html>NutriSense</html>"
    # App routes load the single-page app, which then shows the right screen.
    for path in ("/home", "/child/3", "/case/1", "/settings"):
        r = c.get(path)
        assert r.status_code == 200 and "NutriSense" in r.text
    assert c.get("/_expo/static/js/entry.js").text == "console.log(1)"
    assert c.get("/docs").status_code == 200  # API docs still work


def test_unknown_api_paths_are_not_swallowed_by_the_app(tmp_path):
    c = _app(tmp_path)
    r = c.get("/api/does-not-exist")
    assert r.status_code == 404 and r.json() == {"detail": "Not Found"}


def test_files_outside_the_build_are_never_served(tmp_path):
    c = _app(tmp_path)
    for path in ("/../secret.txt", "/%2e%2e/secret.txt", "/_expo/../../secret.txt"):
        assert "do not serve" not in c.get(path).text


def test_no_build_means_no_web_route(tmp_path):
    assert serve_web_app(FastAPI(), tmp_path / "missing") is False


def test_encryption_key_can_be_any_random_secret(monkeypatch):
    # Hosting platforms generate secrets that are not Fernet keys; one is derived from them.
    monkeypatch.setattr(security.settings, "encryption_key", "a+generated/secret=value-that-is-not-fernet")
    assert security.decrypt_text(security.encrypt_text("catatan klinis")) == "catatan klinis"
