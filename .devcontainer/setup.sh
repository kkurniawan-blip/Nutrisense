#!/usr/bin/env bash
# One-time setup when the codespace is created (start.sh also runs it to rebuild): install the API, build the
# web app into backend/web (the API serves it on the same address), and make secrets for this codespace.
# Exits non-zero when any step fails; backend/web is only replaced after a complete web build.
set -euo pipefail
cd "$(dirname "$0")/.."

pip install --no-cache-dir -r backend/requirements.txt

# Build into backend/web.new, then swap, so a failed build never breaks the app that is already running.
rm -rf backend/web.new
(cd mobile && npm ci --no-audit --no-fund && \
  EXPO_PUBLIC_SAME_ORIGIN_API=1 CI=1 EXPO_NO_TELEMETRY=1 npx expo export --platform web --clear --output-dir ../backend/web.new)
test -f backend/web.new/index.html || { echo "The web build has no index.html." >&2; exit 1; }
rm -rf backend/web.old
[ -d backend/web ] && mv backend/web backend/web.old
mv backend/web.new backend/web
rm -rf backend/web.old

# Stable secrets for this codespace, kept in backend/.env (not committed, never printed).
if ! grep -q NUTRISENSE_JWT_SECRET backend/.env 2>/dev/null; then
  {
    echo "NUTRISENSE_JWT_SECRET=$(python -c 'import secrets; print(secrets.token_hex(32))')"
    echo "NUTRISENSE_ENCRYPTION_KEY=$(python -c 'import secrets; print(secrets.token_hex(32))')"
  } >> backend/.env
  chmod 600 backend/.env
fi
git rev-parse HEAD > backend/web/.built-from  # start.sh rebuilds when the code moves on
echo "NutriSense is set up."
