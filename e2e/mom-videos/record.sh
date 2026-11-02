#!/bin/bash
# record.sh [feature keys...]: record the short portrait videos for mothers (one per feature) into ./out/.
# Needs: backend/.venv (pip install -r backend/requirements.txt), e2e/node_modules (npm ci), ffmpeg on PATH (or FFMPEG=...),
# and Chromium for Playwright (npx playwright install chromium, or CHROMIUM_PATH=...). See README.md.
set -u
HERE=$(cd "$(dirname "$0")" && pwd); REPO=$(cd "$HERE/../.." && pwd)
WORK=${WORK:-$HERE/work}; OUTDIR=$HERE/out; FFMPEG=${FFMPEG:-ffmpeg}; PY=$REPO/backend/.venv/bin/python
mkdir -p "$WORK" "$OUTDIR"
# 1. The web app with the presentation page, GSAP and the app's font beside it.
if [ ! -f "$WORK/web/index.html" ]; then
  (cd "$REPO/mobile" && EXPO_PUBLIC_SAME_ORIGIN_API=1 npx expo export --platform web --output-dir "$WORK/web") || exit 1
fi
cp "$HERE/mom-stage.html" "$WORK/web/"
[ -f "$WORK/web/gsap.min.js" ] || (cd "$WORK" && npm pack gsap@3.13.0 --silent && tar xzf gsap-3.13.0.tgz && cp package/dist/gsap.min.js web/)
mkdir -p "$WORK/web/fonts"; for w in 500Medium 600SemiBold 700Bold 800ExtraBold; do cp "$(find "$WORK/web/assets" -name "PlusJakartaSans_$w.*.ttf" | head -1)" "$WORK/web/fonts/PJS-$w.ttf"; done
# 2. A fresh demo database for every video (the videos change data).
start_server() {
  # Stop the previous server and wait until it is gone and port 8000 is free; never reuse an old database.
  if [ -f "$WORK/server.pid" ]; then old=$(cat "$WORK/server.pid"); kill "$old" 2>/dev/null
    for _ in $(seq 1 60); do kill -0 "$old" 2>/dev/null || break; sleep 0.5; done; kill -9 "$old" 2>/dev/null; rm -f "$WORK/server.pid"; fi
  for _ in $(seq 1 40); do curl -s -o /dev/null localhost:8000/api/health || break; sleep 0.5; done
  curl -s -o /dev/null localhost:8000/api/health && { echo "port 8000 is used by another server: stop it first"; return 1; }
  rm -rf "$WORK/db"; mkdir -p "$WORK/db"
  # A single backgrounded command, so $! is the server's own PID (not a wrapper shell's).
  (cd "$REPO/backend" || exit 1
   env NUTRISENSE_DATABASE_URL="sqlite:///$WORK/db/nutrisense.db" NUTRISENSE_MODEL_DIR="$WORK/db/models" NUTRISENSE_JWT_SECRET="local-$RANDOM$RANDOM$RANDOM" \
     NUTRISENSE_ENVIRONMENT=development NUTRISENSE_SEED_DEMO_DATA=true NUTRISENSE_ANTHROPIC_API_KEY="" NUTRISENSE_WEB_DIR="$WORK/web" \
     .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 > "$WORK/server.log" 2>&1 &
   echo $! > "$WORK/server.pid")
  for _ in $(seq 1 90); do
    kill -0 "$(cat "$WORK/server.pid")" 2>/dev/null || { tail -20 "$WORK/server.log"; return 1; }
    curl -fsS http://localhost:8000/api/health > /dev/null 2>&1 && return 0; sleep 2; done; return 1
}
ALL=$(cd "$HERE" && node momvid.mjs list 2>/dev/null | tail -1)
[ -z "$ALL" ] && { start_server || exit 1; ALL=$(cd "$HERE" && node momvid.mjs list | tail -1); }
for key in ${*:-$ALL}; do
  nn=$(printf "%02d" "$(echo $ALL | tr ' ' '\n' | grep -nx "$key" | cut -d: -f1)")
  rec="$WORK/rec/$key"; rm -rf "$rec"; mkdir -p "$rec"
  start_server || { echo "$nn $key: server did not start"; continue; }
  (cd "$HERE" && SLOW=${SLOW:-3} node momvid.mjs "$key" "$rec" > "$rec/log.txt" 2>&1)
  D=$(python3 -c "import json;print(round(json.load(open('$rec/beats.json'))[-1]['t']+0.3,2))" 2>/dev/null) || { echo "$nn $key: recording failed (see $rec/log.txt)"; continue; }
  "$FFMPEG" -v error -y -f concat -safe 0 -i "$rec/frames.txt" -vf "fps=30,format=yuv420p" -c:v libx264 -preset veryfast -crf 12 -t "$D" "$rec/fast.mp4"
  "$PY" -I "$HERE/mom_music.py" "$rec/beats.json" "$D" "$rec/music.wav" > /dev/null
  title=$(python3 -c 'import re,sys; m=re.search(r"\n  "+sys.argv[2]+r": \[\x27[^\x27]*\x27, \x27([^\x27]*)\x27", open(sys.argv[1]).read()); print(re.sub(r"[?]", "", m.group(1)).replace(" ", "-") if m else sys.argv[2])' "$HERE/momvid.mjs" "$key")
  "$FFMPEG" -v error -y -i "$rec/fast.mp4" -i "$rec/music.wav" -filter_complex "[0:v]fade=in:st=0:d=0.5,fade=out:st=$(python3 -c "print($D-0.8)"):d=0.8[v];[1:a]aresample=48000,loudnorm=I=-18:TP=-1.5:LRA=11,aresample=48000[a]" \
    -map "[v]" -map "[a]" -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p -r 30 -c:a aac -b:a 128k -ar 48000 -t "$D" -movflags +faststart "$OUTDIR/$nn-$title.mp4"
  echo "$nn $key ${D}s $(grep -E '^(OK|FAILED)|WARN' "$rec/log.txt" | tr '\n' ' ')"
  rm -rf "$rec/frames"
done
[ -f "$WORK/server.pid" ] && kill "$(cat "$WORK/server.pid")" 2>/dev/null
