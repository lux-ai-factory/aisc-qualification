"""The renderer's routes: what qualification-web calls, and only that.

qualification-web posts a card to /render/pdf (SystemCardRendererClient) and names the
download itself (ai-card.pdf/route.ts), so the renderer offers no HTML route and sets no
file name of its own.
"""
import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient

import app as service
from tests.test_form_coverage import policy_only


@pytest.fixture
def client():
    return TestClient(service.app, raise_server_exceptions=False)


def test_there_is_no_html_route(client):
    assert client.post("/render/html", json=policy_only()).status_code == 404


def test_the_pdf_comes_back_without_a_file_name(client, monkeypatch):
    monkeypatch.setattr(service.renderer, "render_pdf", lambda card: b"%PDF-1.7 test")
    res = client.post("/render/pdf", json=policy_only())
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert res.content == b"%PDF-1.7 test"
    assert "content-disposition" not in res.headers
