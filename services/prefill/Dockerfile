# Pre-fill a qualification from a document (FastAPI, no model needed).
#
# Build context is the APP ROOT (apps/qualification), like the ontology
# service, because the mapping from an Annex point to a form field lives with
# the form that defines it:
#   docker build -f services/prefill/Dockerfile .
FROM python:3.12.15-slim@sha256:a0f57064cbdcd6285fa45f51237ab0b35ea8ebaed06a1f5973e89e19dfb86704

WORKDIR /app

COPY services/prefill/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY services/prefill/prefill ./prefill
COPY services/prefill/app.py services/prefill/service_token.py ./
# The shared field mapping, beside the package where fields.py looks for it
# before falling back to the repo layout.
COPY src/data/prefillFields.json ./prefill/prefill_fields.json
# The form's VAIR lists, beside the package, where vair.py looks for them after
# $PREFILL_VAIR_VOCAB_PATH.
COPY src/data/vair_vocab.json ./prefill/vair_vocab.json

# runs as its own user, not root
RUN useradd --system --uid 10041 --no-create-home prefill
USER prefill
EXPOSE 8012
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8012"]
