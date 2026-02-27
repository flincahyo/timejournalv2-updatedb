# Base: Ubuntu 22.04 (Stables for Wine + Python)
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Force IPv4 for apt (fixes exit code 100 on many VPS)
RUN echo 'Acquire::ForceIPv4 "true";' > /etc/apt/apt.conf.d/99force-ipv4

# Install Wine, Xvfb, and Python 3
RUN dpkg --add-architecture i386 && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    wine64 \
    wine32 \
    xvfb \
    xauth \
    wget \
    ca-certificates \
    python3 \
    python3-pip \
    python3-dev \
    build-essential \
    libglib2.0-0 \
    libgomp1 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set Wine environment
ENV WINEPREFIX=/root/.wine
ENV WINEARCH=win64
ENV DISPLAY=:99

WORKDIR /app

# Copy and install native Linux dependencies
COPY requirements.txt .
RUN pip3 install --no-cache-dir --upgrade pip && \
    pip3 install --no-cache-dir -r requirements.txt

# Copy backend code
COPY . .

# Create data directory
RUN mkdir -p /app/data

EXPOSE 8000

# Start virtual display + backend
CMD Xvfb :99 -screen 0 1024x768x16 & \
    sleep 2 && \
    python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1
