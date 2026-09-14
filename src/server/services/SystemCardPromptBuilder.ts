import type { AnswerInput } from "@/server/repositories/QualificationRepository";
import { KEY_QUESTION_GROUPS, resolveKeyQuestion } from "@/data/keyQuestions";

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
  static readonly SYSTEM = `You are a technical writer producing structured system cards for AI systems.

You will receive structured metadata about an AI system, its classification (one or more target-system tags and one or more sector tags drawn from a controlled taxonomy), and a set of answers grouped by topic.

Respond with a single JSON object — no prose, no markdown fences — that exactly matches this schema:

{
  "overview": "<1-2 paragraph executive summary of what the system does and its overall maturity>",
  "findings": [
    {
      "title": "<the topic area, e.g. Data & data governance>",
      "summary": "<1 paragraph synthesizing the answers for this topic>",
      "points": ["<bullet 1>", "<bullet 2>"]
    }
  ],
  "open_issues": ["<gap or unanswered area 1>", ...]
}

Rules:
- Be factual and concise. Do not invent details the answers did not provide.
- Produce one finding per topic area that has answers, using the topic name as the title, in the order the topics appear.
- Quote the respondent's wording where useful.
- Use 2-5 bullets per finding.
- Put unanswered or partially answered topics under "open_issues"; if all topics are covered, return an empty array.`;

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

    const byGroup = new Map<string, AnswerInput[]>();
    for (const a of input.answers) {
      const list = byGroup.get(a.toolId) ?? [];
      list.push(a);
      byGroup.set(a.toolId, list);
    }

    // Emit groups in their canonical order, then any unrecognised groups.
    const orderedGroupIds = [
      ...KEY_QUESTION_GROUPS.map((g) => g.id).filter((id) => byGroup.has(id)),
      ...[...byGroup.keys()].filter(
        (id) => !KEY_QUESTION_GROUPS.some((g) => g.id === id),
      ),
    ];

    for (const groupId of orderedGroupIds) {
      const answers = byGroup.get(groupId)!;
      const label =
        KEY_QUESTION_GROUPS.find((g) => g.id === groupId)?.label ?? groupId;
      lines.push(`## Answers — ${label}`);
      for (const a of answers) {
        const question = resolveKeyQuestion(a.toolId, a.questionId);
        const questionText = question?.text ?? a.questionId;
        lines.push(`- **${questionText}**`);
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
