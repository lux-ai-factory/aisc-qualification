# AIRO ontology service (FastAPI + rdflib).
#
# Build context is the APP ROOT (apps/qualification), not this directory, because
# the Annex IV points are shared with the Next.js form and live in src/data:
#   docker build -f services/ontology/Dockerfile .
FROM python:3.12-slim

WORKDIR /app

COPY services/ontology/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY services/ontology/ ./
# The shared Annex IV points, beside the package, where annex_points.py looks last.
COPY src/data/annexPoints.json ./airo_min/annex_points.json

EXPOSE 8011
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8011"]
