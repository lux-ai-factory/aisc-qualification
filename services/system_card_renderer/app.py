"""FastAPI service that renders a system-card JSON to HTML/PDF.

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
from template_engine import TemplateEngine

ROOT = Path(__file__).resolve().parent
TEMPLATES = ROOT / "templates"

renderer = SystemCardRenderer(TemplateEngine(TEMPLATES))

app = FastAPI(title="AI System Card Renderer", version="0.2.0")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/render/html", response_class=Response)
def render_html(card: SystemCard) -> Response:
    return Response(
        content=renderer.render_html(card),
        media_type="text/html; charset=utf-8",
    )


@app.post("/render/pdf")
def render_pdf(card: SystemCard) -> Response:
    try:
        pdf_bytes = renderer.render_pdf(card)
    except RenderingError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    filename = f"system_card_{card.qualification_id or 'card'}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
