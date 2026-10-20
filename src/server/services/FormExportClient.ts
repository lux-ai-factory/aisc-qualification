/**
 * Writing a list of questions as a file (CSV or Markdown): a question-set
 * version, or a questionnaire version's questions.
 *
 * The writing is the prefill service's job (POST /forms/export), in Python and
 * without a model, so the importer and the exporter live side by side and a
 * file this writes reads back into the same questions. This carries the list
 * there and the file back.
 *
 * It never throws: a service that is down, or not deployed, is a status and a
 * sentence for the person.
 */
import type { AnnexPointId } from "@/domain/forms/annexPoints";
import { serviceTokenHeaders, serviceUrl } from "@/server/services/http";

/** What a file is written from: a name, a version number and its questions in order. */
export type QuestionList = {
  name: string;
  version: number;
  questions: { text: string; citation: string; required: boolean; annexPoint: AnnexPointId | string | null }[];
};

export type FormExportResult =
  | { ok: true; filename: string; contentType: string; content: string }
  | { ok: false; status: 502 | 503; error: string };

export class FormExportClient {
  constructor(
    private readonly baseUrl: string = process.env.PREFILL_URL ?? "",
    private readonly fetchImpl: typeof fetch = fetch,
    /** This app's token for the prefill service: it refuses a caller without one. */
    private readonly serviceToken: string = process.env.QUALIFICATION_WEB_TO_PREFILL_TOKEN ?? "",
  ) {}

  async write(list: QuestionList, format: "csv" | "md"): Promise<FormExportResult> {
    if (!this.baseUrl) {
      return { ok: false, status: 503, error: "Exporting forms is not available on this install." };
    }
    const body = JSON.stringify({
      format,
      form: {
        name: list.name,
        version: list.version,
        questions: list.questions.map(({ text, citation, required, annexPoint }) => ({
          text,
          citation,
          required,
          annexPoint,
        })),
      },
    });

    let response: Response;
    try {
      response = await this.fetchImpl(serviceUrl(this.baseUrl, "/forms/export"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...serviceTokenHeaders(this.serviceToken) },
        body,
        cache: "no-store",
      });
    } catch {
      return { ok: false, status: 502, error: "The form writer could not be reached." };
    }
    const failed = { ok: false as const, status: 502 as const, error: "The form could not be exported." };
    if (!response.ok) return failed;
    let written: unknown;
    try {
      written = await response.json();
    } catch {
      return failed;
    }
    const { filename, contentType, content } = (written ?? {}) as Record<string, unknown>;
    if (typeof filename !== "string" || typeof contentType !== "string" || typeof content !== "string") {
      return failed;
    }
    return { ok: true, filename, contentType, content };
  }
}

export const formExportClient = new FormExportClient();
