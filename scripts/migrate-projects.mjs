// Bring every project database to this app's schema, then exit.
//
// Runs as the qualification-migrate service at start, after the platform (which makes the
// databases). A project made later is migrated by the web app the first time it is opened
// (src/lib/projectDb.ts), so this is for schema changes reaching the projects that already
// exist.
//
// It lists the databases this role may connect to, keeps those named ^project_[0-9a-f]{32}$
// (sorted) and runs `prisma migrate deploy` on each, with that database's URL for the child
// only. Exit 2 for a misconfiguration or when any project database failed (the service
// stops, and qualification-web does not start on a half-migrated set); 1 when postgres
// cannot be listed yet (the service waits and tries again); 0 once every project database
// is at the head.
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

import { databaseUrl } from "./projectDb.mjs";

const PROJECT_DATABASE = /^project_[0-9a-f]{32}$/;

const template = process.env.PROJECT_DATABASE_URL ?? "";
if (!template.includes("{database}")) {
  console.error("[qualification] PROJECT_DATABASE_URL must contain {database}");
  process.exit(2);
}

async function listDatabases() {
  // The catalogue is read on the maintenance database, without the schema and limit of a
  // project database.
  const catalog = new PrismaClient({ datasourceUrl: template.replace("{database}", "postgres").split("?")[0] });
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

let names;
try {
  names = (await listDatabases()).filter((d) => PROJECT_DATABASE.test(d)).sort();
} catch (err) {
  console.error(`[qualification] cannot list the databases yet: ${err?.message?.split("\n").pop() ?? err}`);
  process.exit(1);
}

const failed = [];
for (const name of names) {
  console.log(`[qualification] migrating ${name}`);
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
console.log(`[qualification] ${names.length - failed.length} of ${names.length} project databases at the head`);
process.exit(failed.length ? 2 : 0);
