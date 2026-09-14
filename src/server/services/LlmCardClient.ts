import type { RawSystemCard } from "@/domain/SystemCard";
import { SystemCardPromptBuilder } from "./SystemCardPromptBuilder";

/**
 * Talks to the platform LiteLLM service (services/llm) over HTTP instead of
 * calling a provider SDK directly. Provider credentials live on that service,
 * not in this app. Keeps the same generate() → RawSystemCard contract the old
 * AnthropicCardClient exposed.
 */
export class LlmCardClient {
  constructor(
    private readonly serviceUrl: string,
    private readonly model?: string,
    private readonly maxTokens: number = 4096,
  ) {}

  static fromEnv(): LlmCardClient {
    const url = process.env.LLM_SERVICE_URL;
    if (!url)
      throw new Error("LLM_SERVICE_URL is not configured on the server.");
    // LLM_MODEL is optional — the LiteLLM service has its own default.
    return new LlmCardClient(url, process.env.LLM_MODEL || undefined);
  }

  async generate(userPrompt: string): Promise<RawSystemCard> {
    const res = await fetch(`${this.serviceUrl}/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        system: SystemCardPromptBuilder.SYSTEM,
        prompt: userPrompt,
        max_tokens: this.maxTokens,
        ...(this.model ? { model: this.model } : {}),
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`LLM service error ${res.status}: ${detail}`);
    }

    const data = (await res.json()) as { text?: string };
    if (!data.text) throw new Error("LLM service returned no text.");
    return LlmCardClient.parseJsonObject(data.text);
  }

  private static parseJsonObject(raw: string): RawSystemCard {
    const trimmed = raw.trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end < 0) {
      throw new Error("Model did not return a JSON object.");
    }
    return JSON.parse(trimmed.slice(start, end + 1)) as RawSystemCard;
  }
}
