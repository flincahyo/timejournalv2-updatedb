# MT5 Bridge Server — Local Network Setup

Server Windows ringan yang menghubungkan MetaTrader 5 ke backend Linux (Coolify) via HTTP REST API di jaringan lokal.

## Arsitektur

```
[Windows Server/PC - jaringan lokal]    [Linux - Coolify - jaringan lokal]
  MetaTrader 5 Terminal                   Backend FastAPI
  + mt5_bridge/app.py          ←HTTP──→   (polling tiap 10 detik)
  (port 8765, IP lokal)
```

> ✅ Tidak perlu ngrok — kedua server di jaringan lokal yang sama.

---

## Prerequisites

- Windows 10/11 (64-bit)
- Python 3.11+ ([download](https://www.python.org/downloads/)) — **centang "Add Python to PATH"**
- MetaTrader 5 terinstall dan sudah bisa login ke broker

---

## Setup (Pertama Kali)

### Step 1 — Clone repo

```cmd
git clone https://github.com/flincahyo/timejournalv2-updatedb.git
cd timejournalv2-updatedb\mt5_bridge
```

### Step 2 — Generate API Key

```cmd
python -c "import secrets; print(secrets.token_urlsafe(24))"
```

Contoh output: `uJ9mK2xP8qRn5tL7wA3cB6dE`

**Simpan output ini** — akan dipakai di Step 3 dan di Coolify.

### Step 3 — Buat file `.env`

```cmd
copy .env.example .env
notepad .env
```

Isi file `.env`:
```env
MT5_BRIDGE_API_KEY=uJ9mK2xP8qRn5tL7wA3cB6dE
MT5_BRIDGE_HOST=0.0.0.0
MT5_BRIDGE_PORT=8765
```

### Step 4 — Install dependencies

Double-click **`install.bat`** atau:
```cmd
install.bat
```

---

## Menjalankan Bridge (Setiap Kali)

1. **Pastikan MetaTrader 5 sudah terbuka** dan login ke broker
2. Double-click **`run.bat`**

Script akan otomatis:
- Mendeteksi IP lokal Windows
- Membuka port 8765 di Windows Firewall
- Menjalankan bridge server
- Menampilkan URL yang perlu diset di Coolify

Contoh output:
```
Bridge URL: http://192.168.1.105:8765

Set di Coolify Environment Variables:
  MT5_BRIDGE_URL   = http://192.168.1.105:8765
  MT5_BRIDGE_API_KEY = uJ9mK2xP8qRn5tL7wA3cB6dE
```

### Verifikasi (dari SSH server Linux)

```bash
curl http://192.168.1.105:8765/health
```

Response yang benar:
```json
{ "status": "ok", "mt5_available": true, "active_connections": 0 }
```

---

## Setup Coolify

Di Coolify → service **backend** → **Environment Variables**:

| Variable | Contoh Value |
|---|---|
| `MT5_BRIDGE_URL` | `http://192.168.1.105:8765` |
| `MT5_BRIDGE_API_KEY` | `uJ9mK2xP8qRn5tL7wA3cB6dE` |

Klik **Redeploy** backend.

---

## Troubleshooting

| Masalah | Solusi |
|---|---|
| `mt5_available: false` | MetaTrader5 library belum install — jalankan `install.bat` |
| `Connection refused` | MT5 terminal belum dibuka / bridge belum jalan |
| `401 Unauthorized` | API key di `.env` ≠ API key di Coolify |
| Server tidak bisa reach Windows | Cek firewall, pastikan port 8765 open |
| IP Windows berubah | Set static IP di pengaturan jaringan Windows |

---

## Tips: Set Static IP di Windows

Agar IP Windows tidak berubah-ubah:

1. Buka **Settings → Network → Ethernet/WiFi → Properties**
2. Set **IP assignment: Manual**
3. Masukkan IP yang sama (misal `192.168.1.105`), Subnet mask `255.255.255.0`, Gateway `192.168.1.1`

---

## API Reference

| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/health` | Status bridge (tanpa auth) |
| `POST` | `/connect` | Connect MT5 |
| `GET` | `/trades?user_id=X` | History trades |
| `GET` | `/positions?user_id=X` | Live positions |
| `GET` | `/account?user_id=X` | Info akun |
| `DELETE` | `/disconnect?user_id=X` | Disconnect |

Header required: `x-api-key: YOUR_API_KEY`
