/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // 'standalone' output needed for Docker production deployment
  output: process.env.NODE_ENV === "production" ? "standalone" : undefined,
  env: {
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000",
  },
  // Skip type-check and lint during Docker build to avoid SSH timeout in Coolify
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

module.exports = nextConfig;
