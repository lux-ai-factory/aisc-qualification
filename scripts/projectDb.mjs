// The one name rule for a project's database, for the scripts (they cannot import
// src/lib/projectDb.ts, which is TypeScript). The same rule as there: only a pid names a
// database, `project_` + the lowercase pid without hyphens, and the URL always carries
// schema=qualification and connection_limit=2.

/** A project id (pid): a UUID. */
export const PROJECT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function projectDatabaseName(pid) {
  if (typeof pid !== "string" || !PROJECT_ID.test(pid)) {
    throw new Error(`not a project id: ${JSON.stringify(pid)}`);
  }
  return `project_${pid.toLowerCase().replace(/-/g, "")}`;
}

/** `template` with `{database}` filled in for `pid`, schema and connection limit forced. */
export function projectDatabaseUrl(pid, template = "") {
  if (!template.includes("{database}")) {
    throw new Error("PROJECT_DATABASE_URL must contain {database}");
  }
  return databaseUrl(template, projectDatabaseName(pid));
}

/** `template` with `{database}` filled in by a database name already checked by the caller. */
export function databaseUrl(template, database) {
  const url = new URL(template.replace("{database}", database));
  url.searchParams.set("schema", "qualification");
  url.searchParams.set("connection_limit", "2");
  return url.toString();
}

/** The role that owns the qualification schema and its tables; qualification_migrator acts as it. */
export const OWNER = "qualification_owner";

/** Who owns the qualification schema of the database a client is on (one row, `owner`, or none). */
export const SCHEMA_OWNER_QUERY =
  "SELECT pg_get_userbyid(nspowner)::text AS owner FROM pg_namespace WHERE nspname = 'qualification'";

/** Who may hold the schema before it is handed to its owner: the platform, which makes it. */
const NOT_HANDED_OVER_YET = new Set([null, "platform_rw", "platform_owner"]);

/**
 * Why a project database may not be migrated, or null. Its qualification schema must belong to
 * qualification_owner: the platform hands it over once postgres-setup has made the role. `wait` says the
 * hand-over is still to come (the schema is missing or still the platform's): the one-shot tries again.
 * A schema of anyone else is a permanent error. Migrating a schema of another owner would fail half way
 * or make tables the role the app connects as could alter.
 */
export function ownerProblem(owner) {
  if (owner === OWNER) return null;
  return {
    wait: NOT_HANDED_OVER_YET.has(owner),
    text: `schema qualification belongs to ${owner ?? "nobody (it is missing)"}, not ${OWNER}: run postgres-setup (init/owner-roles.sql) and start the platform, which hands it over`,
  };
}
