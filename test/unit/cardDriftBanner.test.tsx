import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CardDriftBanner from "@/app/p/[project]/qualify/[id]/CardDriftBanner";
import { READS_ONLY } from "@/server/access/readsOnly";

const P = "a1b2c3d4-0000-4000-8000-000000000002";
const drift = {
  removed: [
    { componentPid: "m1", airoProperty: "hasModel", name: "Scorer", componentType: "model", objectName: "m.pkl" },
  ],
  added: [{ pid: "d1", name: "Holdout", component_type: "dataset", data: "h.csv" }],
  changed: [{ pid: "m2", name: "Ranker", component_type: "model", data: "r2.pkl" }],
};
const none = { removed: [], added: [], changed: [] };

describe("the card drift banner", () => {
  it("is a details closed by default, counting the changes in its summary", () => {
    const html = renderToStaticMarkup(<CardDriftBanner project={P} drift={drift} readsOnly={false} />);
    expect(html).toMatch(/<details(?![^>]*\bopen\b)/);
    expect(html).toContain(
      "<summary>The engine&#x27;s components no longer match this card (3 changes)</summary>",
    );
  });

  it("lists added, removed and changed, and links to the next version", () => {
    const html = renderToStaticMarkup(<CardDriftBanner project={P} drift={drift} readsOnly={false} />);
    expect(html).toContain("removed: Scorer");
    expect(html).toContain("added: Holdout");
    expect(html).toContain("changed: Ranker");
    expect(html).toContain(`href="/p/${P}/system/edit"`);
    expect(html).toContain("Start the next version");
  });

  it("says the caller only reads, instead of linking, for a reader", () => {
    const html = renderToStaticMarkup(<CardDriftBanner project={P} drift={drift} readsOnly />);
    expect(html).toContain(READS_ONLY.replace(/'/g, "&#x27;"));
    expect(html).not.toContain("Start the next version");
  });

  it("renders nothing with no drift", () => {
    expect(renderToStaticMarkup(<CardDriftBanner project={P} drift={none} readsOnly={false} />)).toBe("");
  });
});
