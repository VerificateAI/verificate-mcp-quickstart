# Directory listings — ready to paste

One source of truth for every MCP directory. When a fact below changes, update it here first, then fix the
listings. Form-based directories need an account login (GitHub OAuth) — paste the fields below.

**Name:** Verificate Gate (MCP)
**Tagline (short):** The merge gate for AI-written code — catches mocked code, invented APIs and false "it's done" claims before they ship.
**Category:** Developer Tools / Code Quality / Code Review / Security
**Server type:** Remote, streamable HTTP. **No authentication needed to start** — 100 free validations, no signup. Optional `Authorization: Bearer <token>` (30-day trial, no card: https://verificate.ai/auth/signup).
**Endpoint:** `https://mcp.verificate.ai/mcp`
**Website / install page:** https://verificate.ai/gate/
**Docs:** https://verificate.ai/docs/gate/
**Repo:** https://github.com/VerificateAI/verificate-mcp-quickstart
**Official MCP registry name:** `ai.verificate/mcp`
**License (this client):** MIT
**Security contact:** see SECURITY.md (GitHub private vulnerability reporting)
**Tools (5):** `validate_ai_output`, `validate_plan`, `analyze_code`, `generate_code`, `validate_artifact`

**Description (long):**
Verificate Gate runs the review pass engineers still do by hand on every AI output. Deterministic reality
gates run first and have veto power: placeholder/mock implementations presented as finished, reward-gamed
tests, and unsupported "it's done, all tests pass" completion claims. A frontier-model review then checks
for calls to APIs that do not exist and grades correctness, security, performance and maintainability and returns a fix
plan. If the review cannot run, the gate fails closed instead of approving. Works in Claude Code, Cursor,
VS Code, Windsurf and any MCP client; the same engine gates pull requests through the GitHub Marketplace
Action and LangChain/LangGraph through `verificate-langchain`.

**One-line install (Claude Code):** `claude mcp add --transport http verificate https://mcp.verificate.ai/mcp`

**Never list:** any endpoint under `uq.edu.au` (retired), "25 free validations" (now 100), "token required".

## Where to submit

| Directory | URL | How |
|---|---|---|
| Official registry | https://registry.modelcontextprotocol.io | `mcp-publisher publish` with this repo's `server.json` (several directories ingest from here) |
| GitHub MCP Registry | https://github.com/mcp | ingests the official registry |
| Smithery | https://smithery.ai | GitHub login → Add server |
| Glama | https://glama.ai/mcp/servers | indexes GitHub; claim the listing (`glama.json`) |
| mcp.so | https://mcp.so | submit form |
| PulseMCP | https://www.pulsemcp.com | submit form (also ingests the official registry) |
| MCP Market | https://mcpmarket.com | submit form |
| Cursor directory | https://cursor.directory/mcp | submit form |
| awesome-mcp-servers | https://github.com/punkpeye/awesome-mcp-servers | pull request |
