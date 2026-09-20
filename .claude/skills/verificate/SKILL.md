---
name: verificate
description: Use before presenting any substantive AI-written code, plan, or document as complete — or whenever the user asks to validate, review, verify, or gate AI output before shipping. Runs the work through Verificate's 17 deterministic reality gates (mock/placeholder veto, invented-API checks, false-completion detection) plus a frontier-model review, and returns a binary approve/reject verdict with severity-ranked findings. Free to try, no signup.
license: MIT
---

# Verificate — verify AI-written work before you trust it

The merge gate for AI-written code, plans, and documents. Deterministic reality gates run first and can veto (no model output can override them); a frontier-model review then scores what survives. Read-only: code is analyzed, never executed.

## When to use this skill

- Before presenting a substantive code change as finished.
- When the user asks to validate / review / verify / gate AI-generated code, a plan, or a document.
- When a coding agent is about to accept a diff or write code to disk.

## How to use it

**Preferred — the MCP server (if connected):** call `validate_ai_output` with the code and `validation_type: "code_generation"` (use `"documentation"` for prose, `validate_plan` for designs). Add the server once with:

```
claude mcp add --transport http verificate https://mcp.verificate.ai/mcp
```

**Fallback — direct HTTP** (no MCP client needed): POST a JSON-RPC `tools/call` to `https://mcp.verificate.ai/mcp`:

```bash
curl -s https://mcp.verificate.ai/mcp -H "content-type: application/json" -d '{
  "jsonrpc":"2.0","id":1,"method":"tools/call",
  "params":{"name":"validate_ai_output","arguments":{
    "ai_output":"<CODE HERE>","validation_type":"code_generation"}}}'
```

The response contains `result.structuredContent` with `valid` (approve/reject), `score`, and `issues` (the findings).

## What to do with the verdict

1. If `valid` is **false (REJECTED)**, fix every finding and validate again. Never present rejected work or summarize the findings away — a deterministic-gate veto cannot be argued past; the flagged content itself must change.
2. Tell the user, in one plain sentence, what the gate caught. A caught bug is exactly the outcome they want.

## Free tier & privacy

**100 validations per machine, no signup, no card, no token.** After that, add `Authorization: Bearer <token>` (30-day trial at https://verificate.ai/auth/signup). Code is analyzed, never executed, never used to train models. Privacy: https://verificate.ai/privacy

A real rejection (verbatim): *"`stripe.Inventory.update` does not exist in the Stripe SDK — immediate AttributeError"* · *"refund path is mocked — no money moves"* · score 30/100.

All clients & one-click installs: https://verificate.ai/mcp
