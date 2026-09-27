"""Domain logic that turns a SystemCard into HTML/PDF bytes."""

from __future__ import annotations

from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import url2pathname

from weasyprint import HTML
from weasyprint.urls import default_url_fetcher

from models import SystemCard
from template_engine import TemplateEngine


class RenderingError(RuntimeError):
    """Raised when WeasyPrint fails to produce a PDF."""


def restricted_url_fetcher(allowed_dir: Path):
    """A WeasyPrint url_fetcher that serves only files under `allowed_dir` and data: URIs.

    The template needs its bundled stylesheet and nothing else. Card text is
    escaped by the template, so this is the second guard: even a stray tag can
    never read a file of the container (file://) or reach a network host.
    """
    root = Path(allowed_dir).resolve()

    def fetch(url: str, *args: object, **kwargs: object) -> dict:
        parts = urlsplit(url)
        scheme = parts.scheme.lower()
        if scheme == "data":
            return default_url_fetcher(url)
        if scheme == "file" and parts.netloc in ("", "localhost"):
            path = Path(url2pathname(parts.path)).resolve()
            if path.is_file() and path.is_relative_to(root):
                return default_url_fetcher(path.as_uri())
        raise ValueError(f"The card renderer does not fetch {url!r}.")

    return fetch


class SystemCardRenderer:
    TEMPLATE_NAME = "system_card.html.j2"

    def __init__(self, engine: TemplateEngine):
        self._engine = engine

    def render_html(self, card: SystemCard) -> str:
        return self._engine.render(self.TEMPLATE_NAME, card=card.model_dump())

    def render_pdf(self, card: SystemCard) -> bytes:
        html = self.render_html(card)
        try:
            return HTML(
                string=html,
                base_url=str(self._engine.templates_dir),
                url_fetcher=restricted_url_fetcher(self._engine.templates_dir),
            ).write_pdf()
        except Exception as exc:
            raise RenderingError(f"WeasyPrint failed: {exc}") from exc
