#!/usr/bin/env python3
"""Minimal data server for quota-pets: serves quota.json and agents.json from this folder.

Run:  python3 tools/example_server.py 10026
Then set "server": "http://localhost:10026" in pets/config.json.
It listens on 127.0.0.1 only. To serve other machines, pass a host as well
(python3 tools/example_server.py 10026 0.0.0.0) and use "http://<this machine>:10026".
There is no authentication: anyone who can reach the port can read the numbers.
Edit the two JSON files by hand, or replace load() with calls to your provider's usage API.
Format: docs/API.md. Standard library only.
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
SAMPLE = {
    "quota.json": {"quota": {
        "claude": {"ok": True, "windows": [{"id": "5h", "used_pct": 12}, {"id": "7d", "used_pct": 40}]},
        "claude2": {"ok": True, "windows": [{"id": "5h", "used_pct": 0}, {"id": "7d", "used_pct": 5}]},
        "codex": {"ok": True, "windows": [{"id": "7d", "used_pct": 30}]},
        "grok": {"ok": True, "windows": [{"id": "7d", "used_pct": 55}]},
    }},
    "agents.json": {"agents": [
        {"id": "cli:claude", "state": "working", "last_activity_age_sec": 5},
        {"id": "cli:codex", "state": "idle", "last_activity_age_sec": 600},
        {"id": "cli:grok", "state": "idle", "last_activity_age_sec": 120},
        {"id": "cli:qwen", "state": "working", "last_activity_age_sec": 3, "doing": "Writing unit tests"},
    ]},
}


def load(name):
    p = HERE / name
    if not p.exists():
        p.write_text(json.dumps(SAMPLE[name], indent=2))
    return json.loads(p.read_text())


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        route = {"/api/quota": "quota.json", "/api/agents": "agents.json"}.get(self.path.split("?")[0])
        if not route:
            self.send_error(404)
            return
        body = json.dumps(load(route)).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        self.send_response(204)
        self.end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 10026
    host = sys.argv[2] if len(sys.argv) > 2 else "127.0.0.1"
    print(f"quota-pets example server on {host}:{port}")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
