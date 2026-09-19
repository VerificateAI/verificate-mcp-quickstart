#!/usr/bin/env python3
"""Regenerate the mirrored `const TOOLS = [...]` block in index.js from the hosted gateway's tools/list.
Directories score these local definitions, and stdio clients only see what is listed here — a stale
mirror silently hides tools (validate_artifact was missing). Usage: python scripts/sync_tools.py [--check]"""
import json
import sys
import urllib.request

URL = "https://mcp.verificate.ai/mcp"
req = urllib.request.Request(URL, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}).encode(),
                             headers={"Content-Type": "application/json", "User-Agent": "verificate-quickstart-sync/1.0"})
live = json.load(urllib.request.urlopen(req, timeout=30))["result"]["tools"]

path = "index.js"
raw = open(path, "rb").read()
eol = "\r\n" if b"\r\n" in raw else "\n"
src = raw.decode("utf-8").replace("\r\n", "\n")
marker = "const TOOLS = "
start = src.index(marker) + len(marker)
current, end = json.JSONDecoder().raw_decode(src, start)          # the block is pure JSON
if current == live:
    print(f"TOOLS mirror is current ({len(live)} tools)")
    sys.exit(0)
names = lambda ts: [t["name"] for t in ts]  # noqa: E731
print(f"TOOLS mirror is STALE: mirror={names(current)} live={names(live)}")
if "--check" in sys.argv:
    sys.exit(1)
src = src[:start] + json.dumps(live, indent=2, ensure_ascii=False) + src[end:]
open(path, "wb").write(src.replace("\n", eol).encode("utf-8"))
print("index.js updated")
