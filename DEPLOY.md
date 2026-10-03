# Deployment

The app is deployed as part of the AISC stack, from the aisc repo root. How to bring the stack up,
which compose services belong to this app and which variables they read is in the
[README](README.md#install-and-run). This page covers what a deployment has to get right about the
database.

## Migrations at start

Every project has a database of its own, made by the platform. The `qualification-migrate` one-shot
runs `scripts/migrate-projects.mjs`, which runs `prisma migrate deploy` in every project database at start,
and the app migrates a project's database the first time it opens it. The web container itself runs
no schema step, and `qualification-web` starts only after `qualification-migrate` has succeeded.
If a project database fails to migrate, `qualification-migrate` exits with status 2 and the web app
does not start; its log names the database.

## Before upgrading an existing install

Before deploying 20260925150000_two_level_forms, take a backup of the qualification schema of each project database: `pg_dump --schema=qualification`
(for example `pg_dump -U <user> -d project_<pid without hyphens> --schema=qualification > qualification-before-two-level-forms.sql`).
The migration drops the old form tables in the same transaction that copies them, and there is no
down migration: the dump is the way back.

A database created by `prisma db push` has no migration history. Baseline it before the first start with the
new image: run `prisma migrate resolve --applied <name>` for every migration in `prisma/migrations` that the
database already reflects, then start the container, which applies the rest.

Never edit a migration that has been applied: Prisma stores each migration's checksum in the
database and treats a changed file as drift.

## Backups

The card data is the `qualification` schema of each project database. Back it up with the rest of
the project databases (`pg_dump` per `project_<pid>` database).

## Troubleshooting

- **Project pages answer 503 "The platform is not answering"**: `PLATFORM_URL` is unset or the
  platform is down. The app asks the platform about every request under `/p/`.
- **A service call fails with 503 "its service tokens are not set"**: the service was started
  without its tokens. Run `scripts/secrets.sh` in the aisc repo and recreate the containers.
- **`PROJECT_DATABASE_URL must contain {database}`**: the variable is a template, not one database's
  URL.

---

## License

This document is part of the AISC project, licensed under the [Apache License 2.0](LICENSE.md).
© 2024–2026 Université du Luxembourg and Luxembourg Institute of Science and Technology (LIST).
