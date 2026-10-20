@echo off
title AutoClip Backend API (FastAPI)
cd /d "%~dp0"
echo ==============================================
echo   Starting AutoClip Backend on :8005 ...
echo ==============================================
python -m uvicorn server:app --host 127.0.0.1 --port 8005 --reload
pause
