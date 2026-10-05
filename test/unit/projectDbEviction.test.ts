import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Code review B2 (2026-10-05): the LRU cache disconnected the client it evicted at once, while a
// request could still be using it (or awaiting its migration). Prisma then reconnected it lazily,
// outside the map, so it was never closed and the 2 x 20 connection budget did not hold. An evicted
// client now leaves the map at once and is disconnected after a grace period longer than a request.

const clients: Array<{ url: string; $disconnect: ReturnType<typeof vi.fn> }> =
  [];
vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    url: string;
    $disconnect = vi.fn(async () => undefined);
    $queryRawUnsafe = vi.fn(async () => [{ ok: 1 }]);
    $use = vi.fn();
    constructor(o: { datasources: { db: { url: string } } }) {
      this.url = o.datasources.db.url;
      clients.push(this as never);
    }
  },
  Prisma: {},
}));

const pid = (n: number) =>
  `a1b2c3d4-0000-4000-8000-${String(n).padStart(12, "0")}`;
const migrate = { migrate: async () => undefined };

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("PROJECT_DATABASE_URL", "postgresql://u:p@db:5432/{database}");
  clients.length = 0;
});
afterEach(async () => {
  const m = await import("@/lib/projectDb");
  await m.closeProjectDatabases();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("evicting a project database client", () => {
  it("leaves the client connected for the grace period, then disconnects it", async () => {
    const m = await import("@/lib/projectDb");
    const first = await m.prismaFor(pid(1), migrate);
    for (let n = 2; n <= m.MAX_OPEN_PROJECTS + 1; n++)
      await m.prismaFor(pid(n), migrate);
    const evicted = first as unknown as {
      $disconnect: ReturnType<typeof vi.fn>;
    };
    expect(evicted.$disconnect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(m.EVICTION_GRACE_MS);
    expect(evicted.$disconnect).toHaveBeenCalledTimes(1);
  });

  it("opens a new client when an evicted project is asked for again", async () => {
    const m = await import("@/lib/projectDb");
    const first = await m.prismaFor(pid(1), migrate);
    for (let n = 2; n <= m.MAX_OPEN_PROJECTS + 1; n++)
      await m.prismaFor(pid(n), migrate);
    expect(await m.prismaFor(pid(1), migrate)).not.toBe(first);
  });

  it("the grace period is longer than a request", async () => {
    const m = await import("@/lib/projectDb");
    expect(m.EVICTION_GRACE_MS).toBeGreaterThanOrEqual(60_000);
  });
});
