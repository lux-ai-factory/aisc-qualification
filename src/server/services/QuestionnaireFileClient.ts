/**
 * A questionnaire as a JSON file, and a questionnaire file read back.
 *
 * Both are the prefill service's job (POST /questionnaires/export and POST
 * /questionnaires/import, prefill/questionnaire_file.py), in Python and without a
 * model, so the writer and the reader live side by side. This carries the
 * questionnaire there and the file back, or the file there and its normalised
 * document back; nothing is stored here.
 *
 * It never throws: a service that is down, or not deployed, is a status and a
 * sentence for the person. A 4xx keeps the service's status and its detail.
 */
import type { AnnexPointId } from "@/domain/forms/annexPoints";
import { serviceTokenHeaders, serviceUrl } from "@/server/services/http";

export type QuestionnaireBundle = "references" | "self-contained";

/** One picked question as a file names it: its set version and question, and its wording. */
export type QuestionnaireFileItem = {
  setId: string;
  setName: string;
  setVersion: number;
  scope: string;
  localId: string;
  text?: string;
  citation?: string;
  required?: boolean;
  annexPoint?: AnnexPointId | string | null;
  groupLabel?: string | null;
};

/** What a questionnaire file is written from (spec T50). */
export type QuestionnaireFileInput = {
  name: string;
  description: string;
  version: number;
  blocks: string[];
  items: QuestionnaireFileItem[];
};

/** A questionnaire file as the service reads it back (spec T51): normalised. */
export type QuestionnaireFile = {
  bundle: QuestionnaireBundle;
  name: string;
  description: string;
  version: number | null;
  blocks: string[];
  items: QuestionnaireFileItem[];
};

type Failure = { ok: false; status: number; error: string };

export type QuestionnaireWriteResult = { ok: true; filename: string; contentType: string; content: string } | Failure;
export type QuestionnaireReadResult = { ok: true; file: QuestionnaireFile } | Failure;

const UNAVAILABLE: Failure = { ok: false, status: 503, error: "Questionnaire files are not available on this install." };
const UNREACHABLE: Failure = { ok: false, status: 502, error: "The questionnaire file service could not be reached." };

/** A 4xx with a string detail keeps both; anything else is `fallback`. */
async function refused(response: Response, fallback: Failure): Promise<Failure> {
  if (response.status >= 400 && response.status < 500) {
    const detail = await response
      .json()
      .then((b) => (b as { detail?: unknown })?.detail)
      .catch(() => undefined);
    if (typeof detail === "string") return { ok: false, status: response.status, error: detail };
  }
  return fallback;
}

export class QuestionnaireFileClient {
  constructor(
    private readonly baseUrl: string = process.env.PREFILL_URL ?? "",
    private readonly fetchImpl: typeof fetch = fetch,
    /** This app's token for the prefill service: it refuses a caller without one. */
    private readonly serviceToken: string = process.env.QUALIFICATION_WEB_TO_PREFILL_TOKEN ?? "",
  ) {}

  async write(file: QuestionnaireFileInput, bundle: QuestionnaireBundle): Promise<QuestionnaireWriteResult> {
    if (!this.baseUrl) return UNAVAILABLE;
    let response: Response;
    try {
      response = await this.fetchImpl(serviceUrl(this.baseUrl, "/questionnaires/export"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...serviceTokenHeaders(this.serviceToken) },
        body: JSON.stringify({ bundle, questionnaire: file }),
        cache: "no-store",
      });
    } catch {
      return UNREACHABLE;
    }
    const failed: Failure = { ok: false, status: 502, error: "The questionnaire could not be exported." };
    if (!response.ok) return refused(response, failed);
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

  async read(file: File): Promise<QuestionnaireReadResult> {
    if (!this.baseUrl) return UNAVAILABLE;
    const body = new FormData();
    body.set("file", file);
    let response: Response;
    try {
      response = await this.fetchImpl(serviceUrl(this.baseUrl, "/questionnaires/import"), {
        method: "POST",
        headers: serviceTokenHeaders(this.serviceToken),
        body,
        cache: "no-store",
      });
    } catch {
      return UNREACHABLE;
    }
    const failed: Failure = { ok: false, status: 502, error: "The questionnaire file service gave an answer this could not read." };
    if (!response.ok) return refused(response, failed);
    let read: unknown;
    try {
      read = await response.json();
    } catch {
      return failed;
    }
    if (!read || typeof read !== "object" || !Array.isArray((read as { items?: unknown }).items)) return failed;
    return { ok: true, file: read as QuestionnaireFile };
  }
}

export const questionnaireFileClient = new QuestionnaireFileClient();
