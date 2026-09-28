#!/usr/bin/env bash
# Starts the app on port 8000 every time the codespace starts (does nothing if it is already running).
cd "$(dirname "$0")/../backend"
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
