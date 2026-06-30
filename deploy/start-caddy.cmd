@echo off
REM Collective Memory City - Caddy launcher (ki-pc).
REM Serves the static frontend (web\out) and reverse-proxies the backend with auto-TLS.
REM Self-restarts if Caddy exits. Uses an absolute path to caddy.exe so it does not
REM depend on PATH (the stable copy lives in C:\Users\Yegor\bin).

set "CADDY=C:\Users\Yegor\bin\caddy.exe"
cd /d D:\Yegor\Github\special-memory

:loop
echo [%date% %time%] starting Caddy (HTTPS on 80/443)
"%CADDY%" run --config deploy\Caddyfile
echo [%date% %time%] caddy exited (code %errorlevel%); restarting in 3s...
timeout /t 3 /nobreak >nul
goto loop
