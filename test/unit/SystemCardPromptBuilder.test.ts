import { describe, it, expect } from "vitest";
import { SystemCardPromptBuilder } from "@/server/services/SystemCardPromptBuilder";
import type { TaxonomyService } from "@/domain/Taxonomy";

const fakeTaxonomy = {
  getTool: (id: string) =>
    id === "art10"
      ? { article: "Article 10", title: "Data & Governance" }
      : undefined,
  resolveQuestion: (_toolId: string, questionId: string) => ({
    question: { text: `Question ${questionId}?` },
    section: { ai_act_references: ["Article 10.2.b"], category: "Lawfulness" },
  }),
} as unknown as TaxonomyService;

describe("SystemCardPromptBuilder", () => {
  const builder = new SystemCardPromptBuilder(fakeTaxonomy);

  it("renders system metadata and classification", () => {
    const out = builder.buildUserPrompt({
      systemName: "Acme Vision",
      systemVersion: "1.0",
      company: "Acme",
      description: "A vision system.",
      targetUseCase: "Shelf scanning.",
      targetUsers: "Store staff.",
      targetSystems: [{ category: "Vision", subcategory: "Detection" }],
      sectors: ["Retail"],
      answers: [],
    });
    expect(out).toContain("## System metadata");
    expect(out).toContain("- System name: Acme Vision");
    expect(out).toContain("- Target systems: Vision / Detection");
    expect(out).toContain("- Sectors: Retail");
    expect(out).toContain("Now produce the JSON object");
  });

  it("groups evaluator answers under their tool with question text and refs", () => {
    const out = builder.buildUserPrompt({
      systemName: "X",
      systemVersion: "1",
      company: "C",
      description: "d",
      targetUseCase: "u",
      targetUsers: "t",
      targetSystems: [],
      sectors: [],
      answers: [{ toolId: "art10", questionId: "q1", answer: "Yes, fully." }],
    });
    expect(out).toContain(
      "## Evaluator answers — Article 10 (Data & Governance)",
    );
    expect(out).toContain("Lawfulness — Question q1?");
    expect(out).toContain("[Article 10.2.b]");
    expect(out).toContain("Answer: Yes, fully.");
  });

  it("exposes a SYSTEM prompt requiring four findings as JSON", () => {
    expect(SystemCardPromptBuilder.SYSTEM).toMatch(/JSON object/);
    expect(SystemCardPromptBuilder.SYSTEM).toMatch(/exactly four findings/);
  });
});
