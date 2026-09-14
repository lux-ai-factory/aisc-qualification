# AIRO ontology service (FastAPI + rdflib).
#
# Build context is the APP ROOT (apps/qualification), not this directory, because
# the picker vocabulary is shared with the Next.js form and lives in src/data:
#   docker build -f services/ontology/Dockerfile .
FROM python:3.12-slim

WORKDIR /app

COPY services/ontology/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY services/ontology/ ./
# The shared vocabulary, next to the package where vocab.py looks for it last.
COPY src/data/airo_vocab.json ./airo_min/airo_vocab.json

EXPOSE 8011
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8011"]
