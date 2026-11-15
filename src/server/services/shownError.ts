/**
 * What a card action tells the person when it fails.
 *
 * A refusal written for people is said as it is: the card is not the current one
 * (and why), a card that is not there, or the platform's own sentence
 * ("Could not ...: the platform did not answer."). Anything else may carry
 * internals (an address, a stack), so it goes to the server log and the person
 * reads `fallback`.
 */
import { CardNotCurrent } from "@/server/services/cardLatest";

const SAID_AS_IS = /^(Could not |Qualification not found\.)/;

export function shownError(err: unknown, fallback: string): string {
  if (err instanceof CardNotCurrent) return err.message;
  if (err instanceof Error && SAID_AS_IS.test(err.message)) return err.message;
  console.error("card action failed", err);
  return fallback;
}
