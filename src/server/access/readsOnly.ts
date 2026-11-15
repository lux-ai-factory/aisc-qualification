/**
 * Whether a page offers this caller nothing that changes the project.
 *
 * True only when the platform says the caller is in the project and may not write
 * (a viewer). When the platform cannot say, a page offers what it would: every write
 * asks the platform again and is refused there with its reason.
 */
import { callerAccess } from "@/lib/projectDb";

/** What a page tells a person who may read the project but not change it. */
export const READS_ONLY = "You can read this project but not change it.";

export async function callerReadsOnly(project: string): Promise<boolean> {
  try {
    const access = await callerAccess(project);
    return access.ok === true && !access.mayWrite;
  } catch {
    return false;
  }
}
