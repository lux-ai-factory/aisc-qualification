"""Domain logic that turns a SystemCard into HTML/PDF bytes."""

from __future__ import annotations

from weasyprint import HTML

from models import SystemCard
from template_engine import TemplateEngine


class RenderingError(RuntimeError):
    """Raised when WeasyPrint fails to produce a PDF."""


class SystemCardRenderer:
    TEMPLATE_NAME = "system_card.html.j2"

    def __init__(self, engine: TemplateEngine):
        self._engine = engine

    def render_html(self, card: SystemCard) -> str:
        return self._engine.render(self.TEMPLATE_NAME, card=card.model_dump())

    def render_pdf(self, card: SystemCard) -> bytes:
        html = self.render_html(card)
        try:
            return HTML(string=html, base_url=str(self._engine.templates_dir)).write_pdf()
        except Exception as exc:
            raise RenderingError(f"WeasyPrint failed: {exc}") from exc
