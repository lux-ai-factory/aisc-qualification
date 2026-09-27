// The one name rule for a project's database, for the scripts (they cannot import
// src/lib/projectDb.ts, which is TypeScript). The same rule as there: only a pid names a
// database, `project_` + the lowercase pid without hyphens, and the URL always carries
// schema=qualification and connection_limit=2.

/** A project id (pid): a UUID. */
export const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
