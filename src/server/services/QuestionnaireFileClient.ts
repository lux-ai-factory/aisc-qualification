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
import { callService, type ServiceAnswer } from "@/server/services/http";

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

/** What a questionnaire file is written from. */
export type QuestionnaireFileInput = {
  name: string;
  description: string;
  version: number;
  blocks: string[];
  items: QuestionnaireFileItem[];
};

/** A questionnaire file as the service reads it back, normalised. */
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

/** No answer is UNREACHABLE; a 4xx with a reason keeps its status and the reason; anything else is `fallback`. */
function refused(answer: Extract<ServiceAnswer<unknown>, { ok: false }>, fallback: Failure): Failure {
  if (answer.status === null) return UNREACHABLE;
  if (answer.status >= 400 && answer.status < 500 && answer.shownDetail) {
    return { ok: false, status: answer.status, error: answer.shownDetail };
  }
  return fallback;
}

type Written = { filename: string; contentType: string; content: string };

/** The written file, when the answer names it, its type and its content. */
function writtenFile(raw: unknown): Written | undefined {
  const { filename, contentType, content } = (raw ?? {}) as Record<string, unknown>;
  if (typeof filename !== "string" || typeof contentType !== "string" || typeof content !== "string") return undefined;
  return { filename, contentType, content };
}

/** The document read back, when it has its list of items. */
function readFile(raw: unknown): QuestionnaireFile | undefined {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { items?: unknown }).items)) return undefined;
  return raw as QuestionnaireFile;
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
    const answer = await callService({
      base: this.baseUrl,
      path: "/questionnaires/export",
      method: "POST",
      token: this.serviceToken,
      body: { bundle, questionnaire: file },
      parse: writtenFile,
      fetchImpl: this.fetchImpl,
    });
    if (!answer.ok) {
      return refused(answer, { ok: false, status: 502, error: "The questionnaire could not be exported." });
    }
    return { ok: true, ...answer.value };
  }

  async read(file: File): Promise<QuestionnaireReadResult> {
    if (!this.baseUrl) return UNAVAILABLE;
    const body = new FormData();
    body.set("file", file);
    const answer = await callService({
      base: this.baseUrl,
      path: "/questionnaires/import",
      method: "POST",
      token: this.serviceToken,
      body,
      parse: readFile,
      fetchImpl: this.fetchImpl,
    });
    if (!answer.ok) {
      return refused(answer, {
        ok: false,
        status: 502,
        error: "The questionnaire file service gave an answer this could not read.",
      });
    }
    return { ok: true, file: answer.value };
  }
}

export const questionnaireFileClient = new QuestionnaireFileClient();
