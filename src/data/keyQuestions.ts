// The questions surfaced on the qualification form. Self-contained: each entry
// carries its own plain-language text and a topic group for display. Answers are
// stored as (toolId = group, questionId = id) and the form field is
// `q:<group>:<id>`, keeping the existing storage/parse convention.

export type KeyQuestion = {
  /** Stable, unique within its group. Used as the stored questionId. */
  id: string;
  /** Topic group id. Used as the stored toolId and to organise the form. */
  group: string;
  /** Human label for the group. */
  groupLabel: string;
  /** Plain-language question shown to the user. */
  text: string;
};

export const KEY_QUESTIONS: KeyQuestion[] = [
  // ── Data & data governance ───────────────────────────────────────────────
  {
    id: "data-source",
    group: "data",
    groupLabel: "Data & data governance",
    text: "Where does the data used to train and test the system come from?",
  },
  {
    id: "data-bias",
    group: "data",
    groupLabel: "Data & data governance",
    text: "Has the data been checked for bias that could unfairly affect particular groups (for example by age, gender, or ethnicity)?",
  },
  {
    id: "data-quality",
    group: "data",
    groupLabel: "Data & data governance",
    text: "How do you keep the data accurate, complete, and up to date over time?",
  },

  // ── Documentation & logging ──────────────────────────────────────────────
  {
    id: "doc-records",
    group: "documentation",
    groupLabel: "Documentation & logging",
    text: "How is the system's development documented, including data sources, design choices, and versions?",
  },
  {
    id: "doc-logging",
    group: "documentation",
    groupLabel: "Documentation & logging",
    text: "What does the system record in its logs while running, and how long are those logs kept?",
  },

  // ── Transparency & instructions ──────────────────────────────────────────
  {
    id: "purpose-limits",
    group: "transparency",
    groupLabel: "Transparency & instructions",
    text: "What is the system's intended purpose, and what are its known limitations?",
  },
  {
    id: "instructions",
    group: "transparency",
    groupLabel: "Transparency & instructions",
    text: "What instructions are given to the people who deploy or operate the system?",
  },
  {
    id: "user-awareness",
    group: "transparency",
    groupLabel: "Transparency & instructions",
    text: "How are people told they are interacting with an AI system, and how its outputs should be understood?",
  },

  // ── Human oversight ──────────────────────────────────────────────────────
  {
    id: "human-control",
    group: "oversight",
    groupLabel: "Human oversight",
    text: "How can a person monitor the system, step in, or stop it while it is running?",
  },
  {
    id: "operator-training",
    group: "oversight",
    groupLabel: "Human oversight",
    text: "What training and support do the people overseeing the system receive?",
  },
  {
    id: "safe-fallback",
    group: "oversight",
    groupLabel: "Human oversight",
    text: "What does the system do when it meets a situation it cannot handle safely?",
  },

  // ── Risk & performance ───────────────────────────────────────────────────
  {
    id: "key-risks",
    group: "risk",
    groupLabel: "Risk & performance",
    text: "What are the main risks this system could pose to people, and how are they reduced?",
  },
  {
    id: "performance",
    group: "risk",
    groupLabel: "Risk & performance",
    text: "How is the system's accuracy and reliability measured, and what were the results?",
  },

  // ── Accountability ───────────────────────────────────────────────────────
  {
    id: "responsibility",
    group: "accountability",
    groupLabel: "Accountability",
    text: "Who is responsible for the system once it is in use, and how can people report problems?",
  },
];

/** Ordered, de-duplicated topic groups, derived from KEY_QUESTIONS. */
export const KEY_QUESTION_GROUPS: { id: string; label: string }[] = (() => {
  const seen = new Set<string>();
  const groups: { id: string; label: string }[] = [];
  for (const q of KEY_QUESTIONS) {
    if (seen.has(q.group)) continue;
    seen.add(q.group);
    groups.push({ id: q.group, label: q.groupLabel });
  }
  return groups;
})();

/** The form field name for a question, e.g. `q:data:data-source`. */
export function keyQuestionField(q: KeyQuestion): string {
  return `q:${q.group}:${q.id}`;
}

export function isKeyQuestion(group: string, id: string): boolean {
  return KEY_QUESTIONS.some((k) => k.group === group && k.id === id);
}

export function resolveKeyQuestion(
  group: string,
  id: string,
): KeyQuestion | null {
  return KEY_QUESTIONS.find((k) => k.group === group && k.id === id) ?? null;
}

/** Set of valid `<group>:<id>` composite keys, for answer validation. */
export function keyQuestionIdSet(): Set<string> {
  return new Set(KEY_QUESTIONS.map((k) => `${k.group}:${k.id}`));
}
