import { describe, it, expect } from "vitest";
import { releaseLabel, updateAnswersLabel } from "@/domain/SystemCard";

// Two numbers sit on a card and must not be confused: the AI card's own
// version (vN, one per save) and the release of the system it describes.

describe("the system's release, as shown", () => {
  it("reads System release and the number, without a v", () => {
    expect(releaseLabel("2.4.0")).toBe("System release 2.4.0");
  });

  it("drops the v a provider typed, so it never reads like a card version", () => {
    expect(releaseLabel("v2.4.0")).toBe("System release 2.4.0");
    expect(releaseLabel(" V1.0 ")).toBe("System release 1.0");
  });
});

describe("the button that opens the form again", () => {
  it("says which card version saving will make", () => {
    expect(updateAnswersLabel(3)).toBe("Update the answers (makes v4)");
  });

  it("with no card version yet it creates the AI card", () => {
    expect(updateAnswersLabel(0)).toBe("Create the AI card");
    expect(updateAnswersLabel(undefined)).toBe("Create the AI card");
  });
});
