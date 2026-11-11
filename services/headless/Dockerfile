# ---- Base ----
FROM ghcr.io/astral-sh/uv:python3.12-alpine AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# ---- Builder: install locked deps, then copy the service ----
FROM base AS builder

COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

COPY app.py schemas.py card.py service_token.py default_questionnaire.py default_questionnaire.json ontology.py ./

# ---- Final runtime image ----
FROM base AS runtime

ENV UV_NO_SYNC=1
COPY --from=builder /app/.venv /app/.venv
COPY app.py schemas.py card.py service_token.py default_questionnaire.py default_questionnaire.json ontology.py ./

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
