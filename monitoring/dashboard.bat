@echo off
REM Arial monitoring dashboard.
REM
REM Served over http://localhost rather than opened as a file:// page, because
REM Firebase Auth only allows sign-in from an authorised domain and localhost
REM is on that list by default - file:// is not, and Google sign-in simply
REM refuses to complete from it.
REM
REM Nothing is deployed or built here. This only serves one static HTML file;
REM all the data comes straight from the Firebase project.

cd /d "%~dp0"
set "PORT=5055"

where python >nul 2>&1
if errorlevel 1 (
  echo Python was not found on PATH. Install it, or serve this folder any other
  echo way you like - it just needs to be reachable on http://localhost.
  pause
  exit /b 1
)

echo Serving the Arial monitoring dashboard on http://localhost:%PORT%/dashboard.html
echo Close this window to stop it.
start "" "http://localhost:%PORT%/dashboard.html"
python -m http.server %PORT% --bind 127.0.0.1
