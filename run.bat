@echo off
title clip-web
cd /d "%~dp0"
echo ====================================================
echo   Starting clip-web on http://127.0.0.1:8000
echo ====================================================
start "" "http://127.0.0.1:8000"
py -3.13 -m uvicorn server:app --host 127.0.0.1 --port 8000 --reload --reload-exclude work --reload-exclude clips --reload-exclude data --reload-exclude frontend --reload-exclude docs
pause
