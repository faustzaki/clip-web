@echo off
title clip-web — dev (backend :8000 + frontend :5173)
cd /d "%~dp0"

echo =========================================================
echo   clip-web  DEV
echo     backend  : http://127.0.0.1:8000   (hot reload)
echo     frontend : http://127.0.0.1:5173   (vite HMR)
echo   Tutup dua jendela ini untuk berhenti.
echo =========================================================

start "clip-web backend :8000" cmd /k "cd /d %~dp0 && py -3.13 -m uvicorn server:app --host 127.0.0.1 --port 8000 --reload --reload-exclude work --reload-exclude clips --reload-exclude data --reload-exclude frontend --reload-exclude docs"

timeout /t 3 /nobreak >nul
start "clip-web frontend :5173" cmd /k "cd /d %~dp0frontend && npm run dev"

timeout /t 6 /nobreak >nul
start "" http://127.0.0.1:5173

echo.
echo Dua jendela terbuka. Browser dibuka otomatis ke :5173.
echo Kalau layar kosong, tunggu 5 detik lalu refresh (vite masih kompilasi).
pause
