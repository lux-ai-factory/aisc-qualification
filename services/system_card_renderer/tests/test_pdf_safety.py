"""The PDF renderer never trusts card text as HTML and never fetches outside its templates.

Form names, question text and citations come from an install-wide form library,
so a writer in one project could plant markup that another project's PDF would
render. Two guards: the template escapes every value, and WeasyPrint gets a
url_fetcher that serves only the bundled templates folder and data: URIs.
"""
from pathlib import Path

import pytest

import renderer as renderer_module
from models import SystemCard
from renderer import SystemCardRenderer, restricted_url_fetcher
from template_engine import TemplateEngine

from tests.test_form_coverage import policy_only

ROOT = Path(__file__).resolve().parent.parent
TEMPLATES = ROOT / "templates"

ATTACH = '<a rel="attachment" href="file:///etc/passwd">x</a>'
IMG = '<img src="http://169.254.169.254/latest/meta-data/">'


def hostile() -> dict:
    card = policy_only()
    section = card["ontology"]["additionalDocumentation"][0]
    section["form"] = "Policy <b>bold</b>"
    section["entries"][0]["citation"] = ATTACH
    section["entries"][0]["question"] = "Q <script>alert(1)</script>?"
    section["entries"][0]["answer"] = IMG
    card["description"] = '<link rel="stylesheet" href="http://internal/x.css">'
    return card


def html_of(payload: dict) -> str:
    return SystemCardRenderer(TemplateEngine(TEMPLATES)).render_html(SystemCard(**payload))


class TestTemplateEscapes:
    def test_a_citation_with_markup_is_printed_as_text(self):
        html = html_of(hostile())
        assert ATTACH not in html
        assert "&lt;a rel=&#34;attachment&#34; href=&#34;file:///etc/passwd&#34;&gt;x&lt;/a&gt;" in html

    def test_an_answer_with_markup_is_printed_as_text(self):
        html = html_of(hostile())
        assert IMG not in html
        assert "&lt;img src=" in html

    def test_form_name_question_and_description_are_escaped(self):
        html = html_of(hostile())
        assert "<b>bold</b>" not in html
        assert "Policy &lt;b&gt;bold&lt;/b&gt;" in html
        assert "<script>" not in html
        assert 'href="http://internal/x.css"' not in html

    def test_the_template_own_markup_still_renders(self):
        html = html_of(hostile())
        assert '<link rel="stylesheet" href="styles.css" />' in html
        assert "<h3>Additional documentation: Policy &lt;b&gt;bold&lt;/b&gt;</h3>" in html
        assert '<span class="cite">' in html

    def test_plain_text_renders_unchanged(self):
        html = html_of(policy_only())
        assert "<dt>Acme question 1?<span class=\"cite\">Acme AI Policy §1</span></dt>" in html
        assert "<dd>Acme answer 1.</dd>" in html


class TestUrlFetcher:
    @pytest.fixture
    def fetch(self):
        return restricted_url_fetcher(TEMPLATES)

    @pytest.mark.parametrize(
        "url",
        [
            "file:///etc/passwd",
            "file://localhost/etc/passwd",
            (TEMPLATES / ".." / "renderer.py").resolve().as_uri(),
            TEMPLATES.as_uri() + "/../renderer.py",
            "http://169.254.169.254/latest/meta-data/",
            "https://example.com/x.css",
            "http://localhost:8005/health",
            "ftp://example.com/x",
        ],
    )
    def test_refuses_anything_outside_the_templates(self, fetch, url):
        with pytest.raises(ValueError):
            fetch(url)

    def test_serves_the_bundled_stylesheet(self, fetch):
        result = fetch((TEMPLATES / "styles.css").as_uri())
        try:
            body = result["file_obj"].read() if "file_obj" in result else result["string"]
        finally:
            if "file_obj" in result:
                result["file_obj"].close()
        assert body == (TEMPLATES / "styles.css").read_bytes()

    def test_serves_a_data_uri(self, fetch):
        result = fetch("data:text/plain;base64,aGk=")
        body = result["file_obj"].read() if "file_obj" in result else result["string"]
        assert body == b"hi"


class TestRenderPdfUsesTheFetcher:
    def test_only_the_stylesheet_is_fetched(self, tmp_path, monkeypatch):
        """A template that asks for forbidden URLs still renders; none is fetched."""
        (tmp_path / "styles.css").write_text("body { color: black; }")
        (tmp_path / SystemCardRenderer.TEMPLATE_NAME).write_text(
            '<html><head><link rel="stylesheet" href="styles.css" />'
            '<link rel="stylesheet" href="http://127.0.0.1:9/x.css" /></head><body>'
            '<a rel="attachment" href="file:///etc/passwd">x</a>'
            '<img src="file:///etc/hostname">'
            '<img src="http://169.254.169.254/x.png">'
            "{{ card.system_name }}</body></html>"
        )
        fetched: list[str] = []

        def spy(url, *args, **kwargs):
            fetched.append(url)
            return {"string": b"body { color: black; }", "mime_type": "text/css"}

        monkeypatch.setattr(renderer_module, "default_url_fetcher", spy)
        pdf = SystemCardRenderer(TemplateEngine(tmp_path)).render_pdf(SystemCard(**policy_only()))
        assert pdf.startswith(b"%PDF")
        assert fetched == [(tmp_path / "styles.css").as_uri()]
