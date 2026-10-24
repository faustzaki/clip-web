#!/usr/bin/env bash
# PM: restart backend :8000 dengan hot reload. Dipanggil lewat cmd agar glob tidak di-expand MSYS.
set -u
cd "$(dirname "$0")/.."
ROOT="$(pwd -W 2>/dev/null || pwd)"

for p in $(netstat -ano | grep ':8000 ' | grep LISTENING | awk '{print $5}' | sort -u); do
  taskkill /PID "$p" /F >/dev/null 2>&1 && echo "killed $p"
done
sleep 2

cmd.exe /c start "videoclip-backend" /min cmd /c "cd /d $ROOT && py -3.13 -m uvicorn server:app --host 127.0.0.1 --port 8000 --reload --reload-exclude work --reload-exclude clips --reload-exclude data --reload-exclude frontend --reload-exclude docs"

for i in $(seq 1 45); do
  sleep 1
  c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:8000/api/health || true)
  [ "$c" = "200" ] && { echo "backend siap (${i}s, hot reload aktif)"; exit 0; }
done
echo "backend TIDAK siap"; exit 1
