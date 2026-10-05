import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

describe("next.config", () => {
  it("lets a document as large as the prefill service takes through a server action", () => {
    // The upload is a server action, and Next refuses an action body over 1 MB
    // unless told otherwise: most technical documentation as a PDF would never
    // reach the reader, which takes 10 MB (PREFILL_MAX_BYTES).
    const limit = nextConfig.experimental?.serverActions?.bodySizeLimit;
    expect(limit).toBeDefined();
    const [, amount, unit] =
      String(limit)
        .toLowerCase()
        .match(/^(\d+)\s*(kb|mb)$/) ?? [];
    const size = Number(amount) * (unit === "mb" ? 1024 * 1024 : 1024);
    expect(size).toBeGreaterThanOrEqual(10 * 1024 * 1024);
  });
});
