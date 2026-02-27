@echo off
title MT5 Bridge Server
echo ============================================
echo  MT5 Bridge Server - Starting...
echo ============================================
echo.

:: Load .env file
if exist .env (
    for /f "usebackq tokens=1,2 delims==" %%A in (".env") do (
        if not "%%A"=="" if not "%%A:~0,1%"=="#" set "%%A=%%B"
    )
) else (
    echo [WARN] File .env tidak ditemukan, menggunakan default.
    echo        Jalankan install.bat terlebih dahulu.
)

:: Default API key jika tidak di-.env
if "%MT5_BRIDGE_API_KEY%"=="" set MT5_BRIDGE_API_KEY=changeme_secret_key_123
if "%MT5_BRIDGE_PORT%"=="" set MT5_BRIDGE_PORT=8765

echo [INFO] Port: %MT5_BRIDGE_PORT%
echo [INFO] API Key: %MT5_BRIDGE_API_KEY%
echo.

:: Start MT5 Bridge server in background window
echo [1/2] Starting MT5 Bridge Server...
start "MT5 Bridge" cmd /k "python app.py && pause"

:: Wait for server to start
timeout /t 3 /nobreak >nul

:: Start ngrok if available
ngrok version >nul 2>&1
if not errorlevel 1 (
    echo [2/2] Starting ngrok tunnel...
    echo       Setelah ngrok terbuka, copy URL https://xxxx.ngrok-free.app
    echo       Masukkan ke Coolify env var: MT5_BRIDGE_URL=https://xxxx.ngrok-free.app
    echo.
    start "ngrok tunnel" cmd /k "ngrok http %MT5_BRIDGE_PORT% && pause"
    timeout /t 4 /nobreak >nul
    echo.
    echo =====================================================
    echo  Bridge running at: http://localhost:%MT5_BRIDGE_PORT%
    echo  Ngrok dashboard : http://localhost:4040
    echo  Health check    : http://localhost:%MT5_BRIDGE_PORT%/health
    echo.
    echo  NEXT: Salin URL ngrok dan set di Coolify:
    echo        Variable Name : MT5_BRIDGE_URL
    echo        Variable Value: https://xxxx.ngrok-free.app
    echo =====================================================
) else (
    echo [2/2] ngrok tidak ditemukan.
    echo.
    echo =====================================================
    echo  Bridge running at: http://localhost:%MT5_BRIDGE_PORT%
    echo  Health check    : http://localhost:%MT5_BRIDGE_PORT%/health
    echo.
    echo  Untuk akses dari internet, install ngrok:
    echo  https://ngrok.com/download
    echo  Atau gunakan IP lokal jika backend di network yang sama.
    echo =====================================================
)

echo.
pause
