import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from .ai import llm
from .config import get_settings
from .database import Base, SessionLocal, engine, ensure_columns
from .routers import auth, cases, child_care, children, dashboard, facility, family, governance, logistics, maternal, nutrition
from .services import model_registry
from .webapp import serve_web_app

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.environment == "production" and (settings.jwt_secret.startswith("change-me") or not settings.encryption_key):
        raise RuntimeError("Set NUTRISENSE_JWT_SECRET and NUTRISENSE_ENCRYPTION_KEY before running in production")
    if settings.environment == "production" and settings.seed_demo_data and not settings.allow_demo:
        raise RuntimeError("Demo accounts with a public password would be created: set NUTRISENSE_SEED_DEMO_DATA=false in production "
                           "(create the first admin with `python -m app.cli user-add`), or NUTRISENSE_ALLOW_DEMO=1 for a demo deployment")
    settings.model_dir.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(engine)
    ensure_columns()
    with SessionLocal() as db:
        if settings.seed_demo_data:
            from .seed import seed_if_empty

            seed_if_empty(db)
        model_registry.get_active(db)  # trains the first model if none exists
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Backend for NutriSense (caregiver & Kader mobile app) and N.E.X.U.S. (smart-locker logistics). "
    "AI outputs are decision support, not medical diagnosis.",
    lifespan=lifespan,
)
# The web app's JS bundle is several MB: compressed it loads about 3x faster on slow 3G.
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings.cors_origins.split(",")], allow_credentials=False,
                   allow_methods=["*"], allow_headers=["*"])

for r in (auth.router, children.router, child_care.router, family.router, maternal.router, nutrition.router, cases.router, logistics.router, dashboard.router,
          governance.router, facility.router):
    app.include_router(r)


@app.api_route("/api/health", methods=["GET", "HEAD"], tags=["reference"])
def health():
    return {"status": "ok", "ai": {"claude_enabled": llm.is_enabled(), "model": settings.ai_model if llm.is_enabled() else None,
                                   "fallback": "rule-based + scikit-learn"}}


@app.api_route("/api/health/ready", methods=["GET", "HEAD"], tags=["reference"])
def ready():
    """Readiness for the load balancer: 200 only when the database answers."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as e:  # any database failure means "not ready", never a 500
        logging.getLogger(__name__).warning("Readiness check failed: %s", type(e).__name__)
        return JSONResponse({"status": "unavailable", "database": "down"}, status_code=503)
    return {"status": "ok", "database": "ok"}


# Last, so API and docs routes always win: the web app, when a build is present (Docker image).
serve_web_app(app, settings.web_dir)
