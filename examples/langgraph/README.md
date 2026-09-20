# Verificate for LangChain / LangGraph

A **veto gate for AI-written code**, as a LangGraph node. Your agent writes code; this node runs it through the hosted [Verificate MCP server](https://mcp.verificate.ai/mcp) — 17 deterministic reality gates + a frontier-model review — and routes a **REJECTED** verdict back to a fix loop instead of letting a mocked refund path or an invented SDK call reach your user.

An agent that ships confident-but-wrong code loses its user's trust. This is the safety net that keeps it shipping.

## Install & run

```bash
pip install langchain-mcp-adapters langgraph langchain-openai
python verificate_guardrail.py
```

**100 free validations per machine — no signup, no token.** After that, `export VERIFICATE_TOKEN=...` (30-day trial, no card: https://verificate.ai/auth/signup).

## The 10-line version

```python
from langchain_mcp_adapters.client import MultiServerMCPClient

client = MultiServerMCPClient({"verificate": {
    "url": "https://mcp.verificate.ai/mcp", "transport": "streamable_http"}})
tools = await client.get_tools()          # validate_ai_output, validate_plan, analyze_code, generate_code

# add validate_ai_output as a gate node; route REJECTED -> fix, APPROVED -> proceed
```

`verificate_guardrail.py` in this folder is a complete runnable graph: **write → gate → (fix → gate)\* → done**, bounded to 3 attempts.

## Why a gate node beats "just give the agent the tool"

A tool an agent *may* call is one it skips under pressure. A **graph node** the output must pass through is deterministic — the veto is structural, not optional. That's the LangGraph way, and it's exactly what a veto gate needs.

Privacy: code is analyzed, never executed, never trained on. https://verificate.ai/privacy
Main repo (all clients + one-click installs): https://github.com/Verificate-Dev/verificate-mcp-quickstart
