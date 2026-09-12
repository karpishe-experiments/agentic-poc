import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1"],
  ...(process.env.SPECIALTY_MOCKUP_DIST_DIR
    ? { distDir: process.env.SPECIALTY_MOCKUP_DIST_DIR }
    : {}),
};

export default nextConfig;
