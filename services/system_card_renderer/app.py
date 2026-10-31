"""FastAPI service that renders an AI-card JSON to PDF.

Run locally:
    pip install -r requirements.txt
    uvicorn app:app --port 8005 --reload
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response

from models import SystemCard
from renderer import RenderingError, SystemCardRenderer
from service_token import ServiceTokens
from template_engine import TemplateEngine

ROOT = Path(__file__).resolve().parent
TEMPLATES = ROOT / "templates"

renderer = SystemCardRenderer(TemplateEngine(TEMPLATES))

app = FastAPI(title="AI Card Renderer", version="0.3.0")
# Only qualification-web calls this, with its own token.
app.add_middleware(ServiceTokens, names=("QUALIFICATION_WEB_TO_PDF_TOKEN",))


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/render/pdf")
def render_pdf(card: SystemCard) -> Response:
    try:
        pdf_bytes = renderer.render_pdf(card)
    except RenderingError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    # qualification-web names the download itself, from the card.
    return Response(content=pdf_bytes, media_type="application/pdf")
