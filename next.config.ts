import type { NextConfig } from "next";

// Optional path prefix for platform routing (e.g. behind Caddy at /qualification).
// When NEXT_BASE_PATH is empty or unset the app is served at the root. Set it at
// build time to deploy under a subpath; assets get the same prefix.
const basePath = process.env.NEXT_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  // basePath only rewrites next/link and Next-owned assets: a raw <a href> in a
  // client component must add the prefix itself, so it is inlined into the
  // client bundle at build time.
  env: { NEXT_PUBLIC_BASE_PATH: basePath || "" },
  // The document upload on a new qualification is a server action, and Next
  // refuses an action body over 1 MB by default. The prefill service takes
  // 10 MB (PREFILL_MAX_BYTES); the extra room is the form's other fields.
  experimental: { serverActions: { bodySizeLimit: "11mb" } },
};

export default nextConfig;
