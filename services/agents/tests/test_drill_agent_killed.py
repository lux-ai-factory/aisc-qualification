"""Phase 5 drill: the card agent killed mid-run (SIGKILL). What it sent before is kept, the run has no
end (the ledger shows it open, never "finished"), and after a restart the next run, with its own run id,
is whole. The platform is a stub that records what reaches its internal route."""
import json
import os
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

pytest.importorskip("uvicorn")
HERE = Path(__file__).parent


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


@pytest.fixture
def platform():
    got = []

    class Stub(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_POST(self):
            body = self.rfile.read(int(self.headers["Content-Length"]))
            got.append(json.loads(body))
            self.send_response(202)
            self.end_headers()
    server = ThreadingHTTPServer(("127.0.0.1", free_port()), Stub)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_port}", got
    server.shutdown()


def agent(platform_url, port, work_seconds):
    env = {**os.environ, "LEDGER_MODE": "record", "PLATFORM_URL": platform_url,
           "PLATFORM_LEDGER_AGENTS_TOKEN": "agents-drill-token", "QUALIFICATION_WEB_TO_AGENTS_TOKEN": "web-drill-token",
           "DRILL_WORK_SECONDS": str(work_seconds)}
    proc = subprocess.Popen([sys.executable, str(HERE / "drill_runner.py"), str(port)], env=env)
    for _ in range(600):                                              # BAF's imports are slow: up to 60 s
        try:
            urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{port}/health",
                                                          headers={"X-AISC-Service-Token": "web-drill-token"}), timeout=1)
            return proc
        except OSError:
            time.sleep(0.1)
    proc.kill()
    raise RuntimeError("the drill's agent did not start")


def start_run(port, run_id, request_id):
    req = urllib.request.Request(f"http://127.0.0.1:{port}/fill/{uuid.uuid4()}/q1", method="POST",
                                 headers={"X-AISC-Service-Token": "web-drill-token", "X-AISC-Run-Id": run_id,
                                          "X-AISC-Request-Id": request_id})
    assert urllib.request.urlopen(req, timeout=5).status == 202


def test_drill_the_agent_killed_mid_run(platform):
    url, got = platform
    port = free_port()
    first, request_id = str(uuid.uuid4()), str(uuid.uuid4())
    proc = agent(url, port, work_seconds=60)
    try:
        start_run(port, first, request_id)
        for _ in range(100):                                          # until its start and its call are in
            if len(got) >= 2:
                break
            time.sleep(0.05)
        proc.send_signal(signal.SIGKILL)                              # mid-run
        proc.wait(timeout=10)
    finally:
        if proc.poll() is None:
            proc.kill()
    killed = [(e["action"], e["run_id"]) for e in got]
    assert killed == [("agent.run_started", first), ("ai.llm_call", first)]   # kept; no end: the run is open

    second = str(uuid.uuid4())
    proc = agent(url, port, work_seconds=0)
    try:
        start_run(port, second, request_id)
        for _ in range(100):
            if any(e["action"] == "agent.run_finished" for e in got):
                break
            time.sleep(0.05)
    finally:
        proc.kill()
        proc.wait(timeout=10)
    after = [(e["action"], e["run_id"]) for e in got[len(killed):]]
    assert after == [("agent.run_started", second), ("ai.llm_call", second), ("agent.run_finished", second)]
    print(f"\nDRILL agent killed: run {first[:8]} kept {len(killed)} events and stays open; run {second[:8]} whole")
