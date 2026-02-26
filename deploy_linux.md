# Linux (Debian) Deployment Guide for MT5 Integration

This project uses **Wine** inside a Docker container to run the `MetaTrader5` Python library on Linux. Because MT5 requires a Windows environment, follow these steps to set up your server correctly via **Coolify** or manual Docker Compose.

## 1. Prerequisites on Linux Server
Ensure you have the following installed on your Debian host:
- Docker & Docker Compose
- (Optional) Git

## 2. Coolify Configuration
In Coolify, create a new project and select **Docker Compose**. 
- **Source**: Your GitHub repository (`flincahyo/timejournalv2-updatedb.git`)
- **Type**: Docker Compose

> [!IMPORTANT]
> **WAJIB: Ganti Build Pack ke "Docker"**
> Secara default, Coolify menggunakan "Nixpacks" yang tidak mendukung Wine. Anda **WAJIB** menggantinya ke Docker agar `Dockerfile` saya dijalankan.
> 
> **Cara Ganti:**
> 1. Buka resource **Docker Compose** Anda di Coolify.
> 2. Klik menu **General** atau **Configuration**.
> 3. Cari bagian **Build Pack**. Ubah dari "Nixpacks" menjadi **Docker** atau **Docker Compose**.
> 4. Klik **Save** dan lakukan **Redeploy**.

### Langkah-langkah Detail Input Environment Variables di Coolify:

1.  Buka dashboard **Coolify**.
2.  Pilih **Project** kamu, lalu pilih **Resource** yang baru dibuat.
3.  Klik tab **Environment Variables** di menu sebelah kiri.
4.  Klik tombol **Developer view** (di samping tombol `+ Add`). Ini akan membuka kotak teks besar.
5.  Paste daftar di bawah ini ke dalam kotak tersebut.
6.  Klik tombol **Save** atau **Update**.
7.  **PENTING**: Setelah di-save, pastikan centang opsi **Build Time** muncul/aktif untuk variabel `NEXT_PUBLIC_BACKEND_URL` agar Next.js bisa membaca URL backend saat proses build.

### Daftar Environment Variables (Copy & Paste):

```env
# ── Database Setup ──────────────────
POSTGRES_USER=timejournal
POSTGRES_PASSWORD=ganti_dengan_bebas_tanpa_spasi
POSTGRES_DB=timejournal
# URL ini otomatis mendeteksi container postgres di dalam network docker
DATABASE_URL=postgresql+asyncpg://timejournal:ganti_dengan_bebas_tanpa_spasi@postgres:5432/timejournal

# ── Auth & Security ─────────────────
# Gunakan 32 karakter random (bebas)
JWT_SECRET_KEY=masukkan_32_karakter_bebas_acak_disini
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# ── Connections ──────────────────────
# Isi dengan domain dashboard kamu (misal: https://journal.flincahyo.com)
# Jika belum punya domain, pakai IP server: http://IP_SERVER_KAMU
NEXT_PUBLIC_BACKEND_URL=http://backend:8000
ALLOWED_ORIGINS=*

# ── MetaTrader 5 (Wine) ──────────────
# Lokasi file MT5 setelah di-install lewat terminal nanti
MT5_TERMINAL_PATH=C:\Program Files\MetaTrader 5\terminal64.exe

# ── AI Features (Optional) ───────────
XAI_API_KEY=xai-masukkan-key-kamu-disini
```

---

## 3. Persistent Storage (SANGAT PENTING!)
Agar instalasi MetaTrader 5 kamu tidak hilang setiap kali server restart atau update code, kamu harus memastikan volume `wine_prefix` bersifat **Persistent**.

Di Coolify:
1. Buka tab **Storage**.
2. Pastikan ada baris untuk: `wine_prefix` -> `/root/.wine`.
3. Jika Coolify meminta path host, arahkan ke folder di server kamu, misal: `/var/lib/docker/volumes/timejournal_wine_prefix`.

---

## 4. Cara Install MT5 Tanpa Layar (Headless)
Setelah status semua container **Running (Healthy)**:

1. **Method A: Copy from Windows (Recommended)**
   - Zip your `C:\Users\<User>\.wine\drive_c\Program Files\MetaTrader 5` folder from a local Windows machine (or another Wine setup).
   - Upload and extract it to the server's volume path (usually `/var/lib/docker/volumes/timejournal_wine_prefix/_data/drive_c/Program Files/`).
   
2. **Method B: Interactive Shell**
   - Run the container once: `docker-compose up -d backend`.
   - Log into the container: `docker exec -it <backend_container_id> bash`.
   - Run: `wget https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe`.
   - Run: `wine mt5setup.exe /auto`.
   - Wait for it to finish (background).

## 4. Verification
Once deployed, check the backend logs:
```bash
docker logs <backend_container_id>
```
You should see: `MT5 worker started for user...`.

## 5. Troubleshooting
- **401 Unauthorized**: Ensure `JWT_SECRET_KEY` matches between frontend and backend.
- **MT5 Init Failed**: Check if `MT5_TERMINAL_PATH` points to the correct location inside Wine (e.g., `C:\Program Files\MetaTrader 5\terminal64.exe`).
- **Nginx Error**: If using Coolify's built-in proxy, you might need to disable the `nginx` service in `docker-compose.yml` to avoid port conflicts.
