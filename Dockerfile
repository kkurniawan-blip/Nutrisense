# One image with the API and the web app, served from the same address.
#   docker build -t nutrisense .
#   docker run -p 8000:8000 -e NUTRISENSE_JWT_SECRET=... -e NUTRISENSE_ENCRYPTION_KEY=... nutrisense
#   Quick throwaway demo (random secrets, fresh demo data on every start):
#   docker run -p 8000:8000 -e NUTRISENSE_SEED_DEMO_DATA=true -e NUTRISENSE_ALLOW_DEMO=1 \
#     -e NUTRISENSE_EPHEMERAL_SECRETS=1 nutrisense
# Then open http://localhost:8000 (app) or http://localhost:8000/docs (API).
# Data (SQLite database and trained models) lives in /app/data: mount a volume there to keep it.

# 1. Build the web version of the mobile app.
FROM node:22-slim AS web
WORKDIR /mobile
COPY mobile/package.json mobile/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY mobile/ ./
# The app calls the API on the same address it was loaded from.
ENV EXPO_PUBLIC_SAME_ORIGIN_API=1 CI=1 EXPO_NO_TELEMETRY=1
RUN npx expo export --platform web --clear --output-dir /web

# 2. The API, with the web app and a pre-trained risk model baked in.
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
# Non-root user. uid 1000 is also the user Hugging Face Spaces run containers as.
RUN useradd --uid 1000 --user-group --create-home --shell /usr/sbin/nologin app
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install -r requirements.txt
COPY backend/app ./app
COPY deploy/docker-entrypoint.sh ./docker-entrypoint.sh

# Only /app/data is writable at run time; the code and the web app stay owned by root.
ENV NUTRISENSE_DATABASE_URL=sqlite:////app/data/nutrisense.db \
    NUTRISENSE_MODEL_DIR=/app/data/models \
    NUTRISENSE_UPLOAD_DIR=/app/data/uploads \
    NUTRISENSE_WEB_DIR=/app/web
# Train the model at build time so the server starts quickly (the metrics are printed in the build log;
# a training error fails the build). Demo data, when enabled, is seeded on first start with the
# deployment's own encryption key. If a volume hides /app/data, the model is trained again on first start.
RUN mkdir -p /app/data/models /app/data/uploads \
    && python -m app.cli train \
    && chown -R app:app /app/data
COPY --from=web /web ./web

# Safe defaults: production mode and no demo accounts. The demo hosts (Hugging Face Space, Render demo)
# turn demo data on with NUTRISENSE_SEED_DEMO_DATA=true, NUTRISENSE_ALLOW_DEMO=1 and NUTRISENSE_EPHEMERAL_SECRETS=1.
ENV NUTRISENSE_ENVIRONMENT=production NUTRISENSE_SEED_DEMO_DATA=false
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD python -c "import os, urllib.request as u; u.urlopen('http://127.0.0.1:%s/api/health' % os.environ.get('PORT', '8000'), timeout=4)" || exit 1
# Graceful stop: uvicorn gets SIGTERM and finishes requests in flight (up to 20 s).
STOPSIGNAL SIGTERM
CMD ["sh", "/app/docker-entrypoint.sh"]
