// The request id is resolved before a transaction opens, so a slow JWKS read cannot hold an
// interactive transaction (Prisma's 5-second timeout) and roll the person's save back.
import { generateKeyPairSync, sign as rsaSign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => state.headers }));

import { emitEvent } from "@/vendor/aisc-ledger/emit";
import { QualificationRepository } from "@/server/repositories/QualificationRepository";
import type { PrismaClient } from "@prisma/client";

const ISSUER = "http://keycloak:8080/realms/aisc";
const REQUEST = "a6a6a6a6-0000-4000-8000-000000000004";
const realm = generateKeyPairSync("rsa", { modulusLength: 2048 });
const JWK = {
  ...realm.publicKey.export({ format: "jwk" }),
  kid: "realm-key",
  use: "sig",
};

function jwt(claims: Record<string, unknown>): string {
  const part = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const signed = `${part({ alg: "RS256", typ: "JWT", kid: "realm-key" })}.${part(claims)}`;
  return `${signed}.${rsaSign("RSA-SHA256", Buffer.from(signed), realm.privateKey).toString("base64url")}`;
}
const gatewayToken = () =>
  jwt({
    sub: "alice",
    iss: ISSUER,
    azp: "aisc-gateway",
    exp: Math.floor(Date.now() / 1000) + 300,
  });

const ENV = [
  "AUTH_ENABLED",
  "KEYCLOAK_ISSUER",
  "KEYCLOAK_JWKS_URL",
  "LEDGER_MODE",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  process.env.AUTH_ENABLED = "true";
  process.env.KEYCLOAK_ISSUER = ISSUER;
});

afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  state.headers = new Headers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the request id and the transaction", () => {
  it("is resolved before the transaction opens: a slow JWKS read spends no time inside it", async () => {
    vi.useFakeTimers();
    process.env.LEDGER_MODE = "record";
    process.env.KEYCLOAK_JWKS_URL = "http://tx-realm/certs";
    // the realm answers, but only after 1.5 seconds, inside JWKS_TIMEOUT_MS
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) =>
            setTimeout(
              () => resolve(new Response(JSON.stringify({ keys: [JWK] }))),
              1_500,
            ),
          ),
      ),
    );
    state.headers = new Headers({
      "x-aisc-request-id": REQUEST,
      "x-auth-request-access-token": gatewayToken(),
    });
    let opened = 0;
    let emittedAt = 0;
    const bodies: string[] = [];
    const tx = {
      $executeRaw: async (_q: TemplateStringsArray, ...values: unknown[]) => {
        emittedAt = Date.now();
        bodies.push(String(values[0]));
        return 1;
      },
    };
    const db = {
      $transaction: async (fn: (t: unknown) => Promise<unknown>) => {
        opened = Date.now();
        return fn(tx);
      },
    } as unknown as PrismaClient;
    const saving = new QualificationRepository(db).transaction((_r, t) =>
      emitEvent(t, {
        action: "card.node_corrected",
        itemType: "qualification",
        itemId: "c1",
      }),
    );
    await vi.advanceTimersByTimeAsync(1_500);
    await saving;
    expect(JSON.parse(bodies[0]).request_id).toBe(REQUEST);
    expect(emittedAt - opened).toBe(0);
  });
});
