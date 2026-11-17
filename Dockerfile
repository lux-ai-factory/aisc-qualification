# Qualification service: answers in, AI card out.
#
# Build context is the repo root; src/ holds the service and the vendored
# AIRO builder (airo_min + airo/*.ttl); data/ holds the shared vocabulary.
FROM ghcr.io/astral-sh/uv:python3.12-alpine AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    UV_PYTHON=/usr/local/bin/python3.12 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# ---- Builder: install the locked deps ----
FROM base AS builder

COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev --python /usr/local/bin/python3.12

# ---- Final runtime image ----
FROM base AS runtime

ENV UV_NO_SYNC=1
COPY --from=builder /app/.venv /app/.venv

# The service under src/ lands at /app (uvicorn picks up app:app).
COPY src/ ./
# The shared vocabulary beside the package, where airo_min picks it up
# (parents[1]/airo for the TTLs, the JSON next to the package).
COPY data/airo_vocab.json ./airo_min/airo_vocab.json
COPY data/annex_points.json ./airo_min/annex_points.json

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
