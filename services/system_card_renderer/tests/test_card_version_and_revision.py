"""The card says which AI card version and revision it is, and when a later revision of the same version
corrected it, so two revisions of one version are never mistaken for each other."""
from pathlib import Path

from models import SystemCard
from renderer import SystemCardRenderer
from template_engine import TemplateEngine

from tests.test_form_coverage import policy_only

TEMPLATES = Path(__file__).resolve().parent.parent / "templates"


def html_of(**over) -> str:
    return SystemCardRenderer(TemplateEngine(TEMPLATES)).render_html(SystemCard(**{**policy_only(), **over}))


def test_a_corrected_card_names_its_version_revision_and_why():
    html = html_of(card_version=1, card_revision=2, amend_reason="Provider name was wrong",
                   amend_requested_by="Eindhoven")
    assert "Version 1, revision 2" in html
    assert "Corrected: Provider name was wrong. Requested by Eindhoven." in html
    assert "Superseded" not in html


def test_a_replaced_revision_says_it_was_superseded():
    html = html_of(card_version=1, card_revision=1, superseded=True)
    assert "Version 1" in html and "revision 1" not in html
    assert "Superseded" in html


def test_a_card_from_an_app_of_before_says_nothing_about_them():
    html = html_of()
    assert "Version " not in html.split("<h1>")[0].split("eyebrow")[1]
    assert "Superseded" not in html
