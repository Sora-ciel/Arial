@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title Tauri Build (MSI + NSIS)

set "RC=0"

REM Keep devDependencies available
set "NODE_ENV="
set "npm_config_production=false"

echo.
echo === Checking deps (vite) ===

if not exist "node_modules\.bin\vite.cmd" (
    echo Vite not found - installing deps...
    call npm install --include=dev
    if errorlevel 1 (
        set "RC=%errorlevel%"
        echo.
        echo npm install failed with code %RC%
        goto :end
    )
)

echo.
echo === Building Tauri (MSI + NSIS) ===

call npx tauri build --bundles msi,nsis
set "RC=%errorlevel%"

if not "%RC%"=="0" (
    echo.
    echo === FAILED with code %RC% ===
    goto :end
)

echo.
echo === DONE ===
echo Output folder:
echo   src-tauri\target\release\bundle\

:end
echo.
echo Press any key to close...
pause >nul
exit /b %RC%