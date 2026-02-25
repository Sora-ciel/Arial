@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title Tauri Build (MSI + NSIS)

REM Ensure devDependencies are available (Vite is usually in devDependencies)
set "NODE_ENV="
set "npm_config_production=false"

echo === Checking deps (vite) ===
if not exist "node_modules\.bin\vite.cmd" (
  echo Vite not found -> installing deps (including dev)...
  call npm install --include=dev || goto :fail
)

echo.
echo === Building Tauri (MSI + NSIS) ===
call npx tauri build --bundles msi,nsis || goto :fail

echo.
echo === DONE ===
echo Output folder:
echo   src-tauri\target\release\bundle\
echo.
pause
exit /b 0

:fail
echo.
echo === FAILED (%errorlevel%) ===
pause
exit /b %errorlevel%