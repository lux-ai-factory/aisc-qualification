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
  // The document upload on a new qualification is a server action, and Next
  // refuses an action body over 1 MB by default. The prefill service takes
  // 10 MB (PREFILL_MAX_BYTES); the extra room is the form's other fields.
  experimental: { serverActions: { bodySizeLimit: "11mb" } },
};

export default nextConfig;
