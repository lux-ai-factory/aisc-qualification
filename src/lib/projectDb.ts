/**
 * The database of one project.
 *
 * Every project has a database of its own, made by the platform when the
 * project is made. This app keeps a project's AI cards, their answers, risks,
 * knowledge graphs and component links there and nowhere else, so a query
 * that forgets to filter still cannot reach another project: the database is
 * the project.
 *
 * Everything that opens one goes through a door in this file. A door asks the
 * platform whether the caller is in *that* project, the one it was told to
 * open, and only then connects. The middleware checks the project in the URL;
 * a server action's arguments come from the client and can name a different
 * one, so an action opens the database of the project it names, after asking.
 *
 * The controls app has the same module, in its src/lib/projectDb.ts.
 */
import { PrismaClient } from "@prisma/client";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { NextResponse } from "next/server";

import { callerToken } from "@/server/services/callerToken";
import { admit, isProjectId, type Admission } from "@/vendor/aisc-access/projectAccess";

const run = promisify(execFile);

/** What a refused write is told, by status. */
export const REFUSED = {
  403: "403: you can read this project but not change it.",
  404: "Qualification not found.",
} as const;

/** Something that is not a pid was about to become part of a database name. */
export class NotAProject extends Error {}

/** The caller may not do this here; the message is fit to show them. */
export class Refused extends Error {
  constructor(
    readonly status: 403 | 503,
    message: string,
  ) {
    super(message);
    this.name = "Refused";
  }
}

const PLATFORM_SILENT =
  "The platform is not answering, so who may be here cannot be established.";

/**
 * How many project databases this process keeps a client open to.
 *
 * Each client holds up to connection_limit=2 connections, so this is the
 * connection budget: 2 × 20 = 40 at most, plus the clients evicted in the last
 * EVICTION_GRACE_MS. The least recently used client leaves the map when a 21st
 * project is opened; a new one is made (and migrates) if it is needed again.
 */
export const MAX_OPEN_PROJECTS = 20;

/** How long an evicted client stays connected: a request may still hold it, or be
 *  waiting for its migration, and a disconnected Prisma client reconnects on its
 *  next query, outside the map, where nothing would ever close it. */
export const EVICTION_GRACE_MS = 60_000;

/** `project_` + the lowercase pid without hyphens; anything else is refused. */
export function projectDatabaseName(pid: string): string {
  if (!isProjectId(pid))
    throw new NotAProject(`not a project id: ${JSON.stringify(pid)}`);
  return `project_${pid.toLowerCase().replace(/-/g, "")}`;
}

/**
 * The URL of a project's database: `{database}` of the template filled in, and
 * always `schema=qualification` and `connection_limit=2`. Those two are this
 * module's, not the environment's: they set the per-project connection budget, so
 * a template that says otherwise is overridden.
 */
export function projectDatabaseUrl(
  pid: string,
  template: string = process.env.PROJECT_DATABASE_URL ?? "",
): string {
  if (!template.includes("{database}")) {
    throw new Error("PROJECT_DATABASE_URL must contain {database}");
  }
  const url = new URL(template.replace("{database}", projectDatabaseName(pid)));
  url.searchParams.set("schema", "qualification");
  url.searchParams.set("connection_limit", "2");
  return url.toString();
}

/** Bring one project database to this app's schema. */
async function migrateProjectDatabase(url: string): Promise<void> {
  await run("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
  });
}

/** Postgres says the database is not there: the project was deleted, most likely. */
export function isMissingDatabase(err: unknown): boolean {
  const e = err as {
    code?: unknown;
    errorCode?: unknown;
    message?: unknown;
    stderr?: unknown;
  } | null;
  if (!e || typeof e !== "object") return false;
  if (e.code === "P1003" || e.errorCode === "P1003") return true;
  for (const text of [e.message, e.stderr]) {
    if (typeof text === "string" && /database .* does not exist/i.test(text))
      return true;
  }
  return false;
}

/** The server went away mid-query: a dropped database's sessions are killed like this. */
function isClosedConnection(err: unknown): boolean {
  const e = err as {
    code?: unknown;
    errorCode?: unknown;
    message?: unknown;
  } | null;
  if (!e || typeof e !== "object") return false;
  if (e.code === "P1017" || e.errorCode === "P1017") return true;
  return (
    typeof e.message === "string" && /closed the connection/i.test(e.message)
  );
}

type Entry = { client: PrismaClient; ready: Promise<void> };
const store = globalThis as unknown as {
  qualificationProjectDatabases?: Map<string, Entry>;
};
const open = (store.qualificationProjectDatabases ??= new Map<string, Entry>());

function forget(url: string, entry: Entry) {
  if (open.get(url) === entry) open.delete(url);
  entry.client.$disconnect().catch(() => {});
}

/** Out of the map at once; disconnected once the requests that may hold it are done. */
function evict(url: string, entry: Entry) {
  if (open.get(url) === entry) open.delete(url);
  const timer = setTimeout(
    () => entry.client.$disconnect().catch(() => {}),
    EVICTION_GRACE_MS,
  );
  timer.unref?.();
}

/**
 * The client for this project's database, migrated before its first use.
 * Requests that arrive together share one migration; one that failed is
 * forgotten, so the next request tries again. A client whose database went away
 * (the project was deleted) is forgotten on the first error that says so.
 *
 * This does not check who is asking: only the doors below call it.
 */
export async function prismaFor(
  pid: string,
  deps: { migrate: (url: string) => Promise<void> } = {
    migrate: migrateProjectDatabase,
  },
): Promise<PrismaClient> {
  const url = projectDatabaseUrl(pid);
  let entry = open.get(url);
  if (entry) {
    // Most recently used goes last; the first in the map is the one to evict.
    open.delete(url);
    open.set(url, entry);
  } else {
    const client = new PrismaClient({ datasources: { db: { url } } });
    // Connect first: a database that is not there (a deleted project) fails here
    // with P1003, which the doors answer with 404. `prisma migrate deploy` would
    // instead try to create the database again.
    const ready = client
      .$queryRawUnsafe("SELECT 1")
      .then(() => deps.migrate(url));
    // Set before the migration is awaited, so a request arriving meanwhile
    // waits for the same migration instead of starting its own.
    const created: Entry = { client, ready };
    open.set(url, created);
    entry = created;
    let probing = false;
    client.$use(async (params, next) => {
      try {
        return await next(params);
      } catch (err) {
        if (isMissingDatabase(err)) {
          forget(url, created);
          throw err;
        }
        // The first query after DROP DATABASE ... WITH (FORCE) may only say the
        // server closed the connection. Ask once more, to learn which it is.
        if (!probing && isClosedConnection(err)) {
          probing = true;
          try {
            await client.$queryRawUnsafe("SELECT 1");
          } catch (probeErr) {
            if (isMissingDatabase(probeErr)) {
              forget(url, created);
              throw probeErr;
            }
          } finally {
            probing = false;
          }
        }
        throw err;
      }
    });
    created.ready.catch(() => forget(url, created));
    while (open.size > MAX_OPEN_PROJECTS) {
      const [oldestUrl, oldest] = open.entries().next().value as [
        string,
        Entry,
      ];
      evict(oldestUrl, oldest);
    }
  }
  await entry.ready;
  return entry.client;
}

/** Every open client, disconnected. For tests. */
export async function closeProjectDatabases(): Promise<void> {
  const entries = [...open.values()];
  open.clear();
  await Promise.all(entries.map((e) => e.client.$disconnect().catch(() => {})));
}

/** What the platform says the person behind this request may do in this project. */
export async function callerAccess(pid: string, method = "GET"): Promise<Admission> {
  return admit(pid, method, await callerToken(), {
    platformUrl: process.env.PLATFORM_URL ?? "",
  });
}

type Decision = { db: PrismaClient } | { status: 403 | 404 | 503 };

/** The database, or 404 when it is not there (a deleted project). */
async function openOr404(pid: string): Promise<Decision> {
  try {
    return { db: await prismaFor(pid) };
  } catch (err) {
    if (isMissingDatabase(err)) return { status: 404 };
    throw err;
  }
}

/** The request being served, as a key for what was decided in it; null outside a request. */
async function currentRequest(): Promise<object | null> {
  try {
    // Next hands every caller in one request the same headers object.
    return (await headers()) as unknown as object;
  } catch {
    return null; // a script, a test
  }
}

/** What each door decided in a request, by `read:`/`write:`/`service:` and pid. */
const decidedIn = new WeakMap<object, Map<string, Promise<Decision>>>();

async function decisionsOfThisRequest(): Promise<Map<
  string,
  Promise<Decision>
> | null> {
  const request = await currentRequest();
  if (!request) return null;
  let decided = decidedIn.get(request);
  if (!decided) {
    decided = new Map();
    decidedIn.set(request, decided);
  }
  return decided;
}

/**
 * The one decision behind every door: not a pid is 404 with the platform never
 * asked; then the platform decides (stranger 404, reader asking to write 403,
 * silent 503); only on "allow" is the database opened. Asked once per request
 * and pid (a read reuses a write that was allowed): the layout and every
 * component of a page share one /authz call.
 */
async function door(pid: string, write: boolean): Promise<Decision> {
  const decided = await decisionsOfThisRequest();
  if (!decided) return askDoor(pid, write);
  const key = `${write ? "write" : "read"}:${pid}`;
  let decision = decided.get(key);
  if (!decision) {
    const wrote = write ? undefined : decided.get(`write:${pid}`);
    decision = wrote
      ? wrote.then((d) => ("db" in d ? d : askDoor(pid, false)))
      : askDoor(pid, write);
    decided.set(key, decision);
  }
  return decision;
}

async function askDoor(pid: string, write: boolean): Promise<Decision> {
  if (!isProjectId(pid)) return { status: 404 };
  const admission = await callerAccess(pid, write ? "POST" : "GET");
  return admission.ok ? openOr404(admission.pid) : { status: admission.status };
}

/**
 * This project's database, if the caller may read it (or, with write, change
 * it):
 *
 * - not a pid, not in the project, or no such database → notFound()
 * - a reader asking to write → Refused(403)
 * - the platform not answering → Refused(503)
 *
 * Nothing is connected to until the answer is "allow".
 */
export async function projectDbFor(
  pid: string,
  { write }: { write: boolean },
): Promise<PrismaClient> {
  const d = await door(pid, write);
  if ("db" in d) return d.db;
  if (d.status === 403) throw new Refused(403, REFUSED[403]);
  if (d.status === 503) throw new Refused(503, PLATFORM_SILENT);
  return notFound();
}

/** The same door for a route handler: the database, or the response to return. */
export async function projectDbForRoute(
  pid: string,
  { write }: { write: boolean },
): Promise<PrismaClient | Response> {
  const d = await door(pid, write);
  if ("db" in d) return d.db;
  if (d.status === 403)
    return NextResponse.json({ error: REFUSED[403] }, { status: 403 });
  if (d.status === 503)
    return NextResponse.json({ error: PLATFORM_SILENT }, { status: 503 });
  return new NextResponse("Not found", { status: 404 });
}

/** The same door for a server action, which returns its refusal as state. */
export async function projectDbForAction(
  pid: string,
  { write }: { write: boolean },
): Promise<
  | { db: PrismaClient; error?: undefined }
  | { db?: undefined; status: 403 | 404 | 503; error: string }
> {
  const d = await door(pid, write);
  if ("db" in d) return { db: d.db };
  if (d.status === 403) return { status: 403, error: REFUSED[403] };
  if (d.status === 503) return { status: 503, error: PLATFORM_SILENT };
  return { status: 404, error: REFUSED[404] };
}

/**
 * For a caller that has already proved it is a service allowed here (the card
 * agent's token on /extracted): no platform question, since the agent is nobody
 * to the platform. Still only a pid opens a database, and a missing one is 404.
 */
export async function projectDbForService(
  pid: string,
): Promise<PrismaClient | Response> {
  if (!isProjectId(pid))
    return new NextResponse("Not found", { status: 404 });
  const d = await openOr404(pid);
  // Remembered for this request: the services the agent's branch calls next open the
  // database with projectDbPastDoor, which must not ask the platform about a service.
  if ("db" in d)
    (await decisionsOfThisRequest())?.set(`service:${pid}`, Promise.resolve(d));
  return "db" in d ? d.db : new NextResponse("Not found", { status: 404 });
}

/**
 * For code that runs after a door: a page, whose /p/{pid} the middleware already
 * decided; a service called after one of the doors above; the agent's branch
 * after its token. It asks the read door itself (once per request: a door that
 * already said yes in this request is not asked again), because the middleware
 * is the only other check and a page is rendered beside its layout, not inside
 * it, so the layout's check cannot hold a page back. A caller the agent's
 * service token let through (projectDbForService) is not asked about.
 *
 * - not a pid, not in the project, or no such database → notFound()
 * - the platform not answering → Refused(503)
 */
export async function projectDbPastDoor(pid: string): Promise<PrismaClient> {
  const service = (await decisionsOfThisRequest())?.get(`service:${pid}`);
  const d = await (service ?? door(pid, false));
  if ("db" in d) return d.db;
  if (d.status === 503) throw new Refused(503, PLATFORM_SILENT);
  return notFound();
}
