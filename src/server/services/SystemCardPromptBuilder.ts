import type { AnswerInput } from "@/server/repositories/QualificationRepository";
import { TaxonomyService, taxonomyService } from "@/domain/Taxonomy";

export type PromptInput = {
  systemName: string;
  systemVersion: string;
  company: string;
  description: string;
  targetUseCase: string;
  targetUsers: string;
  targetSystems: { category: string; subcategory: string }[];
  sectors: string[];
  answers: AnswerInput[];
};

export class SystemCardPromptBuilder {
  static readonly SYSTEM = `You are a regulatory-compliance writer producing AI system cards aligned with the EU AI Act.

You will receive structured metadata about an AI system, its classification (one or more target-system tags and one or more sector tags drawn from a controlled taxonomy), and a set of evaluator answers tagged with the AI Act article and question they respond to.

Respond with a single JSON object — no prose, no markdown fences — that exactly matches this schema:

{
  "overview": "<1-2 paragraph executive summary of what the system does and how it stands against the AI Act>",
  "findings": [
    {
      "article": "Article 10",
      "title": "Data & Data Governance",
      "summary": "<1 paragraph synthesizing the evaluator's answers for this article>",
      "points": ["<bullet 1>", "<bullet 2>"],
      "references": ["Article 10.2.b", ...]
    },
    { "article": "Article 12", "title": "Documentation & Logging", ... },
    { "article": "Article 13", "title": "Transparency", ... },
    { "article": "Article 14", "title": "Human Oversight", ... }
  ],
  "open_issues": ["<gap or unanswered area 1>", ...]
}

Rules:
- Be factual and concise. Do not invent details the evaluator did not provide.
- Include exactly four findings, in the order Article 10, 12, 13, 14.
- Quote the evaluator's wording where useful.
- Use 2-5 bullets per finding.
- Put unanswered or partially answered topics under "open_issues"; if all topics are covered, return an empty array.
- "references" is a list of AI Act article references touched by that finding.`;

  constructor(private readonly taxonomy: TaxonomyService = taxonomyService) {}

  buildUserPrompt(input: PromptInput): string {
    const lines: string[] = [];
    lines.push("## System metadata");
    lines.push(`- System name: ${input.systemName}`);
    lines.push(`- Version: ${input.systemVersion}`);
    lines.push(`- Provider: ${input.company}`);
    lines.push(`- Description: ${input.description}`);
    lines.push(`- Target use case: ${input.targetUseCase}`);
    lines.push(`- Target users: ${input.targetUsers}`);
    lines.push(
      `- Target systems: ${
        input.targetSystems
          .map((t) => `${t.category} / ${t.subcategory}`)
          .join("; ") || "none"
      }`,
    );
    lines.push(`- Sectors: ${input.sectors.join(", ") || "none"}`);
    lines.push("");

    const byTool = new Map<string, AnswerInput[]>();
    for (const a of input.answers) {
      const list = byTool.get(a.toolId) ?? [];
      list.push(a);
      byTool.set(a.toolId, list);
    }

    for (const toolId of [...byTool.keys()].sort()) {
      const tool = this.taxonomy.getTool(toolId);
      const answers = byTool.get(toolId)!;
      if (!tool) continue;
      lines.push(`## Evaluator answers — ${tool.article} (${tool.title})`);
      for (const a of answers) {
        const resolved = this.taxonomy.resolveQuestion(a.toolId, a.questionId);
        const questionText = resolved?.question.text ?? a.questionId;
        const refs = resolved?.section.ai_act_references ?? [];
        const category = resolved?.section.category;
        const refSuffix = refs.length ? ` [${refs.join(", ")}]` : "";
        const catPrefix = category ? `${category} — ` : "";
        lines.push(`- **${catPrefix}${questionText}**${refSuffix}`);
        lines.push(`  Answer: ${a.answer}`);
      }
      lines.push("");
    }

    lines.push(
      "Now produce the JSON object. Do not include any prose outside the JSON.",
    );
    return lines.join("\n");
  }
}

export const systemCardPromptBuilder = new SystemCardPromptBuilder();
