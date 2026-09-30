import { z } from "zod";

// What a filler agent is allowed to publish into `ontologyExtracted`.
//
// The column is read straight back into the Python builder on every card
// render, so this is the only gate between an agent and the graph. Strict: an
// unknown key is a silent no-op at best, and the builder refusing a bad term at
// render time would break the page rather than the request that caused it.
const LABEL_MAX = 60;

/** The flags the builder accepts; see airo_min/build.py REVIEW_FLAGS. */
const REVIEW_FLAGS = [
  "ungrounded",
  "inflated",
  "sentence",
  "unsupported-term",
  "uncovered",
  "inconsistent",
] as const;

// Prisma's InputJsonValue will not take `unknown`, and the record is opaque to
// us in any case: it is the agent's own account of the run, stored and handed
// back to whoever reads the card.
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const jsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);

const node = z
  .object({
    label: z.string().trim().min(1).max(LABEL_MAX),
    // Absent or null both mean "no term fits", which is a legitimate answer.
    // An empty string is neither, and usually means a template was not filled.
    vair: z.string().min(1).nullish(),
  })
  .strict();

// A curated name is a string, or a name an agent drafted together with the text it was
// written for: the builder applies that one only while the answer still reads the same.
const name = z.string().trim().min(1).max(LABEL_MAX);
const draftedName = z.object({ name, of: z.string().min(1) }).strict();

// A consistency finding: why, the quoted words, and the text of the node it was written for.
const note = z.object({ why: z.string(), quote: z.string(), of: z.string() }).strict();

const extracted = z
  .object({
    techniques: z.array(node).optional(),
    components: z.array(node).optional(),
    names: z.record(z.string(), z.union([name, draftedName])).optional(),
    types: z.record(z.string(), z.string().min(1)).optional(),
    flags: z.record(z.string(), z.array(z.enum(REVIEW_FLAGS)).min(1)).optional(),
    notes: z.record(z.string(), z.array(note)).optional(),
    /** The agent's own record of the run: rounds, findings, calls. */
    record: z.record(z.string(), jsonValue).optional(),
  })
  .strict();

export type Extracted = z.infer<typeof extracted>;

export type ParseResult =
  | { ok: true; value: Extracted }
  | { ok: false; error: string };

export function parseExtracted(input: unknown): ParseResult {
  const parsed = extracted.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  const first = parsed.error.issues[0];
  const where = first.path.length ? `${first.path.join(".")}: ` : "";
  return { ok: false, error: `${where}${first.message}` };
}
