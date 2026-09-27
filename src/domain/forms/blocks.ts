// The removable, non-question parts of the qualification form. A form version
// includes any subset of them; the identity fields are always there.

export const FORM_BLOCKS = [
  "description",
  "targetUseCase",
  "targetUsers",
  "intendedDeployers",
  "targetSystemTags",
  "sectorTags",
  "marketFormTags",
  "localityTags",
  "risks",
] as const;

export type FormBlock = (typeof FORM_BLOCKS)[number];

/** Always on the form: no form can drop them. */
export const IDENTITY_FIELDS = ["systemName", "systemVersion", "company"] as const;

export function isFormBlock(s: unknown): s is FormBlock {
  return typeof s === "string" && (FORM_BLOCKS as readonly string[]).includes(s);
}

/** The given blocks in FORM_BLOCKS order, without duplicates or unknown ids. */
export function inBlockOrder(blocks: readonly string[]): FormBlock[] {
  return FORM_BLOCKS.filter((b) => blocks.includes(b));
}
