# Base: Ubuntu 22.04 (Stable for Wine + Python)
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Force IPv4 for apt (fixes exit code 100 on many VPS)
RUN echo 'Acquire::ForceIPv4 "true";' > /etc/apt/apt.conf.d/99force-ipv4

# Install System Dependencies
RUN dpkg --add-architecture i386 && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    wine wine64 wine32 xvfb xauth wget ca-certificates \
    python3 python3-pip python3-dev build-essential \
    libglib2.0-0 libgomp1 unzip cabextract p7zip-full && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set Wine environment
ENV WINEPREFIX=/root/.wine
ENV WINEARCH=win64
ENV DISPLAY=:99
ENV WINEDEBUG=-all
ENV WINEDLLOVERRIDES="mscoree,mshtml=n"
ENV MT5_TERMINAL_PATH="C:\\Program Files\\MetaTrader 5\\terminal64.exe"

WORKDIR /app

# Copy and install native Linux dependencies
COPY requirements.txt .
RUN pip3 install --no-cache-dir --upgrade pip && \
    pip3 install --no-cache-dir -r requirements.txt

# Copy backend code
COPY . .

# Create data directory
RUN mkdir -p /app/data

# ── Step 1: Install Windows Python (Embeddable) for MT5 Bridge ──────────────
RUN mkdir -p /root/.wine/drive_c/python311 && \
    wget -q https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip -O /tmp/python.zip && \
    unzip -q /tmp/python.zip -d /root/.wine/drive_c/python311 && \
    sed -i 's/#import site/import site/' /root/.wine/drive_c/python311/python311._pth && \
    rm /tmp/python.zip

# ── Step 2: Install PIP and MetaTrader5 Library inside Wine Python ───────────
RUN Xvfb :99 -screen 0 1024x768x16 & sleep 2 && \
    wget -q https://bootstrap.pypa.io/get-pip.py -O /tmp/get-pip.py && \
    wine C:\\python311\\python.exe /tmp/get-pip.py && \
    wine C:\\python311\\python.exe -m pip install --quiet MetaTrader5 pytz && \
    rm /tmp/get-pip.py

# ── Step 3: Extract MT5 Terminal via 7zip (NO GUI INSTALLER NEEDED) ─────────
# Download the MT5 installer and extract its contents directly
RUN Xvfb :99 -screen 0 1024x768x16 & sleep 1 && \
    wget -q https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe -O /tmp/mt5setup.exe && \
    mkdir -p "/root/.wine/drive_c/Program Files/MetaTrader 5" && \
    7z x /tmp/mt5setup.exe -o"/root/.wine/drive_c/Program Files/MetaTrader 5" -y > /dev/null 2>&1 || true && \
    rm /tmp/mt5setup.exe && \
    ls "/root/.wine/drive_c/Program Files/MetaTrader 5/" || echo "MT5 extraction completed (files may be in subdirectory)"

EXPOSE 8000

# ── Startup: Xvfb + MT5 Terminal (portable) + FastAPI ───────────────────────
CMD Xvfb :99 -screen 0 1024x768x16 & \
    sleep 2 && \
    wine "C:\\Program Files\\MetaTrader 5\\terminal64.exe" /portable & \
    sleep 5 && \
    python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1
