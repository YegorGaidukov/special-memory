@echo off
setlocal enabledelayedexpansion
REM Collective Memory City - update the server to the latest commit (ki-pc).
REM Pulls, installs deps only if the relevant lock/req files changed, ALWAYS rebuilds
REM the static frontend (web\out is git-ignored, so a frontend change is only live
REM after a rebuild), then restarts the stack. Run this in a normal terminal.

cd /d "%~dp0.."
echo === activating sharp env ===
call C:\ProgramData\miniconda3\Scripts\activate.bat sharp

echo === git pull ===
for /f %%i in ('git rev-parse HEAD') do set BEFORE=%%i
git pull --ff-only
if errorlevel 1 (
  echo.
  echo git pull failed ^(non-fast-forward or auth^) - resolve manually, then re-run.
  exit /b 1
)
for /f %%i in ('git rev-parse HEAD') do set AFTER=%%i

if "!BEFORE!"=="!AFTER!" (
  echo Already up to date. Rebuilding frontend anyway to be safe.
) else (
  echo Pulled !BEFORE:~0,8! -^> !AFTER:~0,8!
  git diff --name-only !BEFORE! !AFTER! > "%TEMP%\mc_changed.txt"
  echo --- changed files ---
  type "%TEMP%\mc_changed.txt"
  echo ---------------------

  findstr /c:"requirements-backend.txt" /c:"requirements-pipeline.txt" "%TEMP%\mc_changed.txt" >nul && (
    echo === python deps changed -^> pip install ===
    pip install -r requirements-backend.txt -r requirements-pipeline.txt
  )
  findstr /c:"web/package-lock.json" "%TEMP%\mc_changed.txt" >nul && (
    echo === web lockfile changed -^> npm ci ===
    pushd web
    call npm ci
    popd
  )
)

echo === rebuild static frontend (web\out) ===
pushd web
set STATIC_EXPORT=1
call npm run build
popd

echo === restart stack ===
call "%~dp0restart-stack.cmd"
echo === update complete ===
endlocal
