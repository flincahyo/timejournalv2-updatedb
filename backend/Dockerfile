# Base: Ubuntu 22.04 (Stable for Wine + Python)
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Force IPv4 for apt (fixes exit code 100 on many VPS)
RUN echo 'Acquire::ForceIPv4 "true";' > /etc/apt/apt.conf.d/99force-ipv4

# ── Step 0: Install Wine 9.x from WineHQ (Ubuntu repo only has old Wine 6) ──
RUN dpkg --add-architecture i386 && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    gnupg wget ca-certificates && \
    wget -qO- https://dl.winehq.org/wine-builds/winehq.key | \
    gpg --dearmor -o /etc/apt/trusted.gpg.d/winehq.key.gpg && \
    echo "deb [signed-by=/etc/apt/trusted.gpg.d/winehq.key.gpg] https://dl.winehq.org/wine-builds/ubuntu/ jammy main" \
    > /etc/apt/sources.list.d/winehq.list && \
    apt-get update && \
    apt-get install -y --install-recommends winehq-stable && \
    apt-get install -y --no-install-recommends \
    xvfb xauth \
    python3 python3-pip python3-dev build-essential \
    libglib2.0-0 libgomp1 unzip cabextract && \
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

# ── Step 3: Download & Extract MT5 Terminal zip (portable, no installer) ────
RUN mkdir -p "/root/.wine/drive_c/Program Files/MetaTrader 5" && \
    wget --no-check-certificate -q \
    "https://drive.usercontent.google.com/download?id=1HBOqa91b19buXsOHpjXMfNRUFXPEmrtz&export=download&confirm=t" \
    -O /tmp/mt5_terminal.zip && \
    unzip -q /tmp/mt5_terminal.zip -d "/root/.wine/drive_c/Program Files/MetaTrader 5/" && \
    rm /tmp/mt5_terminal.zip && \
    echo "MT5 files extracted:" && \
    ls "/root/.wine/drive_c/Program Files/MetaTrader 5/terminal64.exe"

EXPOSE 8000

# ── Startup: Xvfb + FastAPI (MT5 terminal launched by Python library) ────────
CMD Xvfb :99 -screen 0 1024x768x16 & \
    sleep 2 && \
    python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1
