@echo off
title MT5 Bridge Server
echo ============================================
echo  MT5 Bridge Server - Local Network Mode
echo ============================================
echo.

:: Load .env file
if exist .env (
    for /f "usebackq tokens=1,2 delims==" %%A in (".env") do (
        if not "%%A"=="" if not "%%A:~0,1%"=="#" set "%%A=%%B"
    )
) else (
    echo [WARN] File .env tidak ditemukan!
    echo        Jalankan install.bat terlebih dahulu.
    pause
    exit /b 1
)

if "%MT5_BRIDGE_API_KEY%"=="" set MT5_BRIDGE_API_KEY=changeme_secret_key_123
if "%MT5_BRIDGE_PORT%"=="" set MT5_BRIDGE_PORT=8765

:: Get local IP
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /R /C:"IPv4 Address"') do set LOCAL_IP=%%i
set LOCAL_IP=%LOCAL_IP: =%

echo [INFO] Port     : %MT5_BRIDGE_PORT%
echo [INFO] Local IP : %LOCAL_IP%
echo [INFO] Bridge   : http://%LOCAL_IP%:%MT5_BRIDGE_PORT%
echo.

:: Allow firewall rule (run as admin recommended)
echo [1/2] Setting up Windows Firewall rule...
netsh advfirewall firewall show rule name="MT5 Bridge" >nul 2>&1
if errorlevel 1 (
    netsh advfirewall firewall add rule name="MT5 Bridge" dir=in action=allow protocol=TCP localport=%MT5_BRIDGE_PORT% >nul 2>&1
    echo [OK] Firewall rule added for port %MT5_BRIDGE_PORT%
) else (
    echo [OK] Firewall rule already exists.
)

echo.
echo [2/2] Starting MT5 Bridge Server...
echo.
echo =====================================================
echo  Bridge URL: http://%LOCAL_IP%:%MT5_BRIDGE_PORT%
echo.
echo  Set di Coolify Environment Variables:
echo    MT5_BRIDGE_URL = http://%LOCAL_IP%:%MT5_BRIDGE_PORT%
echo    MT5_BRIDGE_API_KEY = %MT5_BRIDGE_API_KEY%
echo.
echo  Health Check: http://%LOCAL_IP%:%MT5_BRIDGE_PORT%/health
echo =====================================================
echo.

python app.py
pause
