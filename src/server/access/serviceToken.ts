/**
 * Whether a request carries a service's token.
 *
 * A few routes are called by a sibling service rather than by a person: the
 * card agent reads a qualification and publishes its draft. It has no user
 * token, so it sends a token of its own, and only the route that expects it
 * reads it. Compared in constant time; and a route whose token is not set
 * refuses every caller that sends one rather than letting any through.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { SERVICE_TOKEN_HEADER } from "@/server/services/http";

/**
 * "none": no token was sent, so the caller is a person and the user rules apply.
 * "valid": the expected token. "wrong": another value. "unset": this app has no
 * token to compare with, which is a misconfiguration and closes the door.
 */
export type ServiceCall = "none" | "valid" | "wrong" | "unset";

const digest = (value: string) => createHash("sha256").update(value).digest();

export function serviceCall(
  headers: { get(name: string): string | null },
  expected: string | undefined,
): ServiceCall {
  const given = headers.get(SERVICE_TOKEN_HEADER);
  if (given === null) return "none";
  if (!expected) return "unset";
  // Digests first, so the comparison takes the same time whatever the lengths.
  return timingSafeEqual(digest(given), digest(expected)) ? "valid" : "wrong";
}
