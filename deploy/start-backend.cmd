@echo off
REM Collective Memory City - FastAPI backend launcher (ki-pc).
REM Runs uvicorn inside the `sharp` conda env so the `sharp` CLI (reconstruction)
REM and node (convert-splats) are on PATH for inline GPU reconstruction.
REM Self-restarts if the server exits, so a crash doesn't take the exhibition down.

call C:\ProgramData\miniconda3\Scripts\activate.bat sharp
cd /d D:\Yegor\Github\special-memory

REM --forwarded-allow-ips: trust Caddy (same box) so the driving presence gate
REM (DRIVE_PRESENCE_CIDRS) sees each phone's real IP via X-Forwarded-For, not the proxy's.
:loop
echo [%date% %time%] starting backend on 127.0.0.1:8000
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --forwarded-allow-ips 127.0.0.1
echo [%date% %time%] backend exited (code %errorlevel%); restarting in 3s...
timeout /t 3 /nobreak >nul
goto loop
