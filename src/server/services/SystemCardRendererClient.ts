import { shortDetail } from "./errorText";
import { callService } from "./http";

/** The renderer did not answer. A person reads the message, so it names neither the
 *  renderer's address nor the network error; both are logged, and the error is the cause. */
export class RendererUnreachableError extends Error {
  constructor(url: string, cause: unknown) {
    super("The PDF renderer did not answer.", { cause });
    this.name = "RendererUnreachableError";
    const msg = cause instanceof Error ? cause.message : String(cause);
    console.warn(`renderer: unreachable at ${url}: ${msg}`);
  }
}

export class RendererHttpError extends Error {
  constructor(
    public readonly status: number,
    body: string,
  ) {
    super(`Renderer returned HTTP ${status}${body ? `: ${shortDetail(body)}` : ""}`);
    this.name = "RendererHttpError";
  }
}

/** Rendering a long card takes a while: the call waits this long for the PDF. */
const RENDER_TIMEOUT_MS = 60_000;

export class SystemCardRendererClient {
  constructor(
    private readonly baseUrl: string = process.env.SYSTEM_CARD_RENDERER_URL ??
      "http://localhost:8005",
    /** This app's token for the renderer: it refuses a caller without one. */
    private readonly serviceToken: string = process.env.QUALIFICATION_WEB_TO_PDF_TOKEN ?? "",
  ) {}

  async renderPdf(card: unknown): Promise<ArrayBuffer> {
    const answer = await callService({
      base: this.baseUrl,
      path: "/render/pdf",
      method: "POST",
      token: this.serviceToken,
      body: card,
      timeoutMs: RENDER_TIMEOUT_MS,
      answer: "bytes",
      parse: (raw) => raw as ArrayBuffer,
    });
    if (answer.ok) return answer.value;
    if (answer.status === null) throw new RendererUnreachableError(this.baseUrl, new Error(answer.shownDetail ?? ""));
    throw new RendererHttpError(answer.status, answer.shownDetail ?? "");
  }
}

export const systemCardRendererClient = new SystemCardRendererClient();
