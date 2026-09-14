import type { NextConfig } from "next";

// Optional path-prefix for platform routing (e.g. behind Caddy at /qualification).
// Empty/unset → served at the root (standalone or subdomain). Set NEXT_BASE_PATH
// at build time to deploy under a subpath; assets are prefixed to match.
const basePath = process.env.NEXT_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  // basePath only rewrites next/link and Next-owned assets — raw <a href> in
  // client components must prefix it themselves. Inline it into the client
  // bundle at build time so they can.
  env: { NEXT_PUBLIC_BASE_PATH: basePath || "" },
};

export default nextConfig;
