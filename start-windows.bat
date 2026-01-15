@echo off
echo ========================================
echo    Starting RentUFS Application
echo ========================================
echo.
echo Backend API will run on: http://localhost:5000
echo Frontend will run on: http://localhost:3000
echo.
echo Press Ctrl+C to stop the servers
echo.
echo ========================================
echo.

REM Start the application
call npm run dev
