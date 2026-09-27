import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// A project has one AI system, edited and versioned; there is no "new
// qualification" to make. Every way into the form is "edit the system", and
// the old address only redirects there, so a link to it cannot come back
// unnoticed.

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

const OLD_FORM = "src/app/p/[project]/qualify/new/page.tsx";

describe("one AI system, edited", () => {
  it("nothing links to the old create-a-qualification form", () => {
    // a link or a redirect to it; the form's own components still live there
    const linking = sources("src").filter(
      (file) =>
        file !== OLD_FORM &&
        /(href=|redirect\(|push\()[^\n]*qualify\/new/.test(readFileSync(file, "utf8")),
    );
    expect(linking).toEqual([]);
  });

  it("the old address redirects to editing the system", () => {
    const page = readFileSync(OLD_FORM, "utf8");
    expect(page).toMatch(/redirect\(/);
    expect(page).toMatch(/system\/edit/);
  });

  it("no page offers a new qualification", () => {
    // what a person reads: the pages and components, not class names in code
    const offering = sources("src")
      .filter((file) => file.endsWith(".tsx"))
      .filter((file) =>
        /New qualification|Start a qualification|first qualification|Qualify an AI system/.test(
          readFileSync(file, "utf8"),
        ),
      );
    expect(offering).toEqual([]);
  });
});
