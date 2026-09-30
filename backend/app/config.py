"""Application settings, loaded from environment variables (or a .env file)."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", env_prefix="NUTRISENSE_", extra="ignore")

    app_name: str = "NutriSense & N.E.X.U.S. API"
    environment: str = "development"

    # SQLite works out of the box; set to postgresql+psycopg2://user:pass@host/db for production.
    database_url: str = f"sqlite:///{BASE_DIR / 'nutrisense.db'}"

    jwt_secret: str = "change-me-in-production-please-32-bytes-min"
    jwt_expire_minutes: int = 60 * 24 * 7

    # Fernet key (urlsafe base64, 32 bytes) used to encrypt free-text health notes at rest.
    # When empty, a key is derived from jwt_secret so development works without configuration.
    encryption_key: str = ""

    # Claude AI. When no key is configured every AI feature falls back to the built-in
    # rule-based / scikit-learn implementation, so the app stays fully functional offline.
    anthropic_api_key: str = ""
    ai_model: str = "claude-opus-5"
    ai_timeout_seconds: float = 60.0

    model_dir: Path = BASE_DIR / "model_store"
    upload_dir: Path = BASE_DIR / "uploads"
    # Exported web app (npx expo export -p web). When this folder exists the API also serves the app,
    # so one address works for both (used by the Docker image / hosted deployment).
    web_dir: Path = BASE_DIR / "web"

    # Risk-model confidence below which a human must review the assessment (human-in-the-loop).
    review_confidence_threshold: float = 0.6

    # N.E.X.U.S. simulation parameters

    seed_demo_data: bool = True
    cors_origins: str = "*"


@lru_cache
def get_settings() -> Settings:
    return Settings()
