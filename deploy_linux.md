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

### Environment Variables
Configure these in the Coolify dashboard:
```env
POSTGRES_USER=timejournal
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=timejournal
DATABASE_URL=postgresql+asyncpg://timejournal:your_secure_password@postgres:5432/timejournal
JWT_SECRET_KEY=your_random_32_char_secret
XAI_API_KEY=your_xai_key
MT5_TERMINAL_PATH=C:\Program Files\MetaTrader 5\terminal64.exe
```

## 3. Persistent Storage (CRITICAL)
The MT5 terminal must be installed inside a **Wine Prefix**. This project uses a volume named `wine_prefix`.
In Coolify, ensure this volume is persistent so your MT5 installation isn't lost on restart.

### How to Install MT5 on the Server Headless:
Since the server has no GUI, the easiest way to "install" MT5 into the container's Wine volume is:

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
