# One image with the API and the web app, served from the same address.
#   docker build -t nutrisense .
#   docker run -p 8000:8000 nutrisense
# Then open http://localhost:8000 (app) or http://localhost:8000/docs (API).

# 1. Build the web version of the mobile app.
FROM node:22-slim AS web
WORKDIR /mobile
COPY mobile/package.json mobile/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY mobile/ ./
# The app calls the API on the same address it was loaded from.
ENV EXPO_PUBLIC_SAME_ORIGIN_API=1 CI=1 EXPO_NO_TELEMETRY=1
RUN npx expo export --platform web --output-dir /web

# 2. The API, with the web app and a pre-trained risk model baked in.
FROM python:3.11-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
# Train the model at build time so the server starts quickly. Demo data is seeded on first start,
# with the deployment's own encryption key.
RUN python -m app.cli train > /dev/null
COPY --from=web /web ./web
# Some hosts (e.g. Hugging Face Spaces) run the container as a non-root user: keep /app writable.
RUN mkdir -p uploads && chmod -R a+rwX /app

# Secrets: pass NUTRISENSE_JWT_SECRET and NUTRISENSE_ENCRYPTION_KEY to keep them across restarts
# (required with a persistent database). When they are missing, random ones are made at start,
# which suits a demo whose data is re-seeded on every start.
ENV NUTRISENSE_ENVIRONMENT=production
EXPOSE 8000
CMD ["sh", "-c", "export NUTRISENSE_JWT_SECRET=\"${NUTRISENSE_JWT_SECRET:-$(python -c 'import secrets; print(secrets.token_hex(32))')}\" NUTRISENSE_ENCRYPTION_KEY=\"${NUTRISENSE_ENCRYPTION_KEY:-$(python -c 'import secrets; print(secrets.token_hex(32))')}\"; exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
