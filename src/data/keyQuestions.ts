// Curated subset of questions surfaced as required up-front in the qualification
// form. The remaining questions per tool stay optional in expandable sections.

export type KeyQuestion = { toolId: string; questionId: string };

export const KEY_QUESTIONS: KeyQuestion[] = [
  {
    toolId: "article-14-human-oversight",
    questionId: "human-oversight-measures-for-risk-mitigation-q07",
  },
  {
    toolId: "article-14-human-oversight",
    questionId: "deployer-implemented-oversight-measures-q11",
  },
  {
    toolId: "article-13-transparency",
    questionId: "system-description-and-intended-purpose-q05",
  },
  { toolId: "article-13-transparency", questionId: "instructions-for-use-ifu-q01" },
  { toolId: "article-12-logging", questionId: "governance-design-stage-q01" },
  { toolId: "article-12-logging", questionId: "development-stage-q03" },
  { toolId: "article-10-data-governance", questionId: "data-source-q01" },
  { toolId: "article-10-data-governance", questionId: "sufficiently-representative-q07" },
];

export function isKeyQuestion(toolId: string, questionId: string): boolean {
  return KEY_QUESTIONS.some(
    (k) => k.toolId === toolId && k.questionId === questionId,
  );
}
