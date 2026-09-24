"""The service the form talks to: one upload in, the form's fields out."""
import io
import json

import pytest
from fastapi.testclient import TestClient

from app import app

client = TestClient(app)


def upload(text=b"System name: MCAS\n", name="doc.txt", **form):
    return client.post(
        "/prefill",
        files={"file": (name, io.BytesIO(text), "text/plain")},
        data=form,
    )


def test_health():
    assert client.get("/health").status_code == 200


def test_an_upload_comes_back_as_the_form_s_fields():
    response = upload()
    assert response.status_code == 200
    body = response.json()
    assert body["values"]["systemName"] == "MCAS"
    assert body["filled"] == ["systemName"]


def test_the_mode_decides_what_happens_to_what_is_there():
    current = json.dumps({"systemName": "Mine"})
    kept = upload(current=current, mode="empty").json()
    replaced = upload(current=current, mode="replace").json()
    assert kept["values"]["systemName"] == "Mine"
    assert replaced["values"]["systemName"] == "MCAS"


def test_the_default_mode_is_the_careful_one():
    """A caller that forgets to say does not lose somebody's typing."""
    body = upload(current=json.dumps({"systemName": "Mine"})).json()
    assert body["values"]["systemName"] == "Mine"


def test_a_mode_nobody_defined_is_422_not_a_guess():
    assert upload(mode="overwrite").status_code == 422


def test_a_file_it_cannot_read_says_so():
    response = upload(text=b"\x00", name="system.exe")
    assert response.status_code == 422
    assert "exe" in response.json()["detail"]


def test_an_empty_file_says_so():
    response = upload(text=b"")
    assert response.status_code == 422


def test_current_that_is_not_json_is_refused_rather_than_ignored():
    """Ignoring it would silently turn "fill the empty ones" into "fill all"."""
    assert upload(current="not json", mode="empty").status_code == 422


def test_a_document_with_nothing_in_it_for_this_form_is_not_an_error():
    body = upload(text=b"An essay about nothing in particular.").json()
    assert body["values"] == {}
    assert body["filled"] == []
    assert body["read"] is True


def test_it_reports_how_it_read_the_document():
    """The form tells the person what happened, so "nothing was filled" can be
    told apart from "the model is not configured"."""
    body = upload().json()
    assert body["source"] == "document"
    assert "model" in body


RISKY = b"System name: MCAS\n\nRisks\nRisk: wrongly refused\nAffected: user\nImpact areas: fundamental rights\n"


def test_the_document_s_risks_come_back_as_rows():
    body = upload(text=RISKY).json()
    assert [r["risk"] for r in body["risks"]] == ["wrongly refused"]
    assert body["risks"][0]["areas"] == ["right"]
    assert body["risksKept"] is False


def test_risks_are_not_mixed_into_the_field_values():
    """The rows are a list on their own: the form writes values onto fields by
    name, and a list there has nowhere to go."""
    assert "risks" not in upload(text=RISKY).json()["values"]


def test_rows_somebody_wrote_are_kept_unless_they_asked_to_replace():
    mine = json.dumps([{"risk": "typed"}])
    kept = upload(text=RISKY, current_risks=mine, mode="empty").json()
    replaced = upload(text=RISKY, current_risks=mine, mode="replace").json()
    assert kept["risks"] is None and kept["risksKept"] is True
    assert replaced["risks"][0]["risk"] == "wrongly refused"


def test_a_document_without_risks_leaves_the_rows_alone():
    assert upload().json()["risks"] is None


def test_current_risks_that_are_not_a_list_are_refused():
    assert upload(text=RISKY, current_risks='{"risk": "x"}').status_code == 422


def test_it_says_how_many_risks_the_document_has_even_when_it_keeps_the_form_s():
    """So the form can say what pressing "replace" would bring in."""
    body = upload(text=RISKY, current_risks=json.dumps([{"risk": "typed"}]), mode="empty").json()
    assert body["risksProposed"] == 1
    assert upload().json()["risksProposed"] == 0
