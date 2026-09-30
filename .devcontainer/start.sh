#!/usr/bin/env bash
# Runs every time the codespace starts; you can also run it by hand any time.
# 1. Gets the latest code from GitHub (only when you have no unsaved changes here).
# 2. If the code changed since the last build: rebuilds the app and starts fresh demo data
#    (the old data is kept in backend/backups/).
# 3. Starts (or restarts) the app on port 8000.
# Wrapped in { } so bash reads the whole file before git pull can change it.
{
cd "$(dirname "$0")/.."

if [ -z "$(git status --porcelain --untracked-files=no)" ]; then
  git pull --ff-only --quiet || echo "Could not get the latest code; using the code already here."
else
  echo "You have local changes, so the latest code was not downloaded (run: git pull)."
fi

head=$(git rev-parse HEAD)
stamp=backend/web/.built-from
if [ "$(cat "$stamp" 2>/dev/null)" != "$head" ]; then
  echo "The code changed since the last build. Rebuilding (a few minutes)..."
  pkill -f "uvicorn app.main:app" 2>/dev/null && sleep 2
  bash .devcontainer/setup.sh || echo "Rebuild failed; see the messages above."
  # Old demo data and its stored model may not match the new code: set them aside.
  if [ -f backend/nutrisense.db ]; then
    backup="backend/backups/$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$backup"
    mv backend/nutrisense.db "$backup/"
    [ -d backend/model_store ] && mv backend/model_store "$backup/"
    echo "Started fresh demo data; the old data is in $backup"
  fi
fi

cd backend
if curl -fs http://localhost:8000/api/health > /dev/null 2>&1; then
  echo "NutriSense is already running on port 8000."
  exit 0
fi
nohup setsid uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*' \
  > /tmp/nutrisense.log 2>&1 < /dev/null &
for _ in $(seq 1 120); do
  if curl -fs http://localhost:8000/api/health > /dev/null 2>&1; then
    echo "NutriSense is running on port 8000. Open the Ports tab to get the link."
    exit 0
  fi
  sleep 2
done
echo "NutriSense did not start. See /tmp/nutrisense.log"
exit 1
}
