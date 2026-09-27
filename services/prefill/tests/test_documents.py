"""Turning an uploaded file into text.

Whatever somebody hands you: a PDF export of the technical documentation, a
Word document, a text or markdown file. Nothing here needs a model, and none of
it should throw at the caller: a file that cannot be read is an empty document
with a reason, because the form still has to open.
"""
import io

import pytest

from prefill.documents import DocumentUnreadable, read_document


def test_plain_text():
    assert read_document(b"System name: MCAS\n", "notes.txt") == "System name: MCAS"


def test_markdown_is_text():
    assert "MCAS" in read_document(b"# MCAS\n\nA scoring system.\n", "readme.md")


def test_the_name_decides_and_the_case_of_it_does_not():
    assert read_document(b"hello", "NOTES.TXT") == "hello"


def test_text_that_is_not_utf8_is_still_read():
    """A Word export saved as text is often cp1252. Losing a curly quote is
    better than losing the document."""
    text = read_document("System: café".encode("cp1252"), "notes.txt")
    assert "System" in text


def test_an_unknown_extension_is_refused_rather_than_guessed():
    with pytest.raises(DocumentUnreadable) as refused:
        read_document(b"\x00\x01", "system.exe")
    assert "exe" in str(refused.value)


def test_an_empty_file_is_refused():
    with pytest.raises(DocumentUnreadable):
        read_document(b"", "notes.txt")


def test_a_docx_is_read_as_its_paragraphs():
    docx = pytest.importorskip("docx")
    document = docx.Document()
    document.add_heading("System name", level=2)
    document.add_paragraph("MCAS")
    buffer = io.BytesIO()
    document.save(buffer)

    text = read_document(buffer.getvalue(), "technical-documentation.docx")

    assert "System name" in text
    assert "MCAS" in text


def test_a_docx_that_is_not_a_docx_is_refused_not_crashed():
    with pytest.raises(DocumentUnreadable):
        read_document(b"not a zip file at all", "broken.docx")


def test_a_pdf_that_is_not_a_pdf_is_refused_not_crashed():
    with pytest.raises(DocumentUnreadable):
        read_document(b"not a pdf", "broken.pdf")
