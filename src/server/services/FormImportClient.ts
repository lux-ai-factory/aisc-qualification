/**
 * Reading a form file (CSV, Markdown or .docx) into questions.
 *
 * The reading is the prefill service's job (POST /forms/import), in Python and
 * without a model. This carries the file there and the questions back; nothing
 * is stored until the person saves the form in the builder.
 *
 * It never throws. A service that is down, or not deployed at all, means the
 * person builds the form by hand.
 */
import { isAnnexPoint, type AnnexPointId } from "@/domain/forms/annexPoints";
import { callService } from "@/server/services/http";

export type ImportedQuestion = {
  text: string;
  citation: string;
  required: boolean;
  /** The file's Annex IV point column: one of the 14, else null. */
  annexPoint: AnnexPointId | null;
};

export type FormImportResult =
  | {
      ok: true;
      /** "csv" | "md" | "docx" */
      format: string;
      /** how many questions were found */
      found: number;
      questions: ImportedQuestion[];
      /** what was skipped or shortened, for telling the person */
      warnings: string[];
    }
  | { ok: false; error: string };

/** Reading a large .docx takes a while: the call waits this long for it. */
const READ_TIMEOUT_MS = 60_000;

/** What POST /forms/import answers. */
type ImportAnswer = {
  format: string;
  found: number;
  questions: Array<Omit<ImportedQuestion, "annexPoint"> & { annexPoint?: unknown }>;
  warnings?: string[];
};

/** The answer, when it holds the format, the count and a list of questions with their text; else undefined. */
function importAnswer(raw: unknown): ImportAnswer | undefined {
  const a = raw as Partial<ImportAnswer> | null;
  if (!a || typeof a !== "object" || typeof a.format !== "string" || typeof a.found !== "number") {
    return undefined;
  }
  if (!Array.isArray(a.questions)) return undefined;
  const questionsRead = a.questions.every(
    (q) => q && typeof q === "object" && typeof (q as { text?: unknown }).text === "string",
  );
  return questionsRead ? (a as ImportAnswer) : undefined;
}

export class FormImportClient {
  constructor(
    private readonly baseUrl: string = process.env.PREFILL_URL ?? "",
    private readonly fetchImpl: typeof fetch = fetch,
    /** This app's token for the prefill service: it refuses a caller without one. */
    private readonly serviceToken: string = process.env.QUALIFICATION_WEB_TO_PREFILL_TOKEN ?? "",
  ) {}

  async read(file: File): Promise<FormImportResult> {
    if (!this.baseUrl) {
      return {
        ok: false,
        error: "Importing forms is not available on this install.",
      };
    }
    const body = new FormData();
    body.set("file", file);

    const answer = await callService({
      base: this.baseUrl,
      path: "/forms/import",
      method: "POST",
      token: this.serviceToken,
      body,
      timeoutMs: READ_TIMEOUT_MS,
      parse: importAnswer,
      fetchImpl: this.fetchImpl,
    });
    if (!answer.ok) {
      if (answer.status === null) return { ok: false, error: "The form reader could not be reached." };
      if (answer.status < 300) {
        return { ok: false, error: "The form reader gave an answer this could not read." };
      }
      return {
        ok: false,
        error: answer.shownDetail ?? `The form file could not be read (${answer.status}).`,
      };
    }
    const read = answer.value;
    return {
      ok: true,
      format: read.format,
      found: read.found,
      questions: read.questions.map(({ text, citation, required, annexPoint }) => ({
        text,
        citation,
        required,
        annexPoint: isAnnexPoint(annexPoint) ? annexPoint : null,
      })),
      warnings: read.warnings ?? [],
    };
  }
}

export const formImportClient = new FormImportClient();
