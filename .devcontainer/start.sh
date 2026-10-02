#!/usr/bin/env bash
# Runs every time the codespace starts; you can also run it by hand any time.
# 1. Gets the latest code from GitHub (only when you have no unsaved changes here).
# 2. If the code changed since the last build: rebuilds the app. Only when the rebuild succeeds, it stops the
#    old server and starts fresh demo data (the old data is kept in backend/backups/, newest 5 only).
#    When the rebuild fails, the old version keeps running with its data, and the next start tries again.
# 3. Starts the app on port 8000 if it is not running.
# Wrapped in { } so bash reads the whole file before git pull can change it.
{
cd "$(dirname "$0")/.."
pidfile=/tmp/nutrisense.pid

if [ -z "$(git status --porcelain --untracked-files=no)" ]; then
  git pull --ff-only --quiet || echo "Could not get the latest code; using the code already here."
else
  echo "You have local changes, so the latest code was not downloaded (run: git pull)."
fi

stop_server() {
  if [ -f "$pidfile" ] && kill "$(cat "$pidfile")" 2>/dev/null; then
    for _ in $(seq 1 25); do kill -0 "$(cat "$pidfile")" 2>/dev/null || break; sleep 1; done
  else
    # Servers started by an older version of this script have no PID file.
    pkill -f "bin/uvicorn app.main:app" 2>/dev/null && sleep 2
  fi
  rm -f "$pidfile"
}

head=$(git rev-parse HEAD)
stamp=backend/web/.built-from
if [ "$(cat "$stamp" 2>/dev/null)" != "$head" ]; then
  echo "The code changed since the last build. Rebuilding (a few minutes)..."
  # The old version keeps running while the new one builds, so the link keeps working.
  if bash .devcontainer/setup.sh; then
    stop_server
    # Old demo data and its stored model may not match the new code: set them aside.
    if [ -f backend/nutrisense.db ]; then
      backup="backend/backups/$(date +%Y%m%d-%H%M%S)"
      mkdir -p "$backup"
      mv backend/nutrisense.db "$backup/"
      [ -d backend/model_store ] && mv backend/model_store "$backup/"
      echo "Started fresh demo data; the old data is in $backup"
    fi
    # Keep only the newest 5 backups (names are timestamps, so they sort by age).
    if [ -d backend/backups ]; then
      ls -1d backend/backups/*/ 2>/dev/null | sort | head -n -5 | while IFS= read -r old; do
        rm -rf -- "$old" && echo "Removed old backup $old"
      done
    fi
  else
    echo "Rebuild failed (see the messages above). The previous version keeps running with its data;"
    echo "the next start will try again, or run: bash .devcontainer/start.sh"
  fi
fi

cd backend
if curl -fs http://localhost:8000/api/health > /dev/null 2>&1; then
  echo "NutriSense is already running on port 8000."
  exit 0
fi
nohup setsid uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*' \
  --timeout-graceful-shutdown 20 > /tmp/nutrisense.log 2>&1 < /dev/null &
echo $! > "$pidfile"
for _ in $(seq 1 120); do
  if curl -fs http://localhost:8000/api/health > /dev/null 2>&1; then
    echo "NutriSense is running on port 8000. Open the Ports tab to get the link."
    exit 0
  fi
  sleep 2
done
echo "NutriSense did not start. The last lines of /tmp/nutrisense.log:"
tail -n 20 /tmp/nutrisense.log
exit 1
}
