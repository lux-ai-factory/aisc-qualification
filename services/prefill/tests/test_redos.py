"""No line of an uploaded file can make the readers backtrack for minutes.

A long run of whitespace used to cost time in the square of its length: "\\s*#*\\s*" is two
adjacent \\s* when there is no '#', and a "\\s*" before a separator is retried at every start
position of a search. One 100,000-space line took about 18 minutes on the event loop, which
stopped the whole service for every project.

Each check runs in a child process that is killed at its budget: re holds the GIL, so a thread
could not be timed out.
"""
from __future__ import annotations

import multiprocessing
import os
import socket
import threading
import time

import pytest

N = 100_000
SPACES = " " * N

_FORK = multiprocessing.get_context("fork")


def _child(queue, fn, args):
    started = time.perf_counter()
    fn(*args)
    queue.put(time.perf_counter() - started)


def _elapsed(fn, *args, kill_after: float = 5.0) -> float:
    """How long fn(*args) takes, or kill_after when it has not finished by then."""
    queue = _FORK.Queue()
    child = _FORK.Process(target=_child, args=(queue, fn, args))
    child.start()
    child.join(kill_after)
    if child.is_alive():
        child.kill()
        child.join()
        return kill_after
    assert child.exitcode == 0, f"the check raised (exit code {child.exitcode})"
    return queue.get()


# Lines a document can hold: a prefix that gets a pattern started, a long whitespace run, an end
# that makes it fail.
PREFIXES = ("", "a", "#", "## ", "risks", "risk 1", "components", "component 1", "annex iv", "1", "1 a", "a [c")
LINES = [p + ws + end for p in PREFIXES for ws in (SPACES, "\t" * N) for end in ("x", "x [c")]


def _match_all(pattern):
    for line in LINES:
        pattern.match(line)


def _patterns():
    from prefill import components, fields, form_import, headings, risks

    return {
        "RISKS_HEADING": risks.RISKS_HEADING,
        "risks._ROW_HEADING": risks._ROW_HEADING,
        "COMPONENTS_HEADING": headings.COMPONENTS_HEADING,
        "components._ROW_HEADING": components._ROW_HEADING,
        "components._ANNEX_LINE": components._ANNEX_LINE,
        "fields._ANNEX_HEADING": fields._ANNEX_HEADING,
        "form_import._TRAILING_CITATION": form_import._TRAILING_CITATION,
    }


@pytest.mark.parametrize("name", sorted(_patterns()))
def test_each_heading_pattern_is_linear_on_a_long_line(name):
    pattern = _patterns()[name]
    # 48 lines of 100,000 characters each: a linear pattern needs a few milliseconds per line.
    assert _elapsed(_match_all, pattern) < 0.1 * len(LINES) / 4


# Documents that put such a line where each reader looks.
DOCUMENTS = {
    "a whitespace line": "a\n" + SPACES + "x\nb",
    "a whitespace line between words": "a" + SPACES + "x\nb",
    "a tab line": "a\n" + "\t" * N + "x\nb",
    "in the risk section": "Risks\n" + SPACES + "x\n",
    "a risk row heading": "Risks\nrisk 1" + SPACES + "x\n",
    "risk areas": "Risks\nRisk: biased scoring\nAreas: Right" + SPACES + "x\n",
    "in the components section": "Components\n" + SPACES + "x\n",
    "a component row heading": "Components\ncomponent 1" + SPACES + "x\n",
    "a pick list": "Domain: Finance" + SPACES + "x\n",
    "an Annex heading": "1 a" + SPACES + "x\n",
}

QUESTIONS = [{"field": "q1", "text": "What does the system do?", "citation": "Art. 11", "annexPoint": "1a"}]


def _read_everything(text):
    from prefill import components, fields, picks, risks

    fields.proposals_from_text(text)
    fields.metadata_from_text(text)
    fields.proposals_for_questions(text, QUESTIONS)
    risks.risks_from_text(text)
    components.components_from_text(text)
    picks.picks_from_text(text)


@pytest.mark.parametrize("name", sorted(DOCUMENTS))
def test_every_reader_reads_a_long_line_quickly(name):
    assert _elapsed(_read_everything, DOCUMENTS[name]) < 2.0


def _import(raw, filename):
    from prefill.form_import import parse_form_file

    parse_form_file(raw, filename)


@pytest.mark.parametrize(
    "raw, filename",
    [
        (("- a" + SPACES + "x [c\n").encode(), "form.md"),
        (("text,citation\na" + SPACES + "x [c,Art. 1\n").encode(), "form.csv"),
    ],
    ids=["markdown", "csv"],
)
def test_a_form_file_with_a_long_line_is_read_quickly(raw, filename):
    assert _elapsed(_import, raw, filename) < 2.0


def _post_prefill():
    from fastapi.testclient import TestClient

    from app import app

    # the conftest's client carries the caller's token, and the fork inherits it
    r = TestClient(app).post(
        "/prefill", files={"file": ("doc.txt", ("a\n" + SPACES + "x\nb").encode(), "text/plain")}
    )
    assert r.status_code == 200, r.text


def test_prefill_answers_a_long_line_within_two_seconds():
    assert _elapsed(_post_prefill) < 2.0


# Part 3: a slow document runs in the thread pool, so /health still answers meanwhile.

def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.mark.parametrize(
    "path, reader, filename",
    [("/prefill", "read_document", "doc.txt"), ("/forms/import", "parse_form_file", "form.md")],
)
def test_a_slow_document_does_not_stop_health(monkeypatch, path, reader, filename):
    import httpx
    import uvicorn

    import app as app_module

    def slow(*args, **kwargs):
        time.sleep(1.5)  # CPU-bound work in the real reader; blocking either way
        raise app_module.DocumentUnreadable("slow")

    monkeypatch.setattr(app_module, reader, slow)
    port = _free_port()
    server = uvicorn.Server(uvicorn.Config(app_module.app, host="127.0.0.1", port=port, log_level="error"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    try:
        base = f"http://127.0.0.1:{port}"
        for _ in range(100):
            if server.started:
                break
            time.sleep(0.05)
        token = os.environ["QUALIFICATION_WEB_TO_PREFILL_TOKEN"]
        upload = threading.Thread(
            target=lambda: httpx.post(
                base + path,
                files={"file": (filename, b"text", "text/plain")},
                headers={"X-AISC-Service-Token": token},
                timeout=10,
            )
        )
        upload.start()
        time.sleep(0.3)  # the upload is inside the slow reader now
        started = time.perf_counter()
        health = httpx.get(base + "/health", timeout=5)
        waited = time.perf_counter() - started
        upload.join()
        assert health.status_code == 200
        assert waited < 0.5, f"/health waited {waited:.2f}s for the upload"
    finally:
        server.should_exit = True
        thread.join(5)
