// Bring every project database to this app's schema, then exit.
//
// Runs as the qualification-migrate service at start, after the platform (which makes the
// databases). A project made later is migrated by the web app the first time it is opened
// (src/lib/projectDb.ts), which runs this file with that database's name as its one argument:
// then only the databases named (each ^project_[0-9a-f]{32}$) are migrated.
//
// It runs as qualification_migrator (PROJECT_MIGRATE_DATABASE_URL), whose sessions act as
// qualification_owner, the owner of every table it makes; the web app reads and writes them as
// qualification_rw. It lists the databases this role may connect to, keeps those named
// ^project_[0-9a-f]{32}$ (sorted) and runs `prisma migrate deploy` on each, with that
// database's URL for the child only, once the database's qualification schema belongs to
// qualification_owner. Exit 2 for a misconfiguration or when any project database failed (the
// service stops, and qualification-web does not start on a half-migrated set), a schema of
// another owner included; 1 when postgres cannot be listed yet, or a schema is still missing or
// the platform's (the platform hands it over at its first query after postgres-setup made the
// role: the service waits and tries again);
// 0 once every project database is at the head.
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

import { databaseUrl, OWNER, SCHEMA_OWNER_QUERY, ownerProblem } from "./projectDb.mjs";

const PROJECT_DATABASE = /^project_[0-9a-f]{32}$/;

const template = process.env.PROJECT_MIGRATE_DATABASE_URL ?? "";
if (!template.includes("{database}")) {
  console.error(
    `[qualification] PROJECT_MIGRATE_DATABASE_URL must contain {database}: migrations run as qualification_migrator, acting as ${OWNER}`,
  );
  process.exit(2);
}

async function listDatabases() {
  // The catalogue is read on the maintenance database, without the schema and limit of a
  // project database.
  const catalog = new PrismaClient({
    datasourceUrl: template.replace("{database}", "postgres").split("?")[0],
  });
  try {
    const rows = await catalog.$queryRawUnsafe(
      `SELECT datname FROM pg_database
        WHERE NOT datistemplate AND datallowconn
          AND has_database_privilege(current_user, datname, 'CONNECT')`,
    );
    return rows.map((r) => r.datname);
  } finally {
    await catalog.$disconnect();
  }
}

const named = process.argv.slice(2);
if (named.some((d) => !PROJECT_DATABASE.test(d))) {
  console.error("[qualification] only project_<32 hex> databases may be named");
  process.exit(2);
}

let names;
try {
  names = named.length
    ? named
    : (await listDatabases()).filter((d) => PROJECT_DATABASE.test(d)).sort();
} catch (err) {
  console.error(
    `[qualification] cannot list the databases yet: ${err?.message?.split("\n").pop() ?? err}`,
  );
  process.exit(1);
}

/** Whose the database's qualification schema is: only its owner role's may be migrated. */
async function schemaProblem(url) {
  const client = new PrismaClient({ datasourceUrl: url });
  try {
    const rows = await client.$queryRawUnsafe(SCHEMA_OWNER_QUERY);
    return ownerProblem(rows[0]?.owner ?? null);
  } finally {
    await client.$disconnect();
  }
}

const failed = [];
const waiting = [];
for (const name of names) {
  console.log(`[qualification] migrating ${name}`);
  try {
    const problem = await schemaProblem(databaseUrl(template, name));
    if (problem?.wait) {
      console.error(`[qualification] ${name} waits: ${problem.text}`);
      waiting.push(name);
      continue;
    }
    if (problem) {
      console.error(`[qualification] ${name} could not be migrated: ${problem.text}`);
      failed.push(name);
      continue;
    }
  } catch {
    console.error(`[qualification] ${name} could not be read`);
    failed.push(name);
    continue;
  }
  try {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: databaseUrl(template, name) },
    });
  } catch {
    console.error(`[qualification] ${name} could not be migrated`);
    failed.push(name);
  }
}
console.log(
  `[qualification] ${names.length - failed.length - waiting.length} of ${names.length} project databases at the head`,
);
if (failed.length) process.exit(2);
if (waiting.length) {
  console.error(
    `[qualification] ${waiting.length} project database(s) wait for their schema to belong to ${OWNER}: run postgres-setup, then let the platform start`,
  );
  process.exit(1);
}
process.exit(0);
