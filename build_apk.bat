@echo off
setlocal

echo ================================
echo Build SvelteKit + Sync Capacitor
echo ================================
echo.

REM Go to the folder where this .bat file is located
cd /d "%~dp0"

REM Gradle needs a temp directory it can open a unix-domain socket in, and
REM it cannot do that under the default one: the real path runs through the
REM Windows user folder, whose accented name breaks AF_UNIX path resolution,
REM so every gradle invocation dies with "Unable to establish loopback
REM connection" before it reaches a single task. Setting java.io.tmpdir is
REM not enough — the socket path follows these two variables.
if not exist "E:\gradle-tmp" mkdir "E:\gradle-tmp"
set "TEMP=E:\gradle-tmp"
set "TMP=E:\gradle-tmp"

REM The project compiles against Java 21. Android Studio uses its bundled
REM runtime and is fine, but a shell build follows JAVA_HOME — which points
REM at a 17 install here, and fails with "invalid source release: 21".
if exist "C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot\bin\javac.exe" (
    set "JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot"
)

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

REM 3) Assemble the signed release APK
pushd android
call gradlew.bat assembleRelease
if errorlevel 1 (
    popd
    echo.
    echo [ERROR] gradlew assembleRelease failed.
    pause
    exit /b 1
)
popd

echo.
echo [OK] APK at android\app\build\outputs\apk\release\app-release.apk
echo      Copy it to release\ as Austavia_^<version^>.apk before publishing.
echo.
pause
