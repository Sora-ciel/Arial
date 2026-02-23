@echo off
cd /d "C:\My programs\codex-pwa-main"

echo.
echo ===== FORCING LOCAL STATE TO REMOTE MAIN =====
echo.

git status

echo.
echo Adding all files...
git add -A

echo.
echo Creating commit...
git commit -m "Force sync local state"

echo.
echo Switching to main...
git branch -M main

echo.
echo Hard resetting main to current state...
git reset --hard HEAD

echo.
echo Force pushing to origin/main...
git push origin main --force

echo.
echo ===== DONE =====
pause