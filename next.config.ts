import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Zod's schemas/ISO module cycle fails during Turbopack server initialization.
  // Let Node load the server package; client validation remains bundled.
  serverExternalPackages: ["zod"],
  allowedDevOrigins: ["127.0.0.1"],
  // Leave transport headroom so the image handler, not proxy truncation, enforces
  // its 20 MiB limit (including uploads without Content-Length).
  experimental: { proxyClientMaxBodySize: 32 * 1024 * 1024 },
};

export default nextConfig;
