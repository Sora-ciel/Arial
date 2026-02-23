@echo off
cd /d "C:\My programs\codex-pwa-main"

echo.
echo === Building project ===
call npm run build
if errorlevel 1 goto :fail

echo.
echo === Deploying to Firebase Hosting ===
call firebase deploy --only hosting
if errorlevel 1 goto :fail

echo.
echo === DEPLOY SUCCESS ===
pause
exit /b 0

:fail
echo.
echo === DEPLOY FAILED ===
pause
exit /b 1