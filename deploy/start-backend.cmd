@echo off
REM Collective Memory City - FastAPI backend launcher (ki-pc).
REM Runs uvicorn inside the `sharp` conda env so the `sharp` CLI (reconstruction)
REM and node (convert-splats) are on PATH for inline GPU reconstruction.
REM Self-restarts if the server exits, so a crash doesn't take the exhibition down.

call C:\ProgramData\miniconda3\Scripts\activate.bat sharp
cd /d D:\Yegor\Github\special-memory

:loop
echo [%date% %time%] starting backend on 127.0.0.1:8000
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
echo [%date% %time%] backend exited (code %errorlevel%); restarting in 3s...
timeout /t 3 /nobreak >nul
goto loop
