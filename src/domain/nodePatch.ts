import { z } from "zod";
import type { NodePatch } from "./OntologyView";
import { hasNul, nulMessage } from "./forms/nulCharacter";

// A reviewer's correction to one node arrives from the browser, so its shape is not trusted:
// it is stored verbatim as the node's whole entry (ontology_patch, card_history and the ledger
// event's content), and Postgres jsonb refuses U+0000. Only the editor's four fields are kept,
// with their types, and a NUL or an over-long text is refused with a message naming the field.

/** Generous next to the editor's 60 characters: a generated name kept unchanged can be longer. */
const LABEL_MAX = 500;
const NOTE_MAX = 5000;
const NODE_ID_MAX = 200;

const text = (what: string, max: number) =>
  z
    .string({ invalid_type_error: `${what} must be text.` })
    .max(max, `${what} is longer than ${max} characters.`)
    .refine((v) => !hasNul(v), nulMessage(what));

const NODE_PATCH = z
  .object({
    label: text("The label", LABEL_MAX).refine(
      (v) => v.trim().length > 0,
      "The label is empty.",
    ),
    vair: z
      .string({
        invalid_type_error: "The vocabulary term must be text or none.",
      })
      .nullable(),
    note: text("The note", NOTE_MAX),
    termNotApplicable: z.boolean({
      invalid_type_error: "termNotApplicable must be true or false.",
    }),
  })
  .partial()
  .strict();

/** The correction, or the reason it is refused. */
export function parseNodePatch(
  nodeId: unknown,
  change: unknown,
):
  | { ok: true; nodeId: string; change: NodePatch }
  | { ok: false; error: string } {
  const id = text("The node id", NODE_ID_MAX).safeParse(nodeId);
  if (!id.success) return { ok: false, error: id.error.issues[0].message };
  const parsed = NODE_PATCH.safeParse(change);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const error =
      issue.code === "unrecognized_keys"
        ? `The change has a field the editor does not send: ${issue.keys.join(", ")}.`
        : issue.code === "invalid_type" && issue.path.length === 0
          ? "The change is not a correction."
          : issue.message;
    return { ok: false, error };
  }
  return { ok: true, nodeId: id.data, change: parsed.data };
}
