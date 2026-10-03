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

NAME="${THROWAWAY_PREFIX:-aisc-t-qual}-$(head -c4 /dev/urandom | od -An -tx1 | tr -d ' \n')"
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
# the image restarts the server once after its init scripts: wait until it answers twice
for _ in $(seq 1 60); do
  docker exec "$NAME" psql -q -U aisc-postgres-user -d platform -c 'SELECT 1' >/dev/null 2>&1 && sleep 1 &&
    docker exec "$NAME" psql -q -U aisc-postgres-user -d platform -c 'SELECT 1' >/dev/null 2>&1 && break
  sleep 0.5
done

su_psql() { docker exec -i "$NAME" psql -q -U aisc-postgres-user -d platform -v ON_ERROR_STOP=1 "$@"; }
su_psql < "$ROOT/init/platform-db.sql" >/dev/null
su_psql < "$ROOT/init/project-databases.sql" >/dev/null
# the platform's own migrations, in order, as the platform
for f in "$ROOT"/platform/migrations/*.sql; do
  docker exec -i -e PGPASSWORD=platform_rw "$NAME" \
    psql -q -h 127.0.0.1 -U platform_rw -d platform -v ON_ERROR_STOP=1 < "$f" >/dev/null
done

# (the qualification schema does not live in `platform`; the history of
# prisma/migrations is replayed in each project database instead, below.)
#
# Project databases made the platform's way (platform_service.projectdb.provision, so
# they get the real template), for test/db/projectDatabase.db.test.ts and
# test/db/projectForms.db.test.ts. A failure here does not stop the older tests: the
# isolation tests then fail naming ISOLATION_SETUP.
for f in report-roles inspector-role; do su_psql < "$ROOT/init/$f.sql" >/dev/null 2>&1 || true; done
ISO_A=aaaaaaaa-0000-4000-8000-00000000000a
ISO_B=bbbbbbbb-0000-4000-8000-00000000000b
ISO_C=cccccccc-0000-4000-8000-00000000000c   # qualification_rw may not connect: skipped
ISO_E=eeeeeeee-0000-4000-8000-00000000000e   # dropped mid-test
ISO_F=ffffffff-0000-4000-8000-00000000000f   # the older DB tests (cardVersions) run here
ISO_SETUP=ok
if (cd "$ROOT/platform" && PROVISION_DSN="postgresql://platform_rw:platform_rw@127.0.0.1:$PORT/platform" \
    uv run --quiet python -c '
import os, sys
from platform_service.projectdb import provision
for pid in sys.argv[1:]:
    provision(os.environ["PROVISION_DSN"], pid)
' "$ISO_A" "$ISO_B" "$ISO_C" "$ISO_E" "$ISO_F") >/dev/null 2>&1; then
  hex() { echo "$1" | tr -d '-'; }
  F_URL="postgresql://qualification_rw:qualification_rw@127.0.0.1:$PORT/project_$(hex $ISO_F)?schema=qualification"
  case "$F_URL" in *:5432/*) echo "refusing live DSN"; exit 1;; esac
  (cd "$APP" && DATABASE_URL="$F_URL" npx prisma migrate deploy >/dev/null) || ISO_SETUP="project F could not be migrated"
  su_psql -c "REVOKE CONNECT ON DATABASE project_$(hex $ISO_C) FROM qualification_rw" >/dev/null 2>&1 || true
  su_psql -c "CREATE DATABASE project_notapid" >/dev/null
  su_psql -c "CREATE DATABASE live_shape" >/dev/null
  # The fixture is a dump of the moving schemas: core.system comes with it, but not the
  # schema core nor the function its trigger calls, so both are stubbed (only the
  # qualification schema is compared).
  docker exec "$NAME" psql -q -U aisc-postgres-user -d live_shape -c "CREATE SCHEMA core" \
    -c 'CREATE FUNCTION core.system_only_latest_changes() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RETURN NEW; END $f$' >/dev/null
  docker exec -i "$NAME" psql -q -U aisc-postgres-user -d live_shape -v ON_ERROR_STOP=1 \
    < "$ROOT/scripts/tests/fixtures/isolation/live_shape.sql" >/dev/null || ISO_SETUP="live_shape.sql did not load"
else
  ISO_SETUP="platform_service.projectdb.provision failed (uv run in platform/)"
fi
export ISOLATION_SETUP="$ISO_SETUP"
export QUALIFICATION_TEST_PROJECT_DATABASE_URL="postgresql://qualification_rw:qualification_rw@127.0.0.1:$PORT/{database}?schema=qualification"
export QUALIFICATION_TEST_PROJECT_ADMIN_URL="postgresql://aisc-postgres-user:$PW@127.0.0.1:$PORT/{database}"
export QUALIFICATION_TEST_PLATFORM_ROLE_URL="postgresql://platform_rw:platform_rw@127.0.0.1:$PORT/platform"
export QUALIFICATION_TEST_PROJECTS="$ISO_A,$ISO_B,$ISO_C,$ISO_E"

F_DB="project_$(echo "$ISO_F" | tr -d '-')"
export QUALIFICATION_TEST_DATABASE_URL="postgresql://qualification_rw:qualification_rw@127.0.0.1:$PORT/$F_DB?schema=qualification"
export QUALIFICATION_TEST_ADMIN_URL="postgresql://aisc-postgres-user:$PW@127.0.0.1:$PORT/$F_DB?schema=qualification"
export QUALIFICATION_TEST_PSQL="docker exec -i $NAME psql -q -U aisc-postgres-user -d $F_DB -v ON_ERROR_STOP=1"

# Every URL the tests get points at this container's port and never at a live database name.
for v in QUALIFICATION_TEST_DATABASE_URL QUALIFICATION_TEST_ADMIN_URL QUALIFICATION_TEST_PROJECT_DATABASE_URL \
         QUALIFICATION_TEST_PROJECT_ADMIN_URL QUALIFICATION_TEST_PLATFORM_ROLE_URL; do
  case "${!v}" in *"127.0.0.1:$PORT/"*) ;; *) echo "refusing: $v is not on the throwaway port"; exit 1;; esac
  case "${!v}" in *:5432/*) echo "refusing: $v names port 5432"; exit 1;; esac
done

if [ "${KEEP:-}" = "1" ]; then
  echo "export QUALIFICATION_TEST_DATABASE_URL='$QUALIFICATION_TEST_DATABASE_URL'"
  echo "export QUALIFICATION_TEST_ADMIN_URL='$QUALIFICATION_TEST_ADMIN_URL'"
  echo "export QUALIFICATION_TEST_PSQL='$QUALIFICATION_TEST_PSQL'"
  for v in ISOLATION_SETUP QUALIFICATION_TEST_PROJECT_DATABASE_URL QUALIFICATION_TEST_PROJECT_ADMIN_URL \
           QUALIFICATION_TEST_PLATFORM_ROLE_URL QUALIFICATION_TEST_PROJECTS; do
    echo "export $v='${!v}'"
  done
  echo "# remove with: docker rm -f $NAME"
  exit 0
fi
(cd "$APP" && npx vitest run test/db "$@")
