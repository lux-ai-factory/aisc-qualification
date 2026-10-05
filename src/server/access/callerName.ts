/**
 * Who saved a version: the signed-in user's name, for created_by.
 *
 * The gateway has already checked the token; this only reads a name out of its
 * payload (base64url JSON, with no signature check). The first non-blank string of
 * preferred_username, email and sub wins, trimmed and cut to 200 characters (the
 * database's created_by limit). Reads no env.
 */
import { callerToken } from "@/server/services/callerToken";

const CLAIMS = ["preferred_username", "email", "sub"] as const;
const MAX = 200;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** The name a JWT's payload gives, or null. Pure; never throws. */
export function identityFromToken(token: string | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2 || !BASE64URL.test(parts[1])) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload))
    return null;
  for (const claim of CLAIMS) {
    const value = (payload as Record<string, unknown>)[claim];
    if (typeof value === "string" && value.trim() !== "")
      return value.trim().slice(0, MAX);
  }
  return null;
}

/** The caller's name, or "unknown" without a token that names someone. */
export async function callerName(): Promise<string> {
  return identityFromToken(await callerToken()) ?? "unknown";
}
