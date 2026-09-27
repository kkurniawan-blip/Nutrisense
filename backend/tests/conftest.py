import os
import sys
import tempfile
from pathlib import Path

import pytest

_tmp = Path(tempfile.mkdtemp(prefix="nutrisense-test-"))
# Set NUTRISENSE_TEST_DATABASE_URL (e.g. an empty PostgreSQL database) to run the suite against another backend.
os.environ["NUTRISENSE_DATABASE_URL"] = os.environ.get("NUTRISENSE_TEST_DATABASE_URL", f"sqlite:///{_tmp / 'test.db'}")
os.environ["NUTRISENSE_MODEL_DIR"] = str(_tmp / "models")
os.environ["NUTRISENSE_ANTHROPIC_API_KEY"] = ""
os.environ["NUTRISENSE_SEED_DEMO_DATA"] = "true"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def _login(client, email, password="Demo1234!"):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="session")
def auth(client):
    return lambda email, password="Demo1234!": _login(client, email, password)
