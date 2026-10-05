import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadSrc } from "../support/forms";

// created_by is the signed-in user. identityFromToken(token) is pure: it decodes a JWT's
// payload (base64url, no signature check: the gateway has already verified it) and returns the first non-blank string of preferred_username, email,
// sub, trimmed and cut to 200 characters; null for null, a malformed token, or none of the
// three. callerName() = identityFromToken(await callerToken()) ?? "unknown".

const token = { value: null as string | null };
vi.mock("@/server/services/callerToken", () => ({
  callerToken: async () => token.value,
}));

const mod = () => loadSrc("server/access/callerName.ts");

const b64url = (s: string) =>
  Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const jwt = (payload: unknown, raw = false) =>
  `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${raw ? (payload as string) : b64url(JSON.stringify(payload))}.c2lnbmF0dXJl`;

beforeEach(() => {
  token.value = null;
});

describe("identityFromToken (T55)", () => {
  it("T55 D4 preferred_username first", async () => {
    const { identityFromToken } = await mod();
    expect(
      identityFromToken(
        jwt({
          preferred_username: "alice",
          email: "alice@list.lu",
          sub: "u-1",
        }),
      ),
    ).toBe("alice");
  });

  it("T55 email when there is no preferred_username", async () => {
    const { identityFromToken } = await mod();
    expect(identityFromToken(jwt({ email: "bob@list.lu", sub: "u-2" }))).toBe(
      "bob@list.lu",
    );
  });

  it("T55 sub when there is neither", async () => {
    const { identityFromToken } = await mod();
    expect(
      identityFromToken(jwt({ sub: "f3b1c2d4-0000-4000-8000-000000000003" })),
    ).toBe("f3b1c2d4-0000-4000-8000-000000000003");
  });

  it("T55 a blank or non-string claim is skipped for the next one", async () => {
    const { identityFromToken } = await mod();
    expect(
      identityFromToken(
        jwt({ preferred_username: "   ", email: "carol@list.lu" }),
      ),
    ).toBe("carol@list.lu");
    expect(
      identityFromToken(jwt({ preferred_username: 42, email: "", sub: "u-4" })),
    ).toBe("u-4");
    expect(
      identityFromToken(
        jwt({ preferred_username: null, email: ["x"], sub: "u-5" }),
      ),
    ).toBe("u-5");
  });

  it("T55 the value is trimmed and cut to 200 characters", async () => {
    const { identityFromToken } = await mod();
    expect(identityFromToken(jwt({ preferred_username: "  dave  " }))).toBe(
      "dave",
    );
    const long = "e".repeat(250);
    expect(identityFromToken(jwt({ preferred_username: long }))).toBe(
      "e".repeat(200),
    );
  });

  it("T55 base64url payloads with - and _ and no padding decode (non-ASCII names included)", async () => {
    const { identityFromToken } = await mod();
    // "é" and "ü?" make '+'/'/' in plain base64, so the url alphabet is exercised
    const name = "Zoë Müller?>>";
    const encoded = b64url(JSON.stringify({ preferred_username: name }));
    expect(encoded).toMatch(/[-_]/);
    expect(encoded.endsWith("=")).toBe(false);
    expect(identityFromToken(jwt(encoded, true))).toBe(name);
  });

  it("T55 null for null, an empty string, a malformed token, a payload that is not JSON, or none of the three claims", async () => {
    const { identityFromToken } = await mod();
    expect(identityFromToken(null)).toBeNull();
    expect(identityFromToken("")).toBeNull();
    expect(identityFromToken("not-a-jwt")).toBeNull();
    expect(identityFromToken("a.b")).toBeNull();
    expect(identityFromToken(jwt("%%%not base64%%%", true))).toBeNull();
    expect(identityFromToken(jwt(b64url("{not json"), true))).toBeNull();
    expect(identityFromToken(jwt(b64url('"a string"'), true))).toBeNull();
    expect(
      identityFromToken(jwt({ name: "Erin", given_name: "Erin" })),
    ).toBeNull();
  });

  it("T55 never throws", async () => {
    const { identityFromToken } = await mod();
    for (const bad of [
      null,
      "",
      ".",
      "..",
      "x.y.z",
      jwt(b64url("null"), true),
      jwt(b64url("[1]"), true),
    ]) {
      expect(() => identityFromToken(bad)).not.toThrow();
    }
  });
});

describe("callerName (T55)", () => {
  it("T55 is the identity of the caller's token", async () => {
    token.value = jwt({ preferred_username: "alice" });
    const { callerName } = await mod();
    await expect(callerName()).resolves.toBe("alice");
  });

  it('T55 is "unknown" without a token, or with a token that names nobody', async () => {
    const { callerName } = await mod();
    token.value = null;
    await expect(callerName()).resolves.toBe("unknown");
    token.value = "garbage";
    await expect(callerName()).resolves.toBe("unknown");
    token.value = jwt({ aud: "x" });
    await expect(callerName()).resolves.toBe("unknown");
  });
});
