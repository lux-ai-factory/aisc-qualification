# Card agent service (BAF + FastAPI). Build context is the APP ROOT
# (apps/qualification): the drafting prompt is maintained with the ontology
# service.   docker build -f services/agents/Dockerfile .
FROM ghcr.io/astral-sh/uv:python3.12-alpine AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/srv/.venv \
    PATH="/srv/.venv/bin:$PATH"

WORKDIR /srv

# ---- Builder: install the locked agent deps ----
FROM base AS builder

COPY services/agents/pyproject.toml services/agents/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

# ---- Final runtime image ----
FROM base AS runtime

ENV UV_NO_SYNC=1
COPY --from=builder /srv/.venv /srv/.venv

COPY services/agents/ ./
# The drafting prompt is maintained with the ontology service. Copied in at
# build time rather than duplicated in the repository.
COPY services/ontology/prompts/ ./ontology-prompts/

EXPOSE 8012
CMD ["uvicorn", "service:app", "--host", "0.0.0.0", "--port", "8012"]
