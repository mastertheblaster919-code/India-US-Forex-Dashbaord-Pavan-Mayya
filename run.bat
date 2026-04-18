@echo off
title VCP Dashboard India
color 0A

echo ============================================
echo   VCP Dashboard India - Launcher
echo ============================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Install Python 3.11+ and add to PATH.
    pause
    exit /b 1
)

:: Check Node
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install Node.js 18+ and add to PATH.
    pause
    exit /b 1
)

:: Install backend dependencies if needed
echo [1/4] Checking backend dependencies...
pip show fastapi >nul 2>&1
if errorlevel 1 (
    echo       Installing backend dependencies...
    pip install -r backend\requirements.txt
)

:: Install frontend dependencies if needed
echo [2/4] Checking frontend dependencies...
if not exist "frontend\node_modules" (
    echo       Installing frontend dependencies...
    cd frontend
    npm install
    cd ..
)

:: Start backend
echo [3/4] Starting backend on port 6001...
start "VCP Backend" cmd /k "cd backend && python -m uvicorn main:app --host 0.0.0.0 --port 6001 --reload"

:: Wait for backend to start
timeout /t 3 /nobreak >nul

:: Start frontend
echo [4/4] Starting frontend on port 3000...
start "VCP Frontend" cmd /k "cd frontend && npm run dev"

:: Wait for frontend to start
timeout /t 4 /nobreak >nul

echo.
echo ============================================
echo   Dashboard is running!
echo.
echo   Frontend:  http://localhost:3000
echo   Backend:   http://localhost:6001
echo.
echo   Close both terminal windows to stop.
echo ============================================
echo.

:: Open browser
start http://localhost:3000

pause
