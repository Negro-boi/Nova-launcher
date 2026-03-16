@echo off
echo Nova Launcher Setup
echo ========================

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js is required. Download from: https://nodejs.org
    pause
    exit /b 1
)

echo Node.js found
echo Installing dependencies...
call npm install

echo.
echo Done! Starting Nova Launcher...
call npm start
