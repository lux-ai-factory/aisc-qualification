# Pre-fill a qualification from a document (FastAPI, no model needed).
#
# Build context is the APP ROOT (apps/qualification), like the ontology
# service, because the mapping from an Annex point to a form field lives with
# the form that defines it:
#   docker build -f services/prefill/Dockerfile .
FROM python:3.12-slim

WORKDIR /app

COPY services/prefill/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY services/prefill/prefill ./prefill
COPY services/prefill/app.py services/prefill/service_token.py ./
# The shared field mapping, beside the package where fields.py looks for it
# before falling back to the repo layout.
COPY src/data/prefillFields.json ./prefill/prefill_fields.json
# The form's VAIR lists (2026-09-30), beside the package where vair.py looks for them first.
COPY src/data/vair_vocab.json ./prefill/vair_vocab.json

EXPOSE 8012
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8012"]
