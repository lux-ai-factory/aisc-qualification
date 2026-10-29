import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";

// The one-level /forms pages are gone: the library, builder, import and export live under
// /p/<project>/questionnaires and /p/<project>/question-sets, and nothing links to /forms.
// The prefill service's own POST /forms/import and /forms/export are a different thing and stay.

const OLD = "src/app/p/[project]/forms";

describe("the app has no /p/<project>/forms routes", () => {
  it("no page or route file is left under /p/<project>/forms", () => {
    const left = existsSync(OLD)
      ? readdirSync(OLD, { recursive: true }).map(String)
      : [];
    expect(left).toEqual([]);
  });

  it("the prefill service still serves /forms/import and /forms/export", () => {
    const app = readFileSync("services/prefill/app.py", "utf8");
    expect(app).toMatch(/@app\.post\("\/forms\/import"\)/);
    expect(app).toMatch(/@app\.post\("\/forms\/export"\)/);
  });
});
