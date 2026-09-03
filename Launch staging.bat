@echo off
setlocal
cd /d "%~dp0"

REM Runs the app against the arial-staging Firebase project instead of
REM production, on port 5174 so it can sit beside a normal `Launch app.bat`
REM on 5173 without either one taking the other's port. --strictPort in the
REM npm script makes a clash fail loudly rather than quietly moving to the
REM next free port, which is how you end up signed into production while
REM believing you are on staging.
REM
REM Reads .env.staging, which is not in the repo. If it is missing, the app
REM silently falls back to the production config in firebase.ts - so the
REM check below refuses to start rather than let that happen.
REM
REM Google sign-in works here: localhost is an authorised domain in Firebase
REM Auth by default, on any port.

if not exist ".env.staging" (
  echo.
  echo   .env.staging is missing, so this would run against PRODUCTION.
  echo.
  echo   Recreate it with:
  echo     firebase apps:sdkconfig web --project staging
  echo.
  pause
  exit /b 1
)

echo.
echo   Arial - STAGING  ^(project arial-staging^)
echo   http://localhost:5174
echo.
echo   Notes, themes and uploads here go to the staging project.
echo   Nothing you do in this window touches real users' data.
echo.

call npm run dev:staging
pause
