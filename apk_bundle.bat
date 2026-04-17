@echo off
setlocal

echo ================================
echo Build SvelteKit + Sync Capacitor
echo ================================
echo.

REM Go to the folder where this .bat file is located
cd /d "%~dp0"

REM 1) Build the web app
call npm run build
if errorlevel 1 (
    echo.
    echo [ERROR] npm run build failed.
    pause
    exit /b 1
)

REM 2) Sync web assets + native deps to Android
call npx cap sync android
if errorlevel 1 (
    echo.
    echo [ERROR] npx cap sync android failed.
    pause
    exit /b 1
)

echo.
echo [OK] Web build synced to Capacitor Android project.
echo.

REM 3) Open Android Studio project
call npx cap open android
if errorlevel 1 (
    echo.
    echo [WARNING] Could not open Android Studio automatically.
    echo You can open the /android folder manually.
    pause
    exit /b 0
)

echo.
echo Done.
pause