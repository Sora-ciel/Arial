@echo off
setlocal
cd /d "%~dp0"

echo === Installing dependencies...
call npm install
if errorlevel 1 goto :fail

echo.
echo === Building frontend (SvelteKit/Vite)...
call npm run build
if errorlevel 1 goto :fail

echo.
echo === Building Tauri app...
call npx tauri build
if errorlevel 1 goto :fail

echo.
echo === DONE ===
echo Installer is inside:
echo   src-tauri\target\release\bundle\
echo.
pause
exit /b 0

:fail
echo.
echo === FAILED (errorlevel %errorlevel%) ===
echo The command above failed. Read the error text.
echo.
pause
exit /b %errorlevel%