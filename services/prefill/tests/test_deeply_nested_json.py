"""JSON nested deeper than the parser can follow, in an uploaded questionnaire file or in a form field, is
refused as not JSON, never answered with a 500."""
import io

import pytest
from fastapi.testclient import TestClient

from app import app

DEEP = b"[" * 100_000 + b"]" * 100_000


def test_a_deeply_nested_questionnaire_file_is_not_json():
    from prefill.questionnaire_file import QuestionnaireFileError, read_questionnaire

    try:
        with pytest.raises(QuestionnaireFileError) as err:
            read_questionnaire(DEEP, "acme.questionnaire.json")
    except RecursionError:
        pytest.fail("the reader let a RecursionError out instead of saying the file is not JSON")
    assert str(err.value) == "this file is not JSON"


def test_a_deeply_nested_current_is_refused_not_a_crash():
    client = TestClient(app, raise_server_exceptions=False)
    response = client.post("/prefill", files={"file": ("doc.txt", io.BytesIO(b"System name: MCAS\n"), "text/plain")},
                           data={"current": DEEP.decode(), "mode": "empty"})
    assert response.status_code == 422, response.text[:300]
