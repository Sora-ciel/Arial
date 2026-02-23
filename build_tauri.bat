@echo off
cd /d "%~dp0"

echo Installing dependencies...
npm install
if errorlevel 1 exit /b 1

echo Building frontend (Vite)...
npm run build
if errorlevel 1 exit /b 1

echo Building Tauri app...
npx tauri build
if errorlevel 1 exit /b 1

echo.
echo Done.
echo Installer is inside:
echo src-tauri\target\release\bundle\
pause