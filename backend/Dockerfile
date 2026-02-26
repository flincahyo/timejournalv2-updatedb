# Base: Ubuntu 22.04 + Python 3.10 + Wine (i386)
FROM ubuntu:22.04

# Avoid prompts and force IPv4 for apt (fixes exit code 100 on many VPS)
ENV DEBIAN_FRONTEND=noninteractive
RUN echo 'Acquire::ForceIPv4 "true";' > /etc/apt/apt.conf.d/99force-ipv4

# Install Python, Wine and prerequisites
RUN dpkg --add-architecture i386 && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-dev \
    build-essential \
    libffi-dev \
    libssl-dev \
    wine64 \
    wine32:i386 \
    xvfb \
    wget \
    ca-certificates \
    libglib2.0-0 \
    libgomp1 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Fix python symlink
RUN ln -s /usr/bin/python3 /usr/bin/python

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

EXPOSE 8000

# Start Xvfb (virtual display for Wine) + backend
CMD Xvfb :99 -screen 0 1024x768x16 & \
    sleep 2 && \
    uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1
