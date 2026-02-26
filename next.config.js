/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // 'standalone' output needed for Docker production deployment
  // Creates a self-contained build in .next/standalone
  output: process.env.NODE_ENV === "production" ? "standalone" : undefined,
  env: {
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000",
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

module.exports = nextConfig;
