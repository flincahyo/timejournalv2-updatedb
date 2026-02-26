# ── Backend Dockerfile with Wine + MT5 support ──────────────────────────────
# Base: Python 3.11 + Wine (i386) for running MetaTrader5 on Linux
FROM python:3.11-slim

# Install Wine prerequisites
RUN dpkg --add-architecture i386 && \
    apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    wine \
    wine32:i386 \
    wine64 \
    winetricks \
    wget \
    cabextract \
    xvfb \
    libglib2.0-0 \
    libgomp1 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set Wine environment
ENV WINEPREFIX=/root/.wine
ENV WINEARCH=win64
ENV DISPLAY=:99

WORKDIR /app

# Copy requirements first (caching layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY . .

# Create data directory for any file-based artifacts
RUN mkdir -p /app/data

# Note: MT5 terminal must be pre-installed into the Wine prefix.
# On first run, use the setup script or mount a pre-built WINEPREFIX.
# See deploy/setup_mt5_wine.sh for instructions.

EXPOSE 8000

# Start Xvfb (virtual display for Wine) + backend
CMD Xvfb :99 -screen 0 1024x768x16 & \
    sleep 2 && \
    uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1
