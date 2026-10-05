"""An upload is read up to the limit, never whole (code review B9, 2026-10-05): the three upload
routes read the entire file into memory before comparing its size with PREFILL_MAX_BYTES."""
import asyncio
from pathlib import Path

import app as prefill_app


class FakeUpload:
    def __init__(self, size):
        self.size, self.asked = size, []

    async def read(self, n=-1):
        self.asked.append(n)
        return b"x" * (self.size if n < 0 else min(n, self.size))


def test_reads_at_most_one_byte_past_the_limit():
    upload = FakeUpload(prefill_app.MAX_BYTES * 3)
    try:
        asyncio.run(prefill_app.read_upload(upload))
    except prefill_app.HTTPException as exc:
        assert exc.status_code == 413
    else:
        raise AssertionError("a file past the limit was accepted")
    assert upload.asked == [prefill_app.MAX_BYTES + 1]


def test_a_file_within_the_limit_comes_back_whole():
    upload = FakeUpload(1000)
    assert asyncio.run(prefill_app.read_upload(upload)) == b"x" * 1000


def test_every_upload_route_reads_through_it():
    source = Path(prefill_app.__file__).read_text()
    assert "await file.read()" not in source
    assert source.count("await read_upload(file)") == 3
