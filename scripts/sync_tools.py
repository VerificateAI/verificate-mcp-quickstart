#!/usr/bin/env python3
"""Regenerate the mirrored `const TOOLS = [...]` block in index.js from the hosted gateway's tools/list.

Directories score these local definitions, and stdio clients only see what is listed here — a stale
mirror silently hides tools (validate_artifact was missing).

Usage: python scripts/sync_tools.py [--check]
Exit codes: 0 current/updated · 1 stale (--check) · 2 could not reach or understand the gateway / index.js
"""
import json
import sys
import urllib.error
import urllib.request

URL = "https://mcp.verificate.ai/mcp"
MARKER = "const TOOLS = "


def fail(msg: str) -> "NoReturn":  # noqa: F821
    print("sync_tools: " + msg, file=sys.stderr)
    sys.exit(2)


def fetch_live_tools() -> list:
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}).encode()
    req = urllib.request.Request(URL, data=body, headers={"Content-Type": "application/json",
                                                          "User-Agent": "verificate-quickstart-sync/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.load(resp)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        fail(f"could not reach {URL}: {e}")
    except json.JSONDecodeError as e:
        fail(f"gateway did not return JSON: {e}")
    tools = (payload.get("result") or {}).get("tools") if isinstance(payload, dict) else None
    if not isinstance(tools, list) or not tools or not all(isinstance(t, dict) and t.get("name") for t in tools):
        fail("gateway response has no usable result.tools — refusing to overwrite the mirror with it")
    return tools


def main() -> int:
    live = fetch_live_tools()
    try:
        with open("index.js", "rb") as fh:
            raw = fh.read()
    except OSError as e:
        fail(f"cannot read index.js (run from the repo root): {e}")
    crlf = raw.count(b"\r\n")
    eol = "\r\n" if crlf > raw.count(b"\n") - crlf else "\n"      # keep the file's DOMINANT line ending
    src = raw.decode("utf-8").replace("\r\n", "\n")
    if src.count(MARKER) != 1:
        fail(f"expected exactly one '{MARKER}' in index.js, found {src.count(MARKER)}")
    start = src.index(MARKER) + len(MARKER)
    try:
        current, end = json.JSONDecoder().raw_decode(src, start)   # the block is pure JSON
    except json.JSONDecodeError as e:
        fail(f"the TOOLS block in index.js is not valid JSON: {e}")
    if current == live:
        print(f"TOOLS mirror is current ({len(live)} tools)")
        return 0
    print(f"TOOLS mirror is STALE: mirror={[t.get('name') for t in current]} live={[t['name'] for t in live]}")
    if "--check" in sys.argv:
        return 1
    src = src[:start] + json.dumps(live, indent=2, ensure_ascii=False) + src[end:]
    with open("index.js", "wb") as fh:
        fh.write(src.replace("\n", eol).encode("utf-8"))
    print("index.js updated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
