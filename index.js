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
const VERSION = "1.9.0";
const PROTOCOL_VERSION = "2025-06-18";

// Mirrored from the hosted gateway (tools/list etc.) — regenerate with
// scripts in the main repo when server definitions change; directories
// (Glama and others) score THESE local definitions.
const TOOLS = [
  {
    "name": "validate_artifact",
    "title": "Gate a deployable artifact against the Verificate production doctrine",
    "description": "Deterministic production-readiness gate for AI-built systems. Verifies the invariants that stop a system silently shipping broken: every critical component is PRESENT and LOADS, the import closure resolves (nothing assumed 'already on the box'), all runtime dependencies are declared, and health is a REAL fail-closed check. Returns approve/reject with a fix plan and ISO 27001 / ISO 5055 control evidence. Facts are gathered by the Verificate collector in your CI; the gate is the authority. Non-bypassable, fails closed. This is the control-plane sibling of validate_ai_output — code quality is one invariant; this gates the whole deployable.",
    "annotations": {
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    },
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
    "description": "The merge gate for ANY AI-written output — code, documentation, reports, emails, configs: returns a binary approve/reject verdict with veto power — e.g. it rejects code calling the nonexistent stripe.Inventory API, an N+1 loop with the latency arithmetic to prove it, or a doc claiming success with no evidence. Deterministic checks (mock/placeholder veto, reward-gamed tests, standard-library calls that do not exist, secrets written to logs) run first and cannot be overridden; a Claude Haiku 5.5 review (ISO/IEC 25010, ISO/IEC 5055) then verifies third-party API calls and scores quality, accuracy, reliability and tech debt; its high/critical security and API findings block. In a benchmark, a frontier model reviewing alone caught reward-gaming and hallucinated APIs 0/6 times in a natural review workflow; this gate checks for both on every call. Read-only: nothing is executed. Call it on every AI-generated deliverable before accepting it; use validate_plan for plans, analyze_code for an advisory report without a verdict.",
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
          "description": "Optional review context — an object like {\"language\": \"cpp\", \"scale\": \"10k req/s\"} ('language' sharpens SDK-reality checks) or a free-text sentence describing intent. Reviewed in full as untrusted reference data (it cannot instruct the reviewer or lift a veto); an oversized context is refused, never truncated. Put a dispute of a prior finding, with its evidence, in 'rebuttal'."
        },
        "expected_input_sha256": {
          "type": "string",
          "pattern": "^[0-9a-fA-F]{64}$",
          "description": "Optional SHA-256 (hex) of the exact UTF-8 bytes you intend to submit. A mismatch is refused before any review, proving the gate saw the file you meant."
        },
        "previous_receipt_id": {
          "type": "string",
          "description": "Optional receipt_id of the review this submission revises or adjudicates; recorded to link the review history."
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
          "description": "True ONLY when decision is 'approved' or 'approved_with_conditions'. Rejected, incomplete and refused requests are all false."
        },
        "decision": {
          "type": "string",
          "enum": [
            "approved",
            "approved_with_conditions",
            "rejected",
            "incomplete",
            "refused_input"
          ],
          "description": "The one final gate decision (see decision_reasons, policy_version)."
        },
        "decision_reasons": {
          "type": "array",
          "items": {
            "type": "object"
          },
          "description": "Every rule that fired; `decisive` marks the ones that set the decision."
        },
        "failure_class": {
          "type": [
            "string",
            "null"
          ],
          "description": "input_error | transient_unavailable | incomplete_review | malformed_review | content_defect | deterministic_veto, or null when approved."
        },
        "next_action": {
          "type": "string",
          "description": "none | address_conditions | fix_and_resubmit | repair_input | retry_later_or_split | supply_missing_scope_or_split | retry_once_then_escalate | blocked_needs_adjudication"
        },
        "policy_version": {
          "type": "string"
        },
        "receipt": {
          "type": "object",
          "description": "Execution receipt: receipt_id (unique per execution), input_sha256 (SHA-256 of the exact UTF-8 input), context_sha256, request_fingerprint (identifies an equivalent request; NOT an approval token), prompt_sha256 and versions, actual provider/model, completion state, elapsed time, scope reviewed/missing, deferred checks and the audit write outcome."
        },
        "model_opinion": {
          "type": "object",
          "description": "The model reviewer's own unmodified verdict/score; may differ from decision."
        },
        "score": {
          "type": "number",
          "description": "Blended 0-100 quality telemetry (gates fused with the model score). Not a probability of correctness and not the decision."
        },
        "confidence": {
          "type": "number",
          "description": "Legacy alias of score / 100. NOT a calibrated probability or accuracy."
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
        },
        "expected_input_sha256": {
          "type": "string",
          "pattern": "^[0-9a-fA-F]{64}$",
          "description": "Optional SHA-256 (hex) of the exact UTF-8 bytes you intend to submit. A mismatch is refused before any review, proving the gate saw the file you meant."
        },
        "previous_receipt_id": {
          "type": "string",
          "description": "Optional receipt_id of the review this submission revises or adjudicates; recorded to link the review history."
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
          "description": "True ONLY when decision is 'approved' or 'approved_with_conditions'. Rejected, incomplete and refused requests are all false."
        },
        "decision": {
          "type": "string",
          "enum": [
            "approved",
            "approved_with_conditions",
            "rejected",
            "incomplete",
            "refused_input"
          ],
          "description": "The one final gate decision (see decision_reasons, policy_version)."
        },
        "decision_reasons": {
          "type": "array",
          "items": {
            "type": "object"
          },
          "description": "Every rule that fired; `decisive` marks the ones that set the decision."
        },
        "failure_class": {
          "type": [
            "string",
            "null"
          ],
          "description": "input_error | transient_unavailable | incomplete_review | malformed_review | content_defect | deterministic_veto, or null when approved."
        },
        "next_action": {
          "type": "string",
          "description": "none | address_conditions | fix_and_resubmit | repair_input | retry_later_or_split | supply_missing_scope_or_split | retry_once_then_escalate | blocked_needs_adjudication"
        },
        "policy_version": {
          "type": "string"
        },
        "receipt": {
          "type": "object",
          "description": "Execution receipt: receipt_id (unique per execution), input_sha256 (SHA-256 of the exact UTF-8 input), context_sha256, request_fingerprint (identifies an equivalent request; NOT an approval token), prompt_sha256 and versions, actual provider/model, completion state, elapsed time, scope reviewed/missing, deferred checks and the audit write outcome."
        },
        "model_opinion": {
          "type": "object",
          "description": "The model reviewer's own unmodified verdict/score; may differ from decision."
        },
        "score": {
          "type": "number",
          "description": "Blended 0-100 quality telemetry (gates fused with the model score). Not a probability of correctness and not the decision."
        },
        "confidence": {
          "type": "number",
          "description": "Legacy alias of score / 100. NOT a calibrated probability or accuracy."
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
    "name": "What runs on every review",
    "description": "Each deterministic check, what it vetoes, the model review stage, and the checks not run on shared infrastructure.",
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
  "verificate://gates": "# What runs on every Verificate review\n\nDeterministic checks run first. A veto check fails the submission outright: the model review\nthat follows cannot override it. The model review is the second stage, and its high or critical\nsecurity and API-reality findings block too. Every result carries a receipt (input, context and\nprompt hashes, prompt and policy versions, model, completion state) so a verdict can be traced.\n\n## Deterministic veto checks (same input, same result)\n\n| Check | Watches for |\n|---|---|\n| code_reality_gate | Placeholders presented as done: TODO/FIXME bodies, NotImplemented, mocks and stubs, hollow functions, sleep-instead-of-work. Python by AST, other languages by a language-agnostic scanner. |\n| reward-gaming checks (in code_reality_gate) | Tests that cannot fail (`assert True`), returned data that flags itself as a mock, code that detects it is under test. |\n| api_reality (in code_reality_gate) | Python standard-library calls that do not exist (`os.read_text`, removed APIs). |\n| secret_logging | A secret value (password, API key, access token, access code, private key, Authorization header, connection string) passed to a log or console sink, in any mainstream language (CWE-532). Presence checks, lengths and fingerprints are allowed. |\n| integrity_monitor | Deceptive or manipulative claims in comments, docstrings and prose (\"guaranteed to work, no need to test\"). |\n| completion_claim | A report that claims work is done or passing with no evidence in the text (report-type submissions). |\n\n## Recorded signals (not vetoes)\n\n| Check | Watches for |\n|---|---|\n| gaming_prevention | Score-gaming and suspicious-perfection patterns. |\n| bypass_detector | Resubmitting unchanged content, template abuse, fabricated evidence. |\n\n## Model review\n\nA Claude Haiku 5.5 review scores the submission against an ISO/IEC 25010 and ISO/IEC 5055 rubric.\nIt verifies third-party API calls and reports findings as `severity|layer|detail`. A high or critical\nfinding in the security (L2) or API-reality (L0) layer blocks the merge. If the review cannot cover\nthe stated scope it says so (`review_complete: false`), and the verdict is incomplete, never approved.\n\n## Not run on shared infrastructure\n\nChecks that would execute or compile submitted code, or need external linters or live services, are\nnot run on the hosted gate: anti_simplification, completion_detector, bullshit_detector, static_analysis,\nreality_validation. Each response lists them under `gates_deferred`.\n",
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
            "Validation gates for AI coding. Call validate_ai_output on substantive changes before presenting them as complete; a REJECTED verdict means fix the findings and re-validate. Without VERIFICATE_TOKEN, calls use the free tier (100 validations, no signup); a token from https://verificate.ai/auth/signup gives your own quota.",
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
