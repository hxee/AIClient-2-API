@echo off
chcp 65001 >nul
echo ============================================================
echo   Minimal OpenAI Proxy Server - Starting...
echo ============================================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo [Setup] node_modules not found, installing dependencies...
    echo.
    call npm install
    echo.
    echo [Setup] Dependencies installed successfully!
    echo.
)

REM Start the server
echo [Server] Starting Minimal OpenAI Proxy...
echo.
node src/api-server.js

pause
