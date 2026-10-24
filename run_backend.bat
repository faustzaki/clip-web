@echo off
title AutoClip Backend (FastAPI, hot reload)
cd /d "%~dp0"
echo ==================================================
echo   AutoClip Backend  :8000  --reload (hot reload)
echo   Simpan file .py -^> server muat ulang otomatis
echo ==================================================
py -3.13 -m uvicorn server:app --host 127.0.0.1 --port 8000 --reload --reload-exclude "work" --reload-exclude "clips" --reload-exclude "data" --reload-exclude "frontend" --reload-exclude "docs"
pause
