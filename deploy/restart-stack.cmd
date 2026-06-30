@echo off
REM Collective Memory City - safe restart (ki-pc).
REM Stops the running stack FIRST (the self-restart loop windows AND their workers),
REM then starts it again via autostart.cmd. Use this instead of re-running
REM autostart.cmd by hand: the old loops keep holding ports 8000/80/443, so a bare
REM re-run would just fail to bind. This kills by command line / image, so it works
REM regardless of the console window titles.

echo Stopping memory-city stack...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and ($_.Name -eq 'caddy.exe' -or $_.CommandLine -match 'start-backend\.cmd' -or $_.CommandLine -match 'start-caddy\.cmd' -or $_.CommandLine -match 'uvicorn backend\.app') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
timeout /t 2 /nobreak >nul

echo Starting memory-city stack...
call "%~dp0autostart.cmd"
echo Done. Backend on 127.0.0.1:8000, Caddy on :80/:443.
