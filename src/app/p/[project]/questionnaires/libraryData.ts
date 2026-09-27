import { questionSetService } from "@/server/services/QuestionSetService";

/** What the builder opens with: every question set's latest version, retired
 *  ones included so "Update available" still sees them (T45). */
export async function builderData() {
  return { groups: await questionSetService.groups() };
}
