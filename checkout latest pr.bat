@echo off
setlocal
cd /d "%~dp0"

set REPO=Sora-ciel/Arial

for /f "usebackq delims=" %%i in (`gh pr list --repo %REPO% --state open --limit 1 --json number --jq .[0].number`) do set "PR=%%i"

if not defined PR (
  echo ERROR: Could not read latest PR number.
  pause
  exit /b 1
)

set "PRBR=pr-%PR%"
set "TMP=refs/tmp/%PRBR%"

echo Latest open PR is #%PR% (%PRBR%)

REM 1) Fetch PR head into a temp ref (always overwrites safely)
git fetch origin pull/%PR%/head:%TMP%
if errorlevel 1 (
  echo ERROR: git fetch failed.
  pause
  exit /b 1
)

REM 2) If local branch doesn't exist, create it
git show-ref --verify --quiet refs/heads/%PRBR%
if errorlevel 1 (
  echo Creating branch %PRBR%...
  git branch %PRBR% %TMP%
)

REM 3) Switch to it
git checkout %PRBR%
if errorlevel 1 (
  echo ERROR: git checkout failed.
  pause
  exit /b 1
)

REM 4) Force-update it to the fetched PR head
git reset --hard %TMP%
if errorlevel 1 (
  echo ERROR: git reset failed.
  pause
  exit /b 1
)

echo Updated %PRBR% to latest PR head.
pause
