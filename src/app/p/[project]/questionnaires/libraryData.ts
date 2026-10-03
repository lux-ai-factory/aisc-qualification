import type { PrismaClient } from "@prisma/client";
import { questionSetsOn } from "@/server/services/QuestionSetService";

/** What the builder opens with: every question set's latest version in the
 *  project's database, retired ones included so "Update available" still sees
 *  them. */
export async function builderData(db: PrismaClient) {
  return { groups: await questionSetsOn(db).groups() };
}
