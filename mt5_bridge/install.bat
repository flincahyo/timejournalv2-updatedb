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
echo [1/2] Installing Python dependencies...
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
    echo [2/2] Membuat file konfigurasi .env...
    copy .env.example .env
    echo.
    echo ================================================
    echo  LANGKAH SELANJUTNYA:
    echo.
    echo  1. Buka file .env dan ubah MT5_BRIDGE_API_KEY
    echo     dengan key yang kamu generate:
    echo.
    echo     python -c "import secrets; print(secrets.token_urlsafe(24))"
    echo.
    echo  2. Simpan .env lalu jalankan run.bat
    echo ================================================
) else (
    echo [2/2] File .env sudah ada.
)

echo.
echo ============================================
echo  Instalasi selesai! Jalankan run.bat
echo ============================================
pause
