# AIRO ontology service (FastAPI + rdflib).
#
# Build context is the APP ROOT (apps/qualification), not this directory, because
# the picker vocabulary is shared with the Next.js form and lives in src/data:
#   docker build -f services/ontology/Dockerfile .
FROM ghcr.io/astral-sh/uv:python3.12-alpine AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    UV_PYTHON=/usr/local/bin/python3.12 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# ---- Builder: install the locked ontology deps ----
FROM base AS builder

COPY services/ontology/pyproject.toml services/ontology/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev --python /usr/local/bin/python3.12

# ---- Final runtime image ----
FROM base AS runtime

ENV UV_NO_SYNC=1
COPY --from=builder /app/.venv /app/.venv

COPY services/ontology/ ./
# The shared vocabulary and Annex IV points, beside the package, where
# pickers.py and annex_points.py look for them last.
COPY src/data/airo_vocab.json ./airo_min/airo_vocab.json
COPY src/data/annexPoints.json ./airo_min/annex_points.json

EXPOSE 8011
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8011"]
