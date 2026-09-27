# Deployment

The app is a Next.js 15 server, Postgres 16, and Prisma. Everything self-hosts on a
single server with Docker. There is no authentication — the app is open.

## 1. Local development

```bash
# 1. install deps
npm install

# 2. copy env (DATABASE_URL, and a model key if you want the filler to run)
cp .env.example .env

# 3. start the supporting services (Postgres, ontology, filler, PDF renderer)
docker compose up -d

# 4. run migrations
npx prisma migrate dev

# 5. dev server
npm run dev
```

Open http://localhost:3000.

## 2. Production deploy on a single server

Prereqs on the server: Docker + Docker Compose, ports 80/443 open, a domain pointing at
the box (for HTTPS).

### 2a. Pull the repo

```bash
git clone <your-repo-url> qualification_ai_system
cd qualification_ai_system
```

### 2b. Configure env

```bash
cp .env.example .env
# edit .env and set:
#   DATABASE_URL=postgresql://app:<strong-pass>@db:5432/qualification?schema=public
#   MISTRAL_API_KEY=<your key>   # read by the filler service (services/agents)
#   BAF_LLM_PROVIDER=mistral     # or anthropic, openai, ollama, ... see services/agents/README.md
#   BAF_LLM_MODEL=mistral-large-latest
#
# The app itself makes no LLM calls. With no key at all it still runs: the card
# is built from the answers, and the two prose-derived properties stay empty.
```

Update `docker-compose.yml` `POSTGRES_PASSWORD` to match the password you used in
`DATABASE_URL`.

### 2c. Build and start

```bash
docker compose up -d --build
docker compose logs -f app
```

Every project has a database of its own. The `qualification-migrate` one-shot runs `scripts/migrate-projects.mjs`,
which runs `prisma migrate deploy` in every project database at start, and the app migrates a project's database
the first time it opens it. The web container itself runs no schema step.

Before deploying 20260925150000_two_level_forms, take a backup of the qualification schema: `pg_dump --schema=qualification`
(for example `docker compose exec db pg_dump -U <user> -d <db> --schema=qualification > qualification-before-two-level-forms.sql`).
The migration drops the old form tables in the same transaction that copies them, and there is no down
migration: the dump is the way back.

A database created by `prisma db push` has no migration history. Baseline it before the first start with the
new image: run `prisma migrate resolve --applied <name>` for every migration in `prisma/migrations` that the
database already reflects, then start the container, which applies the rest.

### 2d. HTTPS (Caddy — easiest)

Install Caddy on the host and create `/etc/caddy/Caddyfile`:

```
your-domain.tld {
  reverse_proxy localhost:3000
}
```

```bash
sudo systemctl restart caddy
```

Caddy fetches a Let's Encrypt cert automatically. (Alternatives: nginx + certbot,
Traefik in compose.)

## 3. Backups

Nightly Postgres dump (cron):

```bash
0 3 * * * docker compose -f /path/to/docker-compose.yml exec -T db \
  pg_dump -U app qualification | gzip > /var/backups/qualification-$(date +\%F).sql.gz
```

Keep `postgres-data/` out of git (already in `.gitignore`).

## 4. Updating

```bash
git pull
docker compose up -d --build app
```

Migrations run on container start.

## 5. Troubleshooting

- **`P1001: Can't reach database`** — `DATABASE_URL` host should be `db` (the compose
  service name) when the app runs in compose, `localhost` when running `npm run dev` on
  the host.
- **Schema drift after a pull** — run `docker compose exec app npx prisma migrate deploy`.

---

##  License

This document is part of the AISC project, licensed under the [Apache License 2.0](LICENSE).  
© 2024–2026 Université du Luxembourg and Luxembourg Institute of Science and Technology (LIST).
