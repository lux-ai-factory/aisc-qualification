import { describe, it, expect } from "vitest";
import {
  MARKET_FORMS,
  LOCALITIES,
  IMPACT_AREAS,
  AFFECTED,
  isMarketForm,
  isLocality,
  isImpactArea,
  isAffected,
  vocabLabel,
} from "@/data/airoVocab";

describe("airoVocab", () => {
  it("exposes the four picker groups with the agreed ids", () => {
    expect(MARKET_FORMS.map((e) => e.id)).toEqual([
      "product",
      "software",
      "service",
      "safety-component",
    ]);
    expect(LOCALITIES.map((e) => e.id)).toEqual([
      "workplace",
      "educational-setting",
      "publicly-accessible-space",
      "other",
    ]);
    expect(IMPACT_AREAS.map((e) => e.id)).toEqual([
      "health",
      "safety",
      "right",
      "freedom",
    ]);
    expect(AFFECTED.map((e) => e.id)).toEqual(["operator", "user"]);
  });

  it("validates ids per group", () => {
    expect(isMarketForm("service")).toBe(true);
    expect(isMarketForm("workplace")).toBe(false);
    expect(isLocality("other")).toBe(true);
    expect(isImpactArea("right")).toBe(true);
    expect(isAffected("user")).toBe(true);
    expect(isAffected("subject")).toBe(false);
  });

  it("resolves a label and falls back to the id", () => {
    expect(vocabLabel(IMPACT_AREAS, "right")).toBe("Fundamental rights");
    expect(vocabLabel(IMPACT_AREAS, "bogus")).toBe("bogus");
  });
});
