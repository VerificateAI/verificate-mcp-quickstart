#!/usr/bin/env node
/**
 * Verificate MCP — stdio bridge
 *
 * A zero-dependency MCP server (stdio transport) that exposes the Verificate
 * validation tools locally and forwards tool calls to the hosted Verificate
 * gateway. Lets stdio-only MCP clients (and directory health checks) use the
 * hosted service.
 *
 *   VERIFICATE_TOKEN  – Bearer token from https://verificate.ai (dashboard).
 *                       Without it, initialize/tools/list still work; tool
 *                       calls return an instructive error.
 *   VERIFICATE_URL    – Override the gateway URL (default: production).
 */

"use strict";

const GATEWAY =
  process.env.VERIFICATE_URL ||
  "https://mcp.verificate.ai/mcp";
const TOKEN = process.env.VERIFICATE_TOKEN || "";
// Upstream request limit (ms). Default sits above the gateway's own ~90s review deadline.
const UPSTREAM_TIMEOUT_MS = Math.max(5000, Number(process.env.VERIFICATE_TIMEOUT_MS) || 120000);
const VERSION = "1.8.8";
const PROTOCOL_VERSION = "2025-06-18";

// Mirrored from the hosted gateway (tools/list etc.) — regenerate with
// scripts in the main repo when server definitions change; directories
// (Glama and others) score THESE local definitions.
const TOOLS = [
  {
    "name": "validate_artifact",
    "title": "Gate a deployable artifact against the Verificate production doctrine",
    "description": "Deterministic production-readiness gate for AI-built systems. Verifies the invariants that stop a system silently shipping broken: every critical component is PRESENT and LOADS, the import closure resolves (nothing assumed 'already on the box'), all runtime dependencies are declared, and health is a REAL fail-closed check. Returns approve/reject with a fix plan and ISO 27001 / ISO 5055 control evidence. Facts are gathered by the Verificate collector in your CI; the gate is the authority. Non-bypassable, fails closed. This is the control-plane sibling of validate_ai_output — code quality is one invariant; this gates the whole deployable.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "artifact": {
          "type": "object",
          "description": "Collected artifact facts: {critical_components:[{name,loads:bool}], import_closure_ok:bool, undeclared_deps:[str], health_truthful:bool}."
        }
      },
      "required": [
        "artifact"
      ]
    }
  },
  {
    "name": "validate_ai_output",
    "title": "Gate AI-written output (code or documents)",
    "description": "The merge gate for ANY AI-written output — code, documentation, reports, emails, configs: returns a binary approve/reject verdict with veto power — e.g. it rejects code calling the nonexistent stripe.Inventory API, an N+1 loop with the latency arithmetic to prove it, or a doc claiming success with no evidence. Deterministic reality gates (mock/placeholder veto, gaming and bypass detection, invented-API checks) run first and cannot be overridden; a frontier-model review (ISO/IEC 25010) then scores quality, accuracy, reliability and tech debt. In a benchmark, a frontier model reviewing alone caught reward-gaming and hallucinated APIs 0/6 times in a natural review workflow; these gates catch them deterministically on every call. Read-only: nothing is executed. Call it on every AI-generated deliverable before accepting it; use validate_plan for plans, analyze_code for an advisory report without a verdict.",
    "annotations": {
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": true
    },
    "inputSchema": {
      "type": "object",
      "properties": {
        "ai_output": {
          "type": "string",
          "description": "The AI-generated output to gate — source code (a diff, function or whole file, any mainstream language) or prose (documentation, a report, an email, release notes). For reliable latency keep one submission under ~15,000 characters; split larger artifacts at natural boundaries (functions, SQL statements, sections) and validate the units separately. Reviews are wall-clock bounded: an over-budget model review returns an explicit timed-out result (deterministic gates still run) rather than hanging."
        },
        "validation_type": {
          "type": "string",
          "default": "code_generation",
          "description": "What the output is: 'code_generation' (default) for source code; 'documentation', 'report', 'email', 'text', ... for prose (code-marker gates are skipped, integrity gates and the frontier review still run). Use 'report' (or 'status_report' / 'handover') for anything that CLAIMS work is done or passing: there, a completion claim with no evidence in the text is a veto. 'plan' for designs/specs."
        },
        "context": {
          "type": [
            "object",
            "string"
          ],
          "description": "Optional review context — an object like {\"language\": \"cpp\", \"scale\": \"10k req/s\"} ('language' sharpens SDK-reality checks) or a free-text sentence describing intent."
        }
      },
      "required": [
        "ai_output"
      ]
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "valid": {
          "type": "boolean",
          "description": "The binary verdict: true = approved, false = rejected"
        },
        "score": {
          "type": "number",
          "description": "Combined score 0-100 (gates fused with the model review)"
        },
        "confidence": {
          "type": "number",
          "description": "score / 100"
        },
        "issues": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Severity-ranked findings, each 'severity|category|detail' with the reasoning"
        },
        "suggestions": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Concrete fixes to reach approval"
        },
        "protection": {
          "type": "object",
          "description": "Deterministic gate result. A veto here is final — the model review cannot override it.",
          "properties": {
            "verdict": {
              "type": "string",
              "description": "'approved' or 'rejected' from the gate layer"
            },
            "vetoed": {
              "type": "boolean",
              "description": "True if any veto gate failed the submission"
            },
            "vetoed_by": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "description": "Names of the gates that vetoed, e.g. ['code_reality_gate']"
            },
            "protection_score": {
              "type": "number",
              "description": "Deterministic gate score, 0-100"
            }
          },
          "additionalProperties": true
        },
        "provider": {
          "type": "string",
          "description": "Model that ran the deep review, or 'protection-gates-only'"
        }
      },
      "required": [
        "valid",
        "score",
        "issues"
      ],
      "additionalProperties": true
    }
  },
  {
    "name": "validate_plan",
    "title": "Gate an implementation plan",
    "description": "The gate for PLANS, designs and specs — run BEFORE any code is written, the cheapest place to catch a bad design. Returns the same binary verdict shape as validate_ai_output, with findings on completeness, feasibility, performance and scalability implications, security risks and missing considerations (e.g. it rejects a plan that polls an API every 100ms per client, with the request-volume math). Read-only: nothing is executed or stored beyond the verdict. Use validate_ai_output for the code that follows.",
    "annotations": {
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": true
    },
    "inputSchema": {
      "type": "object",
      "properties": {
        "plan": {
          "type": "string",
          "description": "The implementation plan, design or spec to validate, as plain text or markdown — e.g. a numbered migration plan or an architecture sketch."
        },
        "context": {
          "type": "object",
          "description": "Optional constraints the review should weigh, e.g. {\"system\": \"payments API\", \"scale\": \"1M users\", \"constraints\": \"PostgreSQL only\"}."
        }
      },
      "required": [
        "plan"
      ]
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "valid": {
          "type": "boolean",
          "description": "The binary verdict: true = approved, false = rejected"
        },
        "score": {
          "type": "number",
          "description": "Combined score 0-100 (gates fused with the model review)"
        },
        "confidence": {
          "type": "number",
          "description": "score / 100"
        },
        "issues": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Severity-ranked findings, each 'severity|category|detail' with the reasoning"
        },
        "suggestions": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Concrete fixes to reach approval"
        },
        "protection": {
          "type": "object",
          "description": "Deterministic gate result. A veto here is final — the model review cannot override it.",
          "properties": {
            "verdict": {
              "type": "string",
              "description": "'approved' or 'rejected' from the gate layer"
            },
            "vetoed": {
              "type": "boolean",
              "description": "True if any veto gate failed the submission"
            },
            "vetoed_by": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "description": "Names of the gates that vetoed, e.g. ['code_reality_gate']"
            },
            "protection_score": {
              "type": "number",
              "description": "Deterministic gate score, 0-100"
            }
          },
          "additionalProperties": true
        },
        "provider": {
          "type": "string",
          "description": "Model that ran the deep review, or 'protection-gates-only'"
        }
      },
      "required": [
        "valid",
        "score",
        "issues"
      ],
      "additionalProperties": true
    }
  },
  {
    "name": "analyze_code",
    "title": "Advisory code deep-dive",
    "description": "Advisory deep-dive on existing code — scores and findings, deliberately NO pass/fail verdict, so it never blocks an agent. Surfaces performance hot paths, scalability cliffs, reliability gaps and tech debt with concrete latency/throughput arithmetic (e.g. 'O(n²) dedup: ~4s at 10k items'). Read-only: the code is analyzed, never executed. Use it to understand a validate_ai_output rejection or review inherited code; use validate_ai_output when you need an accept/reject decision.",
    "annotations": {
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": true
    },
    "inputSchema": {
      "type": "object",
      "properties": {
        "code": {
          "type": "string",
          "description": "The source code to analyze — a function, file or pasted excerpt."
        },
        "analysis_type": {
          "type": "string",
          "default": "quality",
          "enum": [
            "quality",
            "performance",
            "scalability",
            "security",
            "tech_debt"
          ],
          "description": "Lens for the review: 'quality' (default, broad ISO/IEC 25010 pass) or a focused pass on one dimension."
        },
        "language": {
          "type": "string",
          "description": "Source language, e.g. 'python', 'typescript', 'cpp', 'sql', 'swift'. Inferred if omitted; stating it sharpens findings."
        }
      },
      "required": [
        "code"
      ]
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "quality_score": {
          "type": "number",
          "description": "0-100 advisory score for the chosen lens"
        },
        "complexity": {
          "type": "string",
          "description": "low | medium | high"
        },
        "issues": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Findings as 'severity|category|detail' with supporting arithmetic"
        },
        "suggestions": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "provider": {
          "type": "string"
        }
      },
      "required": [
        "quality_score",
        "issues"
      ],
      "additionalProperties": true
    }
  },
  {
    "name": "generate_code",
    "title": "Generate gated code",
    "description": "Generate code and gate it in one step: an LLM writes the implementation, then the same protection engine as validate_ai_output vets it — retrying generation when the gate rejects. If every attempt is vetoed you still receive the last attempt, clearly marked validated:false with the gate findings — rejected code is never presented as clean. Generation runs on our infrastructure; nothing executes in your environment.",
    "annotations": {
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": false,
      "openWorldHint": true
    },
    "inputSchema": {
      "type": "object",
      "properties": {
        "prompt": {
          "type": "string",
          "description": "What to build, with any constraints worth enforcing — e.g. 'a rate-limited retry decorator with exponential backoff, stdlib only'."
        },
        "language": {
          "type": "string",
          "default": "python",
          "description": "Target language for the generated code, e.g. 'python' (default), 'typescript', 'go', 'sql'."
        },
        "max_tokens": {
          "type": "integer",
          "default": 4000,
          "minimum": 256,
          "maximum": 32768,
          "description": "Generation budget. The default 4000 fits most functions/classes; raise it for multi-file scaffolds."
        }
      },
      "required": [
        "prompt"
      ]
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "generated": {
          "type": "boolean",
          "description": "False only when no provider returned code"
        },
        "code": {
          "type": "string",
          "description": "The generated implementation"
        },
        "validated": {
          "type": "boolean",
          "description": "True if the protection gates approved the final attempt; false means the gate findings in 'protection' explain the veto"
        },
        "validation_score": {
          "type": "number",
          "description": "Deterministic gate score, 0-100"
        },
        "attempts": {
          "type": "integer",
          "description": "Generation attempts before approval or give-up"
        },
        "protection": {
          "type": "object",
          "description": "Deterministic gate result. A veto here is final — the model review cannot override it.",
          "properties": {
            "verdict": {
              "type": "string",
              "description": "'approved' or 'rejected' from the gate layer"
            },
            "vetoed": {
              "type": "boolean",
              "description": "True if any veto gate failed the submission"
            },
            "vetoed_by": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "description": "Names of the gates that vetoed, e.g. ['code_reality_gate']"
            },
            "protection_score": {
              "type": "number",
              "description": "Deterministic gate score, 0-100"
            }
          },
          "additionalProperties": true
        },
        "provider": {
          "type": "string"
        }
      },
      "required": [
        "generated"
      ],
      "additionalProperties": true
    }
  }
];

const PROMPTS = [
  {
    "name": "gate_my_changes",
    "title": "Gate my changes",
    "description": "Run the Verificate merge gate on code and loop until it is approved: validate, fix every finding, re-validate.",
    "arguments": [
      {
        "name": "code",
        "description": "The code to gate (paste the diff or file)",
        "required": true
      }
    ]
  },
  {
    "name": "review_my_plan",
    "title": "Review my plan",
    "description": "Gate an implementation plan before any code is written: validate it, address every finding, re-validate.",
    "arguments": [
      {
        "name": "plan",
        "description": "The implementation plan or design to review",
        "required": true
      }
    ]
  }
];

const RESOURCES = [
  {
    "uri": "verificate://gates",
    "name": "The 17 protection gates",
    "description": "What each deterministic gate watches for, and why a veto cannot be overridden.",
    "mimeType": "text/markdown"
  },
  {
    "uri": "verificate://example-verdict",
    "name": "Example rejection verdict",
    "description": "A verbatim REJECTED 30.8/100 verdict from the production gateway.",
    "mimeType": "text/markdown"
  }
];

const RESOURCE_TEXT = {
  "verificate://gates": "# The 17 Verificate protection gates\n\nDeterministic reality gates run before any model judgement. Any veto gate can fail a\nsubmission outright — the frontier-model review that follows can lower a score but can\nnever override a gate veto.\n\n| Gate | Watches for |\n|---|---|\n| code_reality_gate | Invented/hallucinated APIs and SDK calls; code that cannot work as written |\n| reality_validation | Claims that don't match what the code actually does |\n| bullshit_detector | Confident-sounding filler and unsupported claims in output |\n| gaming_prevention | Output shaped to pass checks rather than do the work |\n| bypass_detector | Attempts to route around the gate or soften its verdict |\n| integrity_monitor | Inconsistencies between stated intent and implementation |\n| completion_detector | 'Done' claims without proof (tests, deploys, integrations) |\n| anti_simplification | Silent scope-narrowing: the easy 80% presented as the whole task |\n| ai_failure_prevention | Known LLM failure patterns (placeholder/mocked wire paths, TODO stubs) |\n| enhanced_brutal_feedback | Ensures findings are specific and actionable, not vague hedges |\n| enterprise_validation_orchestrator | Sequencing and fusion of gate verdicts with the model review |\n| static_analysis | Structural checks that ground the review in the actual AST |\n| frontend_validation | UI code reality: dead handlers, unbound state, phantom selectors |\n| visual_validation | Rendered-output claims vs what the code can actually render |\n| collaboration_paradigm_enforcer | Agent behaviour: stop-and-ask vs silently guessing |\n| prompt_engineering_validator | Prompt-injection and instruction-conflict detection in inputs |\n| prompt_enhancer | Normalises weak validation requests so the review sees full context |\n\nGate verdicts are deterministic: same input, same verdict, full audit trail.\n\n",
  "verificate://example-verdict": "# A real verdict (verbatim from the production gateway)\n\n12 plausible lines of AI-written payment code. Result: REJECTED — 30.8/100,\nvetoed by code_reality_gate. Findings included:\n\n- \"N+1 synchronous API calls ... For 100 items, this results in 100 sequential HTTP\n  roundtrips, taking ~10-20 seconds and blocking the event loop/worker thread ...\n  will trigger Stripe rate limiting (100 req/sec limit).\"\n- \"stripe.Inventory is not a valid Stripe SDK resource.\"\n- \"Floating-point representation issues lead to rounding errors in financial\n  transactions; Stripe API requires integer cents.\"\n\nEach finding is an afternoon of production debugging, caught in seconds.\n\n"
};

function promptMessages(name, args) {
  args = args || {};
  const T = {
    gate_my_changes: {
      description: "Gate code through validate_ai_output until approved.",
      text: "Run the Verificate merge gate on the code below.\n1. Call validate_ai_output with the code.\n2. If the verdict is REJECTED, fix every finding (they include the reasoning and production arithmetic) and call validate_ai_output again on the fixed code.\n3. Repeat until approved, then summarise what the gate caught and what you changed.\n\nCODE:\n",
      arg: "code",
    },
    review_my_plan: {
      description: "Gate a plan through validate_plan until approved.",
      text: "Review the implementation plan below with the Verificate plan gate.\n1. Call validate_plan with the plan.\n2. If the verdict is REJECTED, revise the plan to address every finding and validate again.\n3. Repeat until approved, then present the final plan with the findings you addressed.\n\nPLAN:\n",
      arg: "plan",
    },
  };
  const t = T[name];
  if (!t) return null;
  return { description: t.description, messages: [{ role: "user", content: { type: "text", text: t.text + (args[t.arg] || "") } }] };
}

/* ---------------- upstream (streamable HTTP) ---------------- */

let sessionId = null;
let upstreamId = 0; // the gateway requires integer JSON-RPC ids; client ids are re-mapped

async function upstreamPost(body, extraHeaders = {}) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    // Only send auth when a token is set; without it the gateway serves the
    // no-signup free tier (100 validations per machine) instead of rejecting.
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    ...extraHeaders,
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  // Bound every upstream call. The gateway caps a review at ~90s and answers "could not review" past
  // that; without a client-side limit a stalled connection left the MCP client waiting forever.
  let res;
  try {
    res = await fetch(GATEWAY, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  } catch (err) {
    if (err && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new Error(`gateway did not answer within ${Math.round(UPSTREAM_TIMEOUT_MS / 1000)}s — retry, or split a large submission`);
    }
    throw err;
  }
  const sid = res.headers.get("mcp-session-id");
  if (sid) sessionId = sid;
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`gateway HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/event-stream")) {
    // Parse SSE: take the last data: payload that parses as JSON-RPC.
    let last = null;
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith("data:")) {
        try {
          last = JSON.parse(line.slice(5).trim());
        } catch {
          /* keep scanning */
        }
      }
    }
    if (last === null) throw new Error("gateway returned an empty event stream");
    return last;
  }
  if (!text) return null; // e.g. 202 Accepted for notifications
  return JSON.parse(text);
}

async function ensureUpstreamSession() {
  if (sessionId) return;
  const init = await upstreamPost({
    jsonrpc: "2.0",
    id: ++upstreamId,
    method: "initialize",
    params: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "verificate-mcp-bridge", version: VERSION },
    },
  });
  if (init && init.error) throw new Error(`gateway initialize failed: ${init.error.message}`);
  await upstreamPost({ jsonrpc: "2.0", method: "notifications/initialized" }).catch(() => {});
}

async function forwardToolCall(id, params) {
  await ensureUpstreamSession();
  const res = await upstreamPost({ jsonrpc: "2.0", id: ++upstreamId, method: "tools/call", params });
  if (res && res.error) {
    return { jsonrpc: "2.0", id, error: res.error };
  }
  return { jsonrpc: "2.0", id, result: res.result };
}

/* ---------------- stdio JSON-RPC loop ---------------- */

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function toolError(id, message) {
  return {
    jsonrpc: "2.0",
    id,
    result: { content: [{ type: "text", text: message }], isError: true },
  };
}

async function handle(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case "initialize":
      return send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: (params && params.protocolVersion) || PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: true }, prompts: { listChanged: true }, resources: { listChanged: true } },
          serverInfo: { name: "verificate-mcp", version: VERSION },
          instructions:
            "Validation gates for AI coding. Call validate_ai_output on substantive changes before presenting them as complete; a REJECTED verdict means fix the findings and re-validate. Requires VERIFICATE_TOKEN (30-day free trial: https://verificate.ai/auth/signup).",
        },
      });
    case "notifications/initialized":
    case "notifications/cancelled":
      return; // notifications get no response
    case "ping":
      return send({ jsonrpc: "2.0", id, result: {} });
    case "tools/list":
      return send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    case "prompts/list":
      return send({ jsonrpc: "2.0", id, result: { prompts: PROMPTS } });
    case "prompts/get": {
      const payload = promptMessages(params && params.name, params && params.arguments);
      if (!payload) {
        return send({ jsonrpc: "2.0", id, error: { code: -32602, message: "Unknown prompt: " + (params && params.name) } });
      }
      return send({ jsonrpc: "2.0", id, result: payload });
    }
    case "resources/list":
      return send({ jsonrpc: "2.0", id, result: { resources: RESOURCES } });
    case "resources/read": {
      const uri = params && params.uri;
      if (!RESOURCE_TEXT[uri]) {
        return send({ jsonrpc: "2.0", id, error: { code: -32602, message: "Unknown resource: " + uri } });
      }
      return send({ jsonrpc: "2.0", id, result: { contents: [{ uri, mimeType: "text/markdown", text: RESOURCE_TEXT[uri] }] } });
    }
    case "tools/call": {
      // No token? Forward anyway — the gateway grants a no-signup free tier
      // (100 validations/machine) and, when it's used up, returns an upsell that
      // surfaces inline in the client. A token lifts the cap to the full plan.
      try {
        return send(await forwardToolCall(id, params));
      } catch (err) {
        return send(toolError(id, `Verificate gateway error: ${err.message}`));
      }
    }
    default:
      if (id !== undefined && id !== null) {
        send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
      }
  }
}

let buffer = "";
let pending = 0;
let stdinClosed = false;

function maybeExit() {
  if (stdinClosed && pending === 0) process.exit(0);
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      continue;
    }
    pending++;
    Promise.resolve(handle(msg))
      .catch((err) => {
        if (msg.id !== undefined && msg.id !== null) {
          send({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: String(err.message || err) } });
        }
      })
      .finally(() => {
        pending--;
        maybeExit();
      });
  }
});
// Drain in-flight requests before exiting when the client closes stdin.
process.stdin.on("end", () => {
  stdinClosed = true;
  maybeExit();
});
