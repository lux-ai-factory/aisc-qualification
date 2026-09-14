export class RendererUnreachableError extends Error {
  constructor(url: string, cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(`Renderer service unreachable at ${url}: ${msg}`);
    this.name = "RendererUnreachableError";
  }
}

export class RendererHttpError extends Error {
  constructor(
    public readonly status: number,
    body: string,
  ) {
    super(`Renderer returned HTTP ${status}: ${body.slice(0, 300)}`);
    this.name = "RendererHttpError";
  }
}

export class SystemCardRendererClient {
  constructor(
    private readonly baseUrl: string = process.env.SYSTEM_CARD_RENDERER_URL ??
      "http://localhost:8005",
  ) {}

  async renderPdf(card: unknown): Promise<ArrayBuffer> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/render/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(card),
      });
    } catch (err) {
      throw new RendererUnreachableError(this.baseUrl, err);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new RendererHttpError(res.status, body);
    }
    return res.arrayBuffer();
  }
}

export const systemCardRendererClient = new SystemCardRendererClient();
