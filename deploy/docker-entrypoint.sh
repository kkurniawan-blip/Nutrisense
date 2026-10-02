#!/bin/sh
# Container start-up for the root Dockerfile (API + web app on one port).
#
# Secrets: pass NUTRISENSE_JWT_SECRET and NUTRISENSE_ENCRYPTION_KEY. Without them the API refuses to start
# in production, on purpose. Only throwaway demos (Hugging Face Space, Render demo) set
# NUTRISENSE_EPHEMERAL_SECRETS=1: then missing secrets are made up at random for this run, so every restart
# logs everyone out and any encrypted notes from an earlier run become unreadable. Never use it with real data.
set -eu

if [ "${NUTRISENSE_EPHEMERAL_SECRETS:-0}" = "1" ]; then
  if [ -z "${NUTRISENSE_JWT_SECRET:-}" ]; then
    NUTRISENSE_JWT_SECRET="$(python -c 'import secrets; print(secrets.token_hex(32))')"
    export NUTRISENSE_JWT_SECRET
    echo "NUTRISENSE_EPHEMERAL_SECRETS=1: made a random JWT secret for this run only (demo mode)."
  fi
  if [ -z "${NUTRISENSE_ENCRYPTION_KEY:-}" ]; then
    NUTRISENSE_ENCRYPTION_KEY="$(python -c 'import secrets; print(secrets.token_hex(32))')"
    export NUTRISENSE_ENCRYPTION_KEY
    echo "NUTRISENSE_EPHEMERAL_SECRETS=1: made a random encryption key for this run only (demo mode)."
  fi
fi

# exec: uvicorn becomes PID 1 and gets SIGTERM directly, so restarts and redeploys finish requests in flight.
# Proxy headers: Render and Hugging Face terminate HTTPS in front of the container. Set FORWARDED_ALLOW_IPS to
# the proxy's address range when you know it; '*' trusts any X-Forwarded-* header.
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" \
  --proxy-headers --forwarded-allow-ips="${FORWARDED_ALLOW_IPS:-*}" \
  --timeout-graceful-shutdown 20
