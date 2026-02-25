import { execSync } from "node:child_process";
import type { NextConfig } from "next";

const allowedDevOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  // LAN access (adjust if your host IP changes)
  "http://192.168.55.5:3000",
];

function resolveAppVersion() {
  try {
    const count = Number(execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim());
    if (Number.isFinite(count) && count > 0) return `v00.00.${count}`;
  } catch {
    // ignore
  }
  return "v00.00.0";
}

const nextConfig: NextConfig = {
  // Suppress Next dev cross-origin warnings for LAN testing.
  allowedDevOrigins,
  env: {
    NEXT_PUBLIC_APP_VERSION: resolveAppVersion(),
  },
};

export default nextConfig;
