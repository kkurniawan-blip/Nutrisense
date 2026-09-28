#!/usr/bin/env bash
# One-time setup when the codespace is created: install the API, build the web app into backend/web
# (the API serves it on the same address), and make secrets for this codespace.
set -euo pipefail
cd "$(dirname "$0")/.."

pip install --no-cache-dir -r backend/requirements.txt

(cd mobile && npm ci --no-audit --no-fund && \
  EXPO_PUBLIC_SAME_ORIGIN_API=1 CI=1 EXPO_NO_TELEMETRY=1 npx expo export --platform web --clear --output-dir ../backend/web)

# Stable secrets for this codespace, kept in backend/.env (not committed).
if ! grep -q NUTRISENSE_JWT_SECRET backend/.env 2>/dev/null; then
  {
    echo "NUTRISENSE_JWT_SECRET=$(python -c 'import secrets; print(secrets.token_hex(32))')"
    echo "NUTRISENSE_ENCRYPTION_KEY=$(python -c 'import secrets; print(secrets.token_hex(32))')"
  } >> backend/.env
fi
echo "NutriSense is set up."
