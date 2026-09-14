FROM python:3.12-slim

WORKDIR /srv

COPY services/agents/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt "fastapi==0.115.5" "uvicorn[standard]==0.32.1"

COPY services/agents/ ./
# The drafting prompt is maintained with the ontology service. Copied in at
# build time rather than duplicated in the repository.
COPY services/ontology/prompts/ ./ontology-prompts/

EXPOSE 8012
CMD ["uvicorn", "service:app", "--host", "0.0.0.0", "--port", "8012"]
