import type { NextConfig } from "next";

const allowedDevOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  // LAN access (adjust if your host IP changes)
  "http://192.168.55.5:3000",
];

const nextConfig: NextConfig = {
  // Suppress Next dev cross-origin warnings for LAN testing.
  allowedDevOrigins,
};

export default nextConfig;
