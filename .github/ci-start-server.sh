#!/usr/bin/env bash
# CI only: (re)start the API + web app on :8000 with a FRESH demo database, on the throwaway GitHub runner.
# Never use this on a shared dev machine: it binds port 8000.
#   bash .github/ci-start-server.sh <label>
# Needs: RUNNER_TEMP, GITHUB_WORKSPACE (set by GitHub Actions); NUTRISENSE_WEB_DIR and the other
# NUTRISENSE_* settings come from the job's env.
set -euo pipefail
label="${1:-run}"
: "${RUNNER_TEMP:?RUNNER_TEMP is not set: this script is for GitHub Actions only}"
: "${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is not set: this script is for GitHub Actions only}"

pidfile="$RUNNER_TEMP/server.pid"
if [ -f "$pidfile" ]; then
  kill "$(cat "$pidfile")" 2>/dev/null || true
  for _ in $(seq 1 20); do kill -0 "$(cat "$pidfile")" 2>/dev/null || break; sleep 0.5; done
  rm -f "$pidfile"
fi

data="$RUNNER_TEMP/data-$label"
rm -rf "$data" && mkdir -p "$data"
export NUTRISENSE_DATABASE_URL="sqlite:///$data/nutrisense.db"
export NUTRISENSE_MODEL_DIR="$data/models"
# A throwaway secret per run; never printed.
NUTRISENSE_JWT_SECRET="ci-$(openssl rand -hex 24)"
export NUTRISENSE_JWT_SECRET

log="$RUNNER_TEMP/server-$label.log"
cd "$GITHUB_WORKSPACE/backend"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 > "$log" 2>&1 &
echo $! > "$pidfile"

for _ in $(seq 1 90); do
  if curl -fsS http://localhost:8000/api/health > /dev/null 2>&1; then
    echo "Server up ($label)"
    exit 0
  fi
  if ! kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    echo "::error::The server exited during start-up ($label). Last lines of its log:"
    tail -n 50 "$log"
    exit 1
  fi
  sleep 2
done
echo "::error::The server did not answer /api/health within 180 s ($label). Last lines of its log:"
tail -n 50 "$log"
exit 1
