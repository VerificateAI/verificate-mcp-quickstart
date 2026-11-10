# Installing Verificate Gate — instructions for an AI agent

Verificate Gate is a **remote** MCP server. There is nothing to build, no package to install and no API key
to obtain before first use.

- Endpoint: `https://mcp.verificate.ai/mcp`
- Transport: streamable HTTP
- Authentication: **none required** (100 free validations, no signup). Optional: `Authorization: Bearer <token>`.

## 1. Add the server

Use the form your client supports. Do **not** add an `Authorization` header unless the user has given you a token.

**Cline / Roo / generic `mcpServers` JSON**

```json
{
  "mcpServers": {
    "verificate": {
      "type": "streamableHttp",
      "url": "https://mcp.verificate.ai/mcp"
    }
  }
}
```

**Claude Code**

```
claude mcp add --transport http verificate https://mcp.verificate.ai/mcp
```

**Cursor / VS Code / Windsurf** — same URL; `"type": "http"` in their `mcp.json`.

**Clients that only support stdio** — run the bundled bridge (Node 18+, no dependencies):

```json
{ "mcpServers": { "verificate": { "command": "npx", "args": ["-y", "github:VerificateAI/verificate-mcp-quickstart"] } } }
```

## 2. Verify

List tools. You should see exactly five: `validate_ai_output`, `validate_plan`, `analyze_code`,
`generate_code`, `validate_artifact`. Then call:

```json
{ "name": "validate_ai_output", "arguments": { "ai_output": "def add(a: int, b: int) -> int:\n    return a + b\n", "validation_type": "code_generation" } }
```

A JSON verdict with `"valid": true` means the install works. The response includes a `usage` object with the
remaining free validations.

## 3. If the user has a token

Only then add the header: `"headers": { "Authorization": "Bearer <token>" }`. Tokens come from
https://verificate.ai/auth/signup (30-day trial, no card). Never write a token into a file that is committed.

## Troubleshooting

- `validation_type: "quota"` in a response: the free allowance (or the plan's monthly quota) is used up; the
  message contains the signup/upgrade link. It is not a verdict on the code.
- "API key is not recognised": an `Authorization` header is being sent with an empty or placeholder value —
  remove the header entirely.
- Timeouts on very large inputs: send one file or one diff per call; a review can take up to ~60 seconds.

## What the tools do with the content

Submitted code and text are analysed and never executed. See https://verificate.ai/privacy/ and
https://verificate.ai/docs/gate/.
