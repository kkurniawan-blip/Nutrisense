import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .ai import llm
from .config import get_settings
from .database import Base, SessionLocal, engine, ensure_columns
from .routers import auth, cases, child_care, children, dashboard, family, governance, logistics, maternal, nutrition
from .services import model_registry
from .webapp import serve_web_app

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.environment == "production" and (settings.jwt_secret.startswith("change-me") or not settings.encryption_key):
        raise RuntimeError("Set NUTRISENSE_JWT_SECRET and NUTRISENSE_ENCRYPTION_KEY before running in production")
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
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings.cors_origins.split(",")], allow_credentials=False,
                   allow_methods=["*"], allow_headers=["*"])

for r in (auth.router, children.router, child_care.router, family.router, maternal.router, nutrition.router, cases.router, logistics.router, dashboard.router,
          governance.router):
    app.include_router(r)


@app.get("/api/health", tags=["reference"])
def health():
    return {"status": "ok", "ai": {"claude_enabled": llm.is_enabled(), "model": settings.ai_model if llm.is_enabled() else None,
                                   "fallback": "rule-based + scikit-learn"}}


# Last, so API and docs routes always win: the web app, when a build is present (Docker image).
serve_web_app(app, settings.web_dir)
