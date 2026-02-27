@echo off
title MT5 Bridge - Install
echo ============================================
echo  MT5 Bridge Server - Windows Installer
echo ============================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python tidak ditemukan!
    echo Download Python 3.11+ dari https://www.python.org/downloads/
    echo Pastikan centang "Add Python to PATH" saat install.
    pause
    exit /b 1
)

echo [OK] Python ditemukan:
python --version

:: Install dependencies
echo.
echo [1/3] Installing Python dependencies...
pip install -r requirements.txt
if errorlevel 1 (
    echo [ERROR] Gagal install dependencies!
    pause
    exit /b 1
)
echo [OK] Dependencies installed.

:: Check if .env exists
if not exist .env (
    echo.
    echo [2/3] Membuat file konfigurasi .env...
    copy .env.example .env
    echo [OK] .env dibuat dari .env.example
    echo.
    echo ================================================
    echo  PENTING: Edit file .env sebelum menjalankan!
    echo  Ubah MT5_BRIDGE_API_KEY ke nilai yang aman.
    echo ================================================
) else (
    echo [2/3] File .env sudah ada, lewati.
)

:: Check ngrok
echo.
echo [3/3] Mengecek ngrok...
ngrok version >nul 2>&1
if errorlevel 1 (
    echo [INFO] ngrok tidak ditemukan. Download dari https://ngrok.com/download
    echo        Setelah download, extract ngrok.exe ke folder ini atau tambahkan ke PATH.
    echo        Lalu daftar dan dapatkan authtoken dari https://dashboard.ngrok.com
) else (
    echo [OK] ngrok ditemukan.
)

echo.
echo ============================================
echo  Instalasi selesai!
echo  Jalankan run.bat untuk memulai server.
echo ============================================
pause
