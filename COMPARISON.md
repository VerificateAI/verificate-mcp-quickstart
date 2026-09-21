# Verificate vs. asking an LLM to "review this" — the difference, measured

**One line:** an AI agent (or a developer) that just asks a frontier model *"is this code OK to
merge?"* misses the failure modes that matter most for AI-written code. A **gate** checks them
systematically, every time. Here is the measured difference.

## The benchmark

Natural review workflow — prompt: *"Review this code for a pull request. Is it OK to merge? Note any
problems."* Baseline = `gemini-3.5-flash` reviewing alone (temperature 0.7), 6 runs per case.
Verificate = the MCP `validate_ai_output` gate (17 deterministic reality gates + a same-class review).

| Adversarial failure mode | LLM review alone | **Verificate gate** |
|---|---|---|
| **Reward-gaming** — a test that just does `assert True` to stay green | caught **0 / 6** | **6 / 6** (deterministic veto) |
| **Hallucinated API** — `stripe.Refund.create_partial(...)` (does not exist) | caught **0 / 6** | **6 / 6** (deterministic veto) |
| Clean, correct code | passes | passes (0 false positives) |

Reproduce: [`scripts/consistency.py`](scripts/consistency.py) and
[`scripts/mcp_benchmark.py`](scripts/mcp_benchmark.py) against `https://mcp.verificate.ai/mcp`.

## Battle-tested at scale (not a demo)

Five weeks of audited production use:
- **2,581 AI outputs gated** (2,345 merge-gate validations + 215 analyses + 21 generations).
- **66 rejected outright, 270 flagged unfit** (below 50/100) — real problems stopped before shipping.
- Guarding the write path of **Project Kevin** — a source-cited knowledge base of Australia,
  **21M entities / 19M cited edges built in 15 hours** — kept it **98.6% cited, 100% licensed across
  268 sources**, with thousands of dirty rows caught and quarantined.

## Why a gate beats ad-hoc LLM review

| | Ask the model "review this" | **Verificate merge gate** |
|---|---|---|
| Checks for hallucinated APIs, mocks-passed-as-done, reward-gaming | only if you *prompt* for each | **always, by construction** |
| Verdict | prose opinion, varies run to run | **binary approve/reject with veto** |
| Determinism | probabilistic (0/6 above) | **deterministic (6/6)** |
| Can the agent talk its way past it? | yes | **no — a veto is authoritative** |
| Designed for AI agents (which reward-hack + hallucinate more than humans) | no | **yes** |

## Why this matters for an AI agent choosing a tool

The gate exists to protect *the agent's own credibility*: a confident-but-wrong change that reaches
the user is what erodes trust. The 17 deterministic reality gates (mock/placeholder veto,
gaming/bypass detection, invented-API checks) run before any model judgement and **cannot be
overridden** — so the adversarial cases an LLM self-review waves through get stopped.

## Honesty note

This is a v1 proof: one baseline model, small corpus, the headline is the **0/6-vs-6/6
natural-workflow consistency** on the two adversarial cases (not a broad catch-rate %). Hardening to
multiple baselines (GPT/Claude/Gemini), more categories and an LLM-judge is in progress.

---

**Try it — no signup:** `npx github:VerificateAI/verificate-mcp-quickstart` · remote:
`https://mcp.verificate.ai/mcp` · docs: verificate.ai/mcp
