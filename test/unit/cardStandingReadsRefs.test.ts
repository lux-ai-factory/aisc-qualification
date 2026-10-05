import { describe, it, expect, vi } from "vitest";
import { QualificationService } from "@/server/services/QualificationService";
import { transactional } from "../support/ledgerRepo";

// Where a card stands, and which card the next one starts from, need each card's id and version pid
// only: the full cards (answers, risks, links, components) of every version are not loaded for it
// (code review 2026-10-05). The one card a new version starts from is read on its own.
const version = (n: number) => ({
  pid: `v${n}`,
  number: n,
  project_id: "p",
  name: "MCAS",
  version: "1",
  provider: "LIST",
  description: null,
  created_at: "2026-10-05T00:00:00Z",
  created_by: "u",
});

function setup() {
  const platform = {
    listVersions: vi.fn(async () => [version(2), version(1)]),
  };
  const full = {
    id: "c2",
    systemId: "v2",
    questionnaireVersionId: null,
    answers: [],
    risks: [],
    systemComponents: [],
  };
  const repo = transactional({
    list: vi.fn(async () => {
      throw new Error("every full card was loaded");
    }),
    cardRefs: vi.fn(async () => [
      { id: "c2", systemId: "v2" },
      { id: "c1", systemId: "v1" },
    ]),
    find: vi.fn(async (id: string) => (id === "c2" ? full : null)),
  });
  const svc = new QualificationService(
    repo as never,
    { parse: () => ({}) } as never,
    platform as never,
  );
  return { svc, repo };
}

describe("card standing reads ids, not full cards", () => {
  it("standing", async () => {
    const { svc } = setup();
    const s = await svc.standing("mcas", { systemId: "v1" });
    expect(s.current).toBe(false);
    expect(s.currentCardId).toBe("c2");
  });

  it("currentCardId", async () => {
    expect(await setup().svc.currentCardId("mcas")).toBe("c2");
  });

  it("startingPoint reads the one card it starts from", async () => {
    const { svc, repo } = setup();
    const start = await svc.startingPoint("mcas");
    expect(start.next.fromCardId).toBe("c2");
    expect(start.initial).not.toBeNull();
    expect(repo.find).toHaveBeenCalledWith("c2");
  });
});
