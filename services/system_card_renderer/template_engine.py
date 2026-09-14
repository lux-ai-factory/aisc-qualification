"""Jinja template loader, isolated so the renderer can be unit-tested."""

from __future__ import annotations

from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape


class TemplateEngine:
    def __init__(self, templates_dir: Path):
        self._templates_dir = templates_dir
        self._env = Environment(
            loader=FileSystemLoader(str(templates_dir)),
            autoescape=select_autoescape(["html", "xml"]),
            trim_blocks=True,
            lstrip_blocks=True,
        )

    @property
    def templates_dir(self) -> Path:
        return self._templates_dir

    def render(self, template_name: str, **context: object) -> str:
        return self._env.get_template(template_name).render(**context)
