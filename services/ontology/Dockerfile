# AIRO ontology service (FastAPI + rdflib).
#
# Build context is the APP ROOT (apps/qualification), not this directory, because
# the Annex IV points are shared with the Next.js form and live in src/data:
#   docker build -f services/ontology/Dockerfile .
FROM python:3.12.15-slim@sha256:a0f57064cbdcd6285fa45f51237ab0b35ea8ebaed06a1f5973e89e19dfb86704

WORKDIR /app

COPY services/ontology/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY services/ontology/ ./
# The shared Annex IV points, beside the package, where annex_points.py looks last.
COPY src/data/annexPoints.json ./airo_min/annex_points.json

# runs as its own user, not root
RUN useradd --system --uid 10043 --no-create-home ontology
USER ontology
EXPOSE 8011
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8011"]
