@echo off
REM ServiceSphere - Quick Start for Windows

echo ================================
echo ServiceSphere - Quick Start
echo ================================
echo.

REM Check if Node.js is installed
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo * Node.js is not installed!
    echo. Please download from: https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo * Node.js is installed: %NODE_VERSION%
echo.

cd /d "%~dp0"

echo * Installing dependencies...
call npm install

if %errorlevel% neq 0 (
    echo * Failed to install dependencies
    pause
    exit /b 1
)

echo * Dependencies installed successfully!
echo.
echo * Starting backend server...
echo.
echo Don't forget to:
echo 1. Create database and tables (see SETUP.md)
echo 2. Update .env with your database password
echo 3. Open http://localhost:3000 in your browser
echo.

call npm start

pause
