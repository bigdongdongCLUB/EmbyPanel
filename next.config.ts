import { execSync } from "node:child_process";
import type { NextConfig } from "next";

const allowedDevOrigins = [
  "http://localhost",
  "http://localhost:3000",
  "http://127.0.0.1",
  "http://127.0.0.1:3000",
  // LAN access (adjust if your host IP changes)
  "http://192.168.55.5",
  "http://192.168.55.5:3000",
  "https://192.168.55.5",
  "https://192.168.55.5:3000",
];

function toVersionString(count: number) {
  const major = Math.floor(count / 10000);
  const minor = Math.floor((count % 10000) / 100);
  const patch = count % 100;
  return `v${String(major).padStart(2, "0")}.${String(minor).padStart(2, "0")}.${String(patch).padStart(2, "0")}`;
}

function resolveAppVersion() {
  const fromEnv = (process.env.NEXT_PUBLIC_APP_VERSION || "").trim();
  if (fromEnv) return fromEnv;

  try {
    const count = Number(execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim());
    if (Number.isFinite(count) && count >= 0) return toVersionString(count);
  } catch {
    // ignore
  }
  return "v00.00.00";
}

const nextConfig: NextConfig = {
  // Suppress Next dev cross-origin warnings for LAN testing.
  allowedDevOrigins,
  env: {
    NEXT_PUBLIC_APP_VERSION: resolveAppVersion(),
  },
};

export default nextConfig;
