# Verificate MCP — your vibe-coded MVP, all the way to production

[![Verificate Gate](https://img.shields.io/badge/gated%20by-Verificate%20Gate-2ea44f?logo=shield&logoColor=white)](https://github.com/VerificateAI/verificate-gate-action)


<p align="center">
  <img src="assets/verificate-demo.gif" alt="Verificate MCP rejecting AI-written payment code at 70, then approving the fix at 91.2 — real output from the live server" width="840">
</p>

<p align="center"><em>Real output from the live server: 12 lines of AI-written payment code — rejected, fixed, approved, in seconds.</em></p>

**You vibe-coded the demo. This ships it.** Between a working demo and a launched product used to stand an experienced CTO and a senior dev team — the people who catch the mock refund path, the invented SDK call, the loop that dies at real traffic. Verificate MCP is that review team as an MCP server: **17 deterministic reality gates with veto power**, fused with a **frontier-model enterprise review** (ISO/IEC 25010: performance, scalability, reliability), run on every AI-written change before it reaches your codebase. The AI writes; the gate holds the bar; you ship. Hosted, zero-install, binary verdict in seconds — in Claude Code, Cursor, Windsurf or any MCP client.

**Not another linter wrapper.** The code-quality shelf on every MCP directory is two things: scanners (ESLint, Semgrep and SonarQube bridges — deterministic rules, no judgment) and prompt relays that pipe your repo to your own LLM key (self-review with extra steps). Verificate is neither: the gates hold veto power that no model output can override.

[![License: MIT](https://img.shields.io/badge/License-MIT-8CCB43.svg)](LICENSE)
[![Official MCP Registry](https://img.shields.io/badge/MCP_Registry-ai.verificate%2Fmcp-blue)](https://registry.modelcontextprotocol.io/v0/servers?search=verificate)
[![Docker MCP Registry](https://img.shields.io/badge/Docker_MCP-PR_%234551-2496ED)](https://github.com/docker/mcp-registry/pull/4551)
[![MCP Market](https://img.shields.io/badge/MCP_Market-verificate-8A2BE2)](https://mcpmarket.com/server/verificate)
[![Free trial](https://img.shields.io/badge/Free_trial-30_days,_no_card-8CCB43)](https://verificate.ai/auth/signup)

Your coding assistant writes a mock and calls it done. It invents an SDK call that doesn't exist. It ships an N+1 loop that passes every test and dies under load. Verificate MCP runs the deep review pass on every AI output — deterministic reality gates first (any one can veto), then an enterprise-grade review scores what survives — **before the code reaches your codebase**.

## A real rejection (verbatim)

12 plausible lines of AI-written payment code were sent through the production gateway. Verdict: **REJECTED — score 30.8/100, vetoed by `code_reality_gate`**, with findings including:

> *"N+1 synchronous API calls … For 100 items, this results in 100 sequential HTTP roundtrips, taking ~10–20 seconds and blocking the event loop/worker thread … will trigger Stripe rate limiting (100 req/sec limit)."*
> *"`stripe.Inventory` is not a valid Stripe SDK resource."*
> *"Floating-point representation issues lead to rounding errors in financial transactions; Stripe API requires integer cents."*

Each of those is an afternoon of production debugging, caught in seconds.

## Measured — vs. asking the model to review its own code

A frontier model asked *"is this OK to merge?"* in a natural workflow missed reward-gaming (a test
that only does `assert True`) and a hallucinated API (`stripe.Refund.create_partial`) in **0 of 6
runs each**. Verificate's gate caught both **6 of 6 — deterministically**, with **0 false positives**
on clean code.

| Adversarial case | LLM review alone | **Verificate gate** |
|---|---|---|
| Reward-gaming (`assert True` test) | 0 / 6 | **6 / 6** |
| Hallucinated API (nonexistent SDK call) | 0 / 6 | **6 / 6** |

**Battle-tested:** 2,581 audited validations over 5 weeks (66 rejected, 270 flagged unfit),
including guarding the write-path of a **21M-entity source-cited knowledge base** (98.6% cited,
100% licensed across 268 sources). Reproduce it: [`scripts/`](scripts/) · full write-up: [`COMPARISON.md`](COMPARISON.md).

## Tools

Each tool has one job — two gates that return verdicts, one advisor that doesn't, one generator:

| Tool | Job | Returns |
|---|---|---|
| `validate_ai_output` | **The merge gate for AI-written code.** Deterministic reality gates (mock/placeholder veto, gaming & bypass detection, invented-API checks) run first and can't be overridden; ISO/IEC 25010 review scores what survives. | Binary **approve/reject** verdict + severity-ranked findings |
| `validate_plan` | **The gate for plans and designs**, before any code exists — completeness, feasibility, scalability implications, risk. The cheapest place to catch a bad design. | Binary **approve/reject** verdict + findings |
| `analyze_code` | **Advisory deep-dive** on existing code — hot paths, rate-limit math, failure modes, tech debt. Use it to understand a rejection or review inherited code. | Scores + findings, deliberately **no verdict** |
| `generate_code` | **Generate + gate in one step** — the LLM writes it, the same protection engine vets it before you see it. | Gated code (no placeholders, no invented APIs) |

### Beyond tools

The server also ships **prompts** and **resources** for a richer client experience:

- Prompts `gate_my_changes` / `review_my_plan` — one-click workflows that loop validate → fix → re-validate until approved.
- Resources `verificate://gates` (what each of the 17 deterministic gates watches for) and `verificate://example-verdict` (a verbatim production rejection).

## Quick start — no signup, no token, 30 seconds

Every machine gets **100 free validations** — no account, no card, no key. Add the URL and go:

**Claude Code**

```bash
claude mcp add --transport http verificate https://mcp.verificate.ai/mcp
```

**Cursor / VS Code — one-click install:**

[![Add Verificate to Cursor](https://img.shields.io/badge/Cursor-Add_Verificate_%E2%80%94_25_free_calls-111111?labelColor=8CCB43)](https://cursor.com/en/install-mcp?name=verificate&config=eyJ1cmwiOiJodHRwczovL21jcC52ZXJpZmljYXRlLmFpL21jcCJ9)
[![Add to VS Code](https://img.shields.io/badge/VS_Code-Add_Verificate-0078d7?labelColor=8CCB43)](https://vscode.dev/redirect/mcp/install?name=verificate&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.verificate.ai%2Fmcp%22%7D)
[![Add to VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Add_Verificate-24bfa5?labelColor=8CCB43)](https://insiders.vscode.dev/redirect/mcp/install?name=verificate&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.verificate.ai%2Fmcp%22%7D)

*LM Studio and Goose one-click buttons are at <https://verificate.ai/mcp> (GitHub strips their custom-protocol links).*

**Windsurf / any MCP client (JSON)**

```json
{
  "mcpServers": {
    "verificate": {
      "url": "https://mcp.verificate.ai/mcp",
      "transport": "http"
    }
  }
}
```

Cursor: `~/.cursor/mcp.json`. Windsurf: `~/.codeium/windsurf/mcp_config.json`.

Then ask your assistant to *"validate this function with verificate"* — a structured verdict comes back in seconds, and every free-tier response shows how many validations you have left and what the gate has caught for you.

### Keep going after the free 100

Sign up at <https://verificate.ai/auth/signup> (30-day trial, no card — then $30/mo) and add your token to the same config:

```bash
claude mcp add --transport http verificate \
  https://mcp.verificate.ai/mcp \
  --header "Authorization: Bearer YOUR_TRIAL_TOKEN"
```

or in the JSON config add `"headers": { "Authorization": "Bearer YOUR_TRIAL_TOKEN" }`.

## Make gating the default

Tools an agent *may* call are tools it will skip under pressure. Add a standing rule (Claude Code: `CLAUDE.md`; Cursor: a rule file):

```text
Before presenting any substantive code change as complete:
1. Call validate_ai_output on the change.
2. If the verdict is REJECTED, fix the findings and re-validate.
3. Never claim tests pass or systems are deployed without proof.
```

One-paste setup prompts that install these rules for you: [PROMPTS.md](PROMPTS.md). Or wire it into CI as a merge gate — see [`examples/`](examples/).

## How it decides

```text
AI output ──► Reality gates (deterministic, any one vetoes)
              • mock/placeholder in the wire path
              • invented/hallucinated APIs
              • claimed-complete without proof
              • gaming & bypass detection
                       │ survivors only
                       ▼
              Enterprise review (ISO/IEC 25010 + MLOps)
              performance · scalability · reliability · tech debt
                       │
                       ▼
              Verdict: score /100 + severity-ranked findings
              (REJECTED = agent fixes findings and re-validates)
```

The two stages are deliberately separate: if reality and quality were blended into one score, a beautifully structured function that fakes its refund path could still average out to "acceptable." A veto architecture makes that impossible.

## The category, honestly

Everything else on the MCP code-quality shelf is free — and that's fair, because a wrapper should be free. What you can't get for free is **judgment with authority**:

| What you'll find on the directories | What it is | What it structurally can't do |
|---|---|---|
| **Linter wrappers** — ESLint MCP, Semgrep MCP, SonarQube MCP | Rule-based scanners exposed as MCP tools. Deterministic, free, worth running. | No judgment. Rules can't know the refund function *never calls the payment provider*, or that `stripe.Inventory` doesn't exist. No verdict, no veto — findings your agent is free to ignore. |
| **BYO-key review relays** | Your repo + a review prompt, piped to your own OpenAI/Anthropic key. | Self-review with extra steps: the reviewer shares the generator's blind spots, there are no deterministic gates underneath, and whatever the model says goes. You maintain keys, versions and hosting. |
| **A bigger model** | Hope the generator reviews itself better. | Self-review inherits self-blindness. An external gate holds the same bar for every model — which also makes **smaller, cheaper models safe to ship with**: same gate either way. |
| **Human review of every AI diff** | The gold standard, at human speed. | Doesn't scale at AI generation speed. The gate does the first pass in seconds; humans review verdicts, not raw diffs. |
| **Verificate MCP** | Deterministic reality gates **with veto**, then a frontier-model enterprise review — fused into one binary verdict. Hosted, always on the current model. | — |

That second layer is the part you pay for: a frontier agent doing the deep review — production arithmetic, failure modes, SDK reality — with a deterministic floor under it that the agent itself cannot argue away.

## Run locally (stdio bridge)

This repo is also a runnable, zero-dependency MCP server: a stdio bridge that serves `initialize`/`tools/list` locally and forwards tool calls to the hosted gateway. Use it with clients that prefer stdio servers:

```bash
VERIFICATE_TOKEN=<your-token> npx github:VerificateAI/verificate-mcp-quickstart
```

Or with Docker:

```bash
docker build -t verificate-mcp .
docker run -i -e VERIFICATE_TOKEN=<your-token> verificate-mcp
```

Without `VERIFICATE_TOKEN`, introspection still works and tool calls return instructions for getting a trial token.

## FAQ

**Does it slow the agent down?** Each validation takes seconds, inside the loop, before work is presented. Compare with a defect found in CI or production plus the context switch to fix it — gating is net-faster for any change that matters.

**Which languages?** Validation is language-agnostic; analysis covers mainstream languages (Python, JS/TS, C++, SQL, Swift, …). Pass `context.language` for best results.

**Can it block my agent?** Yes — that's the point. A REJECTED verdict is designed to send the agent back to fix findings instead of presenting broken work. Your standing rule decides how hard the stop is.

**What about false positives?** Verdicts come with specific findings and the math, so they're auditable in seconds — you're never asked to trust a bare score.

## Security & privacy

- Requests are authenticated with your personal token; keys are single-user and rate-limited, with key-sharing detection.
- Code is processed to produce the verdict and is not used to train models.
- `initialize`/`tools/list` are public (so clients and directories can introspect); every `tools/call` requires your key.

## Pricing

30-day free trial, then USD $30/month (launch offer: 50% off for 3 months). Volume and academic pricing: info@verificate.ai.

## Guides

- [How to catch AI-hallucinated code before it ships](https://verificate.ai/articles/catch-ai-hallucinated-code/)
- [Add a code-review gate to Claude Code in 5 minutes](https://verificate.ai/articles/claude-code-review-mcp-server/)
- [Why AI assistants miss deep performance bugs](https://verificate.ai/articles/ai-coding-performance-bugs/)
- [Use smaller, cheaper AI coding models — safely](https://verificate.ai/articles/cheaper-ai-coding-models-validation-gate/)
- [*Every Bob needs a Wendy*](https://community.ibm.com/community/user/viewdocument/every-bob-needs-a-wendy?CommunityKey=300ac388-08f0-427e-a600-0199bfc9dd2a&tab=librarydocuments) (IBM Community)

## About

Built by [Verificate Pty Ltd](https://verificate.ai) (Sydney, Australia) — an IBM Business Partner. Verificate builds sovereign AI infrastructure: the HELIX inference engine (calibrated confidence scores on every answer), the deterministic Decision Transformer, and this MCP validation server. Product page: <https://verificate.ai/mcp> · Official registry: [`ai.verificate/mcp`](https://registry.modelcontextprotocol.io/v0/servers?search=verificate)

## Licensing

This repo (the stdio bridge, client configs and CI examples) is **MIT** — use it freely.
The Verificate validation engine and hosted gateway it talks to are a **commercial service**
(30-day free trial, then subscription): the 17 protection gates and the frontier-model review
run server-side and are not part of this repository.

<!-- glama-ai-listing -->
## Glama

[![Verificate MCP server score](https://glama.ai/mcp/servers/Verificate-Dev/verificate-mcp-quickstart/badges/score.svg)](https://glama.ai/mcp/servers/Verificate-Dev/verificate-mcp-quickstart)


---

**🌐 Not an English speaker?** Install instructions in हिन्दी · Português · Bahasa Indonesia · Español · 中文 · Tiếng Việt → [INSTALL.md](INSTALL.md)
