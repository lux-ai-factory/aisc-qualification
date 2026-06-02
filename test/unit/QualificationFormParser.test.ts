import { describe, it, expect } from "vitest";
import {
  QualificationFormParser,
  FormValidationError,
} from "@/server/forms/QualificationFormParser";
import type { TaxonomyService } from "@/domain/Taxonomy";

// Minimal taxonomy stub — only the methods the parser touches.
function fakeTaxonomy(
  overrides: Partial<TaxonomyService> = {},
): TaxonomyService {
  return {
    isValidTargetSystemTag: () => true,
    isValidSectorTag: () => true,
    validQuestionIds: () => new Set<string>(),
    ...overrides,
  } as unknown as TaxonomyService;
}

function validMetadata(): FormData {
  const fd = new FormData();
  fd.set("systemName", "Acme Vision");
  fd.set("systemVersion", "1.0");
  fd.set("company", "Acme");
  fd.set("description", "A vision system.");
  fd.set("targetUseCase", "Shelf scanning.");
  fd.set("targetUsers", "Store staff.");
  return fd;
}

describe("QualificationFormParser", () => {
  it("rejects blank metadata with its field message", () => {
    const fd = validMetadata();
    fd.set("systemName", "");
    const parser = new QualificationFormParser(fakeTaxonomy());
    expect(() => parser.parse(fd)).toThrow(FormValidationError);
    expect(() => parser.parse(fd)).toThrow(/System name is required/);
  });

  it("requires at least one target-system tag", () => {
    const fd = validMetadata();
    fd.append("sectorTags", "retail");
    const parser = new QualificationFormParser(fakeTaxonomy());
    expect(() => parser.parse(fd)).toThrow(/at least one target-system/);
  });

  it("requires at least one sector tag", () => {
    const fd = validMetadata();
    fd.append("targetSystemTags", "vision:detection");
    const parser = new QualificationFormParser(fakeTaxonomy());
    expect(() => parser.parse(fd)).toThrow(/at least one sector/i);
  });

  it("rejects an unknown target-system tag", () => {
    const fd = validMetadata();
    fd.append("targetSystemTags", "bogus");
    fd.append("sectorTags", "retail");
    const parser = new QualificationFormParser(
      fakeTaxonomy({ isValidTargetSystemTag: () => false }),
    );
    expect(() => parser.parse(fd)).toThrow(/Unknown target system tag: bogus/);
  });
});
