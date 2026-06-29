"use server";

import { revalidatePath } from "next/cache";
import { systemCardGenerator } from "@/server/services/SystemCardGenerator";
import {
  systemCardRendererClient,
  RendererHttpError,
  RendererUnreachableError,
} from "@/server/services/SystemCardRendererClient";
import { qualificationRepository } from "@/server/repositories/QualificationRepository";

export type GenerateState = { error?: string; ok?: boolean } | undefined;

export async function generateSystemCard(
  qualificationId: string,
): Promise<GenerateState> {
  try {
    await systemCardGenerator.generate(qualificationId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath(`/qualify/${qualificationId}`);
  revalidatePath(`/qualifications`);
  return { ok: true };
}

export async function fetchSystemCardPdf(
  qualificationId: string,
): Promise<{ pdfBase64?: string; error?: string }> {
  try {
    const summary = await qualificationRepository.cardSummary(qualificationId);
    if (!summary) return { error: "Qualification not found." };
    if (!summary.systemCardJson) {
      return { error: "No system card to render — generate it first." };
    }
    const buf = Buffer.from(
      await systemCardRendererClient.renderPdf(summary.systemCardJson),
    );
    return { pdfBase64: buf.toString("base64") };
  } catch (err) {
    if (err instanceof RendererUnreachableError) return { error: err.message };
    if (err instanceof RendererHttpError) return { error: err.message };
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
