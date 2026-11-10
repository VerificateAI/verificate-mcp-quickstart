"""Verificate guardrail for LangGraph — a veto gate for AI-written code.

Drop this node into any LangGraph agent that writes code. It runs the agent's
output through the hosted Verificate MCP server (17 deterministic reality gates +
a frontier-model review, with veto power) and routes a REJECTED verdict back to a
fix loop instead of letting it reach the user.

Why: an agent that confidently ships a mocked refund path or an invented SDK call
loses its user's trust. The gate is the safety net that keeps the agent shipping.

No signup: every machine gets 100 free validations. After that, set VERIFICATE_TOKEN
(30-day trial at https://verificate.ai/auth/signup).

    pip install langchain-mcp-adapters langgraph langchain-openai

Run:  python verificate_guardrail.py
"""
import os
from typing import Annotated, TypedDict

from langchain_mcp_adapters.client import MultiServerMCPClient


VERIFICATE_MCP_URL = "https://mcp.verificate.ai/mcp"


async def get_verificate_tools():
    """Load Verificate's tools from the hosted remote MCP server (streamable HTTP)."""
    headers = {}
    if os.environ.get("VERIFICATE_TOKEN"):          # optional — free tier needs none
        headers["Authorization"] = f"Bearer {os.environ['VERIFICATE_TOKEN']}"
    client = MultiServerMCPClient(
        {
            "verificate": {
                "url": VERIFICATE_MCP_URL,
                "transport": "streamable_http",
                "headers": headers,
            }
        }
    )
    tools = await client.get_tools()
    return {t.name: t for t in tools}


# ---------------------------------------------------------------------------
# The guardrail node: gate code before it leaves the graph.
# ---------------------------------------------------------------------------
class GateState(TypedDict):
    code: str
    verdict: str          # "approved" | "rejected"
    findings: list
    attempts: int


async def verificate_gate(state: GateState) -> GateState:
    """Validate state['code']; set verdict + findings. Deterministic veto is authoritative."""
    tools = await get_verificate_tools()
    result = await tools["validate_ai_output"].ainvoke(
        {"ai_output": state["code"], "validation_type": "code_generation"}
    )
    # The tool returns text (JSON) — parse the verdict + findings out of it.
    import json
    try:
        payload = json.loads(result if isinstance(result, str) else result[0].text)
    except Exception:
        payload = {"valid": False, "issues": ["could not parse verdict"]}
    return {
        **state,
        "verdict": "approved" if payload.get("valid") else "rejected",
        "findings": payload.get("issues", []),
        "attempts": state.get("attempts", 0) + 1,
    }


def route_after_gate(state: GateState) -> str:
    """APPROVED -> done; REJECTED -> fix loop (bounded)."""
    if state["verdict"] == "approved":
        return "done"
    return "fix" if state["attempts"] < 3 else "give_up"


# ---------------------------------------------------------------------------
# Minimal runnable graph: write -> gate -> (fix -> gate)* -> done
# ---------------------------------------------------------------------------
async def _demo():
    from langgraph.graph import StateGraph, START, END
    from langchain_openai import ChatOpenAI

    model = ChatOpenAI(model="gpt-4o", temperature=0)

    async def write_code(state: GateState) -> GateState:
        fix_note = ""
        if state.get("findings"):
            fix_note = "\n\nYour previous attempt was REJECTED for: " + "; ".join(state["findings"][:5])
        msg = await model.ainvoke(
            "Write a Python function process_refund(order_id, amount) that issues a "
            "real Stripe refund. Complete, no placeholders." + fix_note
        )
        return {**state, "code": msg.content}

    g = StateGraph(GateState)
    g.add_node("write", write_code)
    g.add_node("gate", verificate_gate)
    g.add_edge(START, "write")
    g.add_edge("write", "gate")
    g.add_conditional_edges("gate", route_after_gate,
                            {"fix": "write", "done": END, "give_up": END})
    app = g.compile()

    final = await app.ainvoke({"code": "", "verdict": "", "findings": [], "attempts": 0})
    print(f"verdict={final['verdict']} after {final['attempts']} attempt(s)")
    if final["findings"]:
        print("findings:", final["findings"])


if __name__ == "__main__":
    import asyncio
    asyncio.run(_demo())
