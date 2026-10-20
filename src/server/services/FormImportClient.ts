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
import { serviceTokenHeaders, serviceUrl } from "@/server/services/http";

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

    let response: Response;
    try {
      response = await this.fetchImpl(
        serviceUrl(this.baseUrl, "/forms/import"),
        {
          method: "POST",
          headers: serviceTokenHeaders(this.serviceToken),
          body,
          cache: "no-store",
        },
      );
    } catch {
      return { ok: false, error: "The form reader could not be reached." };
    }
    if (!response.ok) {
      const detail = await response
        .json()
        .then((b) => (b as { detail?: unknown }).detail)
        .catch(() => undefined);
      return {
        ok: false,
        error:
          typeof detail === "string"
            ? detail
            : `The form file could not be read (${response.status}).`,
      };
    }
    let read: {
      format: string;
      found: number;
      questions: Array<Omit<ImportedQuestion, "annexPoint"> & { annexPoint?: unknown }>;
      warnings?: string[];
    };
    try {
      read = await response.json();
    } catch {
      return {
        ok: false,
        error: "The form reader gave an answer this could not read.",
      };
    }
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
