#!/usr/bin/env bash
# Throwaway Postgres for the DB-gated tests in test/db.
#
#   test/db/throwaway-db.sh           start one, migrate it, run `npx vitest run test/db`, remove it
#   KEEP=1 test/db/throwaway-db.sh    same, but leave the container up and print the env
#
# Never the live DB: every DSN below uses the random $PORT, and the script refuses 5432.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$(cd "$HERE/../.." && pwd)"
ROOT="$(cd "$APP/../.." && pwd)"

NAME="aisc-t-qual-$(head -c4 /dev/urandom | od -An -tx1 | tr -d ' \n')"
PW="$(head -c12 /dev/urandom | od -An -tx1 | tr -d ' \n')"
PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"
[ "$PORT" != "5432" ] || { echo "refusing port 5432 (live)"; exit 1; }

cleanup() { [ "${KEEP:-}" = "1" ] || docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

docker run --rm -d --name "$NAME" -p "127.0.0.1:$PORT:5432" \
  -e POSTGRES_USER=aisc-postgres-user -e POSTGRES_PASSWORD="$PW" -e POSTGRES_DB=platform \
  postgres:14-alpine >/dev/null
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U aisc-postgres-user -d platform >/dev/null 2>&1 && break
  sleep 0.5
done
sleep 1

su_psql() { docker exec -i "$NAME" psql -q -U aisc-postgres-user -d platform -v ON_ERROR_STOP=1 "$@"; }
su_psql < "$ROOT/init/platform-db.sql" >/dev/null
su_psql < "$ROOT/init/project-databases.sql" >/dev/null
# the platform's own migrations, in order, as the platform
for f in "$ROOT"/platform/migrations/*.sql; do
  docker exec -i -e PGPASSWORD=platform_rw "$NAME" \
    psql -q -h 127.0.0.1 -U platform_rw -d platform -v ON_ERROR_STOP=1 < "$f" >/dev/null
done

export DATABASE_URL="postgresql://qualification_rw:qualification_rw@127.0.0.1:$PORT/platform?schema=qualification"
case "$DATABASE_URL" in *:5432/*) echo "refusing live DSN"; exit 1;; esac
(cd "$APP" && npx prisma migrate deploy >/dev/null)

export QUALIFICATION_TEST_DATABASE_URL="$DATABASE_URL"
export QUALIFICATION_TEST_ADMIN_URL="postgresql://aisc-postgres-user:$PW@127.0.0.1:$PORT/platform?schema=qualification"
export QUALIFICATION_TEST_PSQL="docker exec -i $NAME psql -q -U aisc-postgres-user -d platform -v ON_ERROR_STOP=1"

if [ "${KEEP:-}" = "1" ]; then
  echo "export QUALIFICATION_TEST_DATABASE_URL='$QUALIFICATION_TEST_DATABASE_URL'"
  echo "export QUALIFICATION_TEST_ADMIN_URL='$QUALIFICATION_TEST_ADMIN_URL'"
  echo "export QUALIFICATION_TEST_PSQL='$QUALIFICATION_TEST_PSQL'"
  echo "# remove with: docker rm -f $NAME"
  exit 0
fi
(cd "$APP" && npx vitest run test/db "$@")
