import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Zod's schemas/ISO module cycle fails during Turbopack server initialization.
  // Let Node load the server package; client validation remains bundled.
  serverExternalPackages: ["zod"],
  allowedDevOrigins: ["127.0.0.1"],
  ...(process.env.SPECIALTY_MOCKUP_DIST_DIR
    ? { distDir: process.env.SPECIALTY_MOCKUP_DIST_DIR }
    : {}),
};

export default nextConfig;
