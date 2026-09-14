// The questions surfaced on the qualification form, derived from EU AI Act
// Annex IV (technical documentation), points 1 and 2. Self-contained: each entry
// carries its own question text, its Annex IV citation, and a topic group for
// display. Answers are stored as (toolId = group, questionId = id) and the form
// field is `q:<group>:<id>`, keeping the existing storage/parse convention.
//
// Annex IV points 1 and 2 have 16 lettered sub-items; they compress to 14
// questions here:
//   - 1(a) keeps only the version-lineage part. The intended purpose, the
//     provider name and the version itself are already required metadata fields
//     on the form, so repeating them as free text would duplicate them.
//   - 1(d) and 1(e) merge: the forms the system is placed on the market in and
//     the hardware it runs on are one answer in practice.
//   - 1(g) and 1(h) merge: the Annex repeats "a basic description of the
//     user-interface provided to the deployer" verbatim under (h).
// Points 3 to 9 of Annex IV are not covered yet; adding them is a
// pure data edit to this file.

export type KeyQuestion = {
  /** Stable, unique within its group. Used as the stored questionId. */
  id: string;
  /** Topic group id. Used as the stored toolId and to organise the form. */
  group: string;
  /** Human label for the group. */
  groupLabel: string;
  /** The Annex IV sub-item this question comes from, shown to the user. */
  citation: string;
  /** Question shown to the user. */
  text: string;
  /**
   * True for the sub-items Annex IV itself qualifies with "where applicable" or
   * "where relevant". Optional questions may be left blank on the form and are
   * simply not stored.
   */
  optional?: boolean;
};

const GROUP_1 = {
  group: "annex-1",
  groupLabel: "About the system",
} as const;

const GROUP_2 = {
  group: "annex-2",
  groupLabel: "How the system was built",
} as const;

export const KEY_QUESTIONS: KeyQuestion[] = [
  // ── Annex IV(1) — general description ────────────────────────────────────
  {
    ...GROUP_1,
    id: "1a",
    citation: "Annex IV(1)(a)",
    text: "If this version replaces an earlier one, describe what changed and why. If it is the first release, state that.",
  },
  {
    ...GROUP_1,
    id: "1b",
    citation: "Annex IV(1)(b)",
    optional: true,
    text: "Does the system work together with hardware or software that is not part of it, such as cameras, third-party software, or another AI system? If so, describe how they connect.",
  },
  {
    ...GROUP_1,
    id: "1c",
    citation: "Annex IV(1)(c)",
    text: "Which versions of software or firmware does the system require in order to run, and what are your requirements for updates?",
  },
  {
    ...GROUP_1,
    id: "1de",
    citation: "Annex IV(1)(d)-(e)",
    text: "How is the system supplied to customers: built into a device, as a download, as an online service, or in some other form? And what computer or hardware does it need to run on?",
  },
  {
    ...GROUP_1,
    id: "1f",
    citation: "Annex IV(1)(f)",
    optional: true,
    text: "Is the system built into a physical product? If so, describe what that product looks like from the outside, any labels or markings on it, and how the parts are arranged inside. Indicate where the photographs or drawings are held.",
  },
  {
    ...GROUP_1,
    id: "1gh",
    citation: "Annex IV(1)(g)-(h)",
    text: "What does the system look like to the companies that use it, and what instructions do you provide to them?",
  },

  // ── Annex IV(2) — elements of the system and its development ────────────
  {
    ...GROUP_2,
    id: "2a",
    citation: "Annex IV(2)(a)",
    text: "How was the system built, step by step? Include any pre-trained models or third-party tools you started from, and describe how you used, connected or modified them.",
  },
  {
    ...GROUP_2,
    id: "2b",
    citation: "Annex IV(2)(b)",
    text: "How does the system work, and why was it built that way? Cover what it does internally to reach a result; the main choices you made and the assumptions behind them, including who the system is intended to be used on; what the system is trying to get right, and which inputs matter most to it; what its output looks like and how good that output is expected to be; and anything you had to trade off to make the system safer, fairer, more accurate, or easier for a person to oversee.",
  },
  {
    ...GROUP_2,
    id: "2c",
    citation: "Annex IV(2)(c)",
    text: "How do the parts of the system fit together and pass work to each other, and how much computing power did you use to build, train and test it?",
  },
  {
    ...GROUP_2,
    id: "2d",
    citation: "Annex IV(2)(d)",
    optional: true,
    text: "What data was the system trained on? Describe where it came from, how much of it there is, what it covers, how it was selected, how it was labelled, and how it was cleaned.",
  },
  {
    ...GROUP_2,
    id: "2e",
    citation: "Annex IV(2)(e)",
    text: "How can a person monitor the system, intervene, or stop it? And what does the system show the people using it so they can understand its results and judge how much to rely on them?",
  },
  {
    ...GROUP_2,
    id: "2f",
    citation: "Annex IV(2)(f)",
    optional: true,
    text: "Are there changes to the system or to its performance that you already plan to make, such as retraining on a regular schedule? If so, describe them and how you will keep the system safe and accurate as they happen.",
  },
  {
    ...GROUP_2,
    id: "2g",
    citation: "Annex IV(2)(g)",
    text: "How was the system tested, and what were the results? Describe the data you tested it on, how you measure whether it is accurate and whether it holds up in difficult conditions, whether you checked that it performs equally well for different groups of people, and where the dated and signed test records are held.",
  },
  {
    ...GROUP_2,
    id: "2h",
    citation: "Annex IV(2)(h)",
    text: "What measures are in place to keep the system secure against tampering, misuse and attack?",
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

/** The form field name for a question, e.g. `q:annex-1:1a`. */
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
