// Whether this install offers "Let AI suggest additions" on the AI card: only when AISC_AI_ACTIONS is
// `on`. Off by default, so an install starts no card agent run until someone turns it on. Read at request
// time, so the same image serves both kinds of install.

/** Why a card agent run is refused where the install has not turned AI actions on. */
export const AI_ACTIONS_OFF =
  "Letting AI suggest additions is turned off on this install (AISC_AI_ACTIONS).";

export function aiActionsOn(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return (env.AISC_AI_ACTIONS ?? "").trim().toLowerCase() === "on";
}
