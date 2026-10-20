@echo off
title AutoClip Studio (Socl Visuals Engine)
cd /d "%~dp0"
echo ====================================================
echo   Starting AutoClip Studio on http://127.0.0.1:8005
echo ====================================================
start "" "http://127.0.0.1:8005"
python -m uvicorn server:app --host 127.0.0.1 --port 8005
pause
