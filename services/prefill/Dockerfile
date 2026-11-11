# Pre-fill a qualification from a document (FastAPI, no model needed).
#
# Build context is the APP ROOT (apps/qualification), like the ontology
# service, because the mapping from an Annex point to a form field lives with
# the form that defines it:
#   docker build -f services/prefill/Dockerfile .
FROM ghcr.io/astral-sh/uv:python3.12-alpine AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# ---- Builder: install the locked prefill deps ----
FROM base AS builder

COPY services/prefill/pyproject.toml services/prefill/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

# ---- Final runtime image ----
FROM base AS runtime

ENV UV_NO_SYNC=1
COPY --from=builder /app/.venv /app/.venv

COPY services/prefill/prefill ./prefill
COPY services/prefill/app.py services/prefill/service_token.py ./
# The shared field mapping, beside the package where fields.py looks for it
# before falling back to the repo layout.
COPY src/data/prefillFields.json ./prefill/prefill_fields.json
# The form's VAIR lists, beside the package, where vair.py looks for them after
# $PREFILL_VAIR_VOCAB_PATH.
COPY src/data/vair_vocab.json ./prefill/vair_vocab.json

EXPOSE 8012
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8012"]
