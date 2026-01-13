@echo off
echo ========================================
echo    RentUFS - Windows Setup Script
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo Please download and install Node.js from: https://nodejs.org/
    echo After installation, run this script again.
    pause
    exit /b 1
)

echo [OK] Node.js is installed
node --version
echo.

REM Check if npm is installed
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm is not installed!
    pause
    exit /b 1
)

echo [OK] npm is installed
npm --version
echo.

echo Step 1: Installing backend dependencies...
echo ========================================
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install backend dependencies
    pause
    exit /b 1
)
echo [OK] Backend dependencies installed
echo.

echo Step 2: Installing frontend dependencies...
echo ========================================
cd client
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install frontend dependencies
    pause
    exit /b 1
)
cd ..
echo [OK] Frontend dependencies installed
echo.

echo Step 3: Checking .env file...
echo ========================================
if exist .env (
    echo [OK] .env file exists
) else (
    echo [WARNING] .env file not found! Creating one...
    (
        echo # MongoDB Configuration
        echo MONGODB_URI=mongodb+srv://Rentufs7777:Rentufs7777@rentufs.rnvf89v.mongodb.net/rentufs?appName=RentUFS
        echo.
        echo # JWT Secret
        echo JWT_SECRET=your_secure_jwt_secret_key_change_this_in_production_8f7a9b4c2e1d6f3a
        echo.
        echo # Server Configuration
        echo PORT=5000
        echo NODE_ENV=development
        echo.
        echo # Client URL
        echo CLIENT_URL=http://localhost:3000
    ) > .env
    echo [OK] .env file created
)
echo.

echo ========================================
echo    Setup Complete!
echo ========================================
echo.
echo Your RentUFS application is ready to run!
echo.
echo To start the application, run:
echo     start-windows.bat
echo.
echo Or manually run:
echo     npm run dev
echo.
echo The application will open at:
echo     http://localhost:3000
echo.
pause
