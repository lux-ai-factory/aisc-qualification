# Deployment

The app is a Next.js 15 server, Postgres 16, and Prisma. Everything self-hosts on a
single server with Docker. There is no authentication — the app is open.

## 1. Local development

```bash
# 1. install deps
npm install

# 2. copy env (DATABASE_URL, LLM_SERVICE_URL; MISTRAL_API_KEY is for the llm service)
cp .env.example .env

# 3. start the supporting services (Postgres + LiteLLM + PDF renderer)
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
#   MISTRAL_API_KEY=<your key>   # consumed by the `llm` (LiteLLM) service (default model is Mistral)
#   LLM_SERVICE_URL=http://llm:4000  # the app's only LLM config
```

Update `docker-compose.yml` `POSTGRES_PASSWORD` to match the password you used in
`DATABASE_URL`.

### 2c. Build and start

```bash
docker compose up -d --build
docker compose logs -f app
```

The container runs `prisma db push` on startup, so the schema is created automatically.

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
