# System-card PDF renderer (FastAPI + Jinja + WeasyPrint). WeasyPrint needs
# Pango/Cairo/GDK-Pixbuf + a font at runtime, so the image is Debian-based
# (bookworm), with uv managing the Python deps.
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PATH="/app/.venv/bin:$PATH"

RUN apt-get update && apt-get install -y --no-install-recommends \
      libpango-1.0-0 \
      libpangocairo-1.0-0 \
      libgdk-pixbuf-2.0-0 \
      libcairo2 \
      libffi8 \
      fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---- Builder: install locked deps, then copy the service ----
FROM base AS builder

COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

# ---- Final runtime image ----
FROM base AS runtime

ENV UV_NO_SYNC=1
COPY --from=builder /app/.venv /app/.venv
COPY . .

EXPOSE 8005
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8005"]
