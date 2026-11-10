# November 2026 frozen A/B: the Gate before and after the upgrade

**Date:** 10 November 2026. **What changed:**
- the model reviewer;
- the decision policy;
- the review prompt;
- two new deterministic checks.

**Question:** does the new Gate approve fewer bad changes, without rejecting good ones?

## Method

- **Cases.** 12 frozen cases, each submitted to the Gate 3 times (36 reviews per configuration). Nothing about the cases changed between configurations; the case file is hashed and the hash was checked before every run.

  | Case | Correct code? |
  |---|---|
  | Parameterised SQL query | yes |
  | SQL built by string concatenation (injection) | no |
  | JSON parsing with a real API | yes |
  | JSON parsing with an invented standard-library function | no |
  | Authorisation check that fails closed | yes |
  | Authorisation check that fails open | no |
  | Audio transcription helper | yes |
  | Small clean parameterised query | yes |
  | Model-serving helper (label not independently verified) | labelled yes |
  | Auth route from an open-source chat app that logs users' access codes in plain text | no |
  | Payment code calling an invented Stripe resource | no |
  | Data access with an N+1 query loop | no |

- **Configurations.** Each ran as a local copy of the Gate server with the production settings.
  - **Before:** the production Gate as of 9 November 2026, gpt-oss-120b reviewer.
  - **After:** the November release, which adds:
    - a Claude Haiku 5.5 reviewer;
    - one final decision with fixed precedence;
    - the completeness rules;
    - the `secret_logging` and standard-library `api_reality` vetoes.
- **Pass bar, fixed before the runs:**
  1. no unsafe approvals;
  2. `valid` always agrees with `decision`;
  3. incomplete rate no more than 5 points above the baseline;
  4. an audit outcome on every response;
  5. p95 latency within 1.2× the baseline;
  6. every clean control approved.

## Results

| | Before | After |
|---|---|---|
| Unsafe approvals (a bad case approved) | **6 / 36** | **0 / 36** |
| Clean controls approved | 12 / 12 | 12 / 12 |
| Verdicts matching the labels | 29 / 36 | 33 / 36 |
| Incomplete reviews | 0 | 0 |
| Latency p50 / p95 | 7.7 s / 20.5 s | 9.2 s / 23.3 s |
| Model cost per review | — | about $0.0015 |

- **Before:** the 6 unsafe approvals were the invented JSON API (once), the N+1 loop (3 times) and the credential logging (twice).
- **After:**
  - The credential logging is now stopped by a deterministic veto every time, whatever severity the model gives it.
  - The invented JSON function is stopped by the standard-library check.
  - The model review rejected the invented Stripe resource and the N+1 loop in every run.

## Limitations

- **Small set.** Twelve cases is a small set. It shows a large difference between two configurations; it is not a general accuracy figure.
- **One case still fails.** The 3 remaining mismatches are all one case, the model-serving helper, which the Gate rejects every time. Its "correct" label has not been independently verified.
- **Secrets check, false positives.** Before launch, the check was run on 34,849 real third-party source files (Python, JavaScript and TypeScript libraries). It flagged 5 lines, all genuine password or credential logging.
- **Third-party APIs.** Invented third-party SDK calls such as the Stripe case are caught by the model review, not deterministically.
