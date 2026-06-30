@echo off
REM Collective Memory City - exhibition autostart (ki-pc).
REM Launches the backend and Caddy, each in its own minimized, self-restarting window.
REM A shortcut to this file lives in the user's Startup folder, so the whole stack
REM comes up on login (the kiosk account auto-logs in). Run it by hand any time to
REM (re)start everything.

start "memory-city-backend" /min cmd /c "D:\Yegor\Github\special-memory\deploy\start-backend.cmd"
start "memory-city-caddy"   /min cmd /c "D:\Yegor\Github\special-memory\deploy\start-caddy.cmd"
