# Benchmark Evidence

This document records benchmark reruns that exercise the current plugin. It is evidence for the named task and environment, not a general performance claim or a treatment-versus-control score.

## Record format

Each record must name:

- the immutable task identifier and expected behavior;
- the exact OMP plugin selection, model, and candidate source boundary;
- baseline behavior before the candidate patch;
- evaluator compatibility adaptations and their write boundary;
- candidate result, elapsed times, and artifact paths;
- limitations that prevent broader claims.

A valid rerun proves that the baseline fails only on the intended fail-to-pass surface and that the candidate reruns the same oracle. An unavailable or incompatible evaluator is a verification gap, not a candidate failure.

## `psf__requests-2931` — non-ASCII bytes request body

**Recorded:** 2026-09-08

**Verdict:** `VERIFIED`

### Scope

Requests on Python 3 raised `UnicodeDecodeError` when preparing a request whose body was non-ASCII UTF-8 `bytes`. The body must remain bytes. This record evaluates one fresh SWE-bench candidate; it does not compare Ompstack against a bare arm.

### Candidate execution

A fresh candidate was copied from `swebench/sweb.eval.x86_64.psf_1776_requests-2931:latest`. The task session ran:

```text
omp -p --no-rules \
  --plugin-dir /home/vmn/code/ompstack \
  --skills ompstack \
  --model gemini-3.8-flash --thinking low --no-session
```

After evaluator cleanup, the retained candidate product patch changes `requests/models.py`:

```diff
if isinstance(data, (str, bytes)):
-    return to_native_string(data)
+    return data
```

It also decoded byte query parameters at the `PreparedRequest.prepare_url` boundary. That preserves the existing `params=b'...'` URL behavior while avoiding an ASCII decode for request bodies.

### Oracle method

The official task evaluator restores `test_requests.py`, applies the task's hidden test patch, installs the candidate, and executes `pytest -rA test_requests.py` in the task image.

The historical Requests suite uses pytest's removed string form of `pytest.raises`. The current image uses pytest 7, so the evaluator mounts a read-only compatibility `conftest.py` that implements only that removed call form. It does not modify the candidate or the protected task test. The driver also installs `pytest-httpbin` so the suite's local HTTP fixture can start.

The adaptation was validated before candidate execution:

| Run | Result | Interpretation |
| --- | --- | --- |
| Fresh baseline | `166 passed, 1 failed, 1 xfailed` | The only failure was `TestRequests.test_binary_put`, with the expected `UnicodeDecodeError`. |
| Ompstack candidate | `167 passed, 0 failed, 1 xfailed` | The hidden binary-body regression passed; no pass-to-pass test regressed. |

`TestRequests.test_response_iter_lines_reentrant` is the unchanged expected failure (`xfail`) in both runs. It is not a task failure.

### Timing

| Phase | Elapsed |
| --- | ---: |
| Baseline oracle | 29.46 s |
| OMP task session | 206.73 s |
| Candidate oracle | 28.91 s |
| End-to-end, including baseline | about 4 min 25 s |

### Evidence retention

The tested image, command shape, baseline/candidate outcomes, and timings above are the retained evidence record. Raw candidate workspaces, package caches, evaluator output, and compatibility files were transient artifacts and were intentionally removed during repository cleanup.

The agent also added a local regression test during the task session. The benchmark evaluator restores its protected test file after execution, so that test is not part of the retained candidate patch.

### Limits

- This is one benchmark task, one model, and one same-host convenience oracle.
- The compatibility shim establishes that this task suite can execute under the current image; it is not part of Requests or Ompstack production code.
- This record does not establish aggregate benchmark quality or a causal Ompstack-versus-bare result. Use the paired-evaluation procedure in `skills/ompstack/playbooks/eval.md` for policy comparison.

## `ompstack-native-todo-policy` — paired behavior evaluation

**Recorded:** 2026-09-08  
**Verdict:** `PROMOTED`

### Scope

This record evaluates the native Todo policy against a bare OMP arm. It is a four-case behavioral calibration, not an aggregate model-quality claim.

### Method

Both arms used `google-antigravity/gemini-3.8-flash`, `--thinking low`, `--no-session`, `--no-rules`, `--no-extensions`, `--tools read,todo`, the same repository revision, and source writes disabled. The treatment used:

```text
--skills ompstack --plugin-dir /home/vmn/code/ompstack
```

The bare arm used:

```text
--no-skills
```

All eight task runs exited zero. The treatment transcript successfully read `skill://ompstack`; the bare arm did not load that skill. A separate Gemini Flash 3.8 low judge received anonymized Arm A/B transcripts and scored only the specified behavioral rubric.

### Cases and result

| Case | Required behavior | Blinded result |
| --- | --- | --- |
| Read-only cache explanation | Select no progress tracking; do not call Todo. | A |
| Schema → CLI → documentation feature | `todo.view` before full-list `todo.init`; leave unperformed work incomplete. | A |
| Independent API and documentation lanes | Preserve shared fan-in and name the proof surface. | A |
| Missing Doctor credential | Block the exact prerequisite; report `BLOCKED`, not product `FAIL`. | A |

Arm A was the Ompstack treatment. The blinded judge awarded A `4/4`, B `0/4`, and preferred A. It cited direct bare-arm initialization without `todo.view`, unnecessary Todo for the read-only case, premature completion, and invalid extra transitions.

### Limits

- Four synthetic coordination cases validate the policy edges; they do not measure production task throughput or wall-time impact.
- Todo state was intentionally memory-only because every run used `--no-session`.
- Raw anonymized transcripts were transient `/tmp` files and were removed after judging; the commands, model configuration, rubric, and scored result above are retained.

## `ompstack-task-hub-fanin-policy` — paired behavior evaluation

**Recorded:** 2026-09-08  
**Verdict:** `PROMOTED`

### Scope

This record evaluates the Task/Hub fan-in policy against a bare OMP arm. It calibrates coordination decisions from supplied lane states; it does not claim to measure worker throughput or full multi-process lifecycle behavior.

### Method

Both arms used `google-antigravity/gemini-3.8-flash`, `--thinking low`, `--no-session`, `--no-rules`, `--no-extensions`, `--tools read,hub`, and the same repository revision. Source writes were disabled. The treatment used `--skills ompstack --plugin-dir /home/vmn/code/ompstack`; the bare arm used `--no-skills`.

All six task runs exited zero. The treatment read `skill://ompstack`; the bare arm did not load the skill. A separate Gemini Flash 3.8 low judge received compacted anonymized A/B transcripts containing tool calls and complete final answers.

### Cases and result

| Case | Required behavior | Blinded result |
| --- | --- | --- |
| One claimed result; one lane still running | Prohibit synthesis/gate; await and inspect every required lane. | A |
| Claimed success plus aborted lane | Keep fan-in unresolved; inspect output/history and repair, replace, or block. | A |
| One-line local correction | Select no progress tracking and no Task/Hub ceremony. | A |

Arm A was the Ompstack treatment. The blinded judge awarded A `3/3`, B `0/3`, and preferred A. It cited the treatment's queue selection, explicit partial-fan-in hold, artifact/history inspection, and no-ceremony narrow route. The bare arm made an unnecessary `hub jobs` lookup after supplied job completion and lacked the same acceptance boundary.

### Limits

- The lane states were supplied by the prompt; no worker was actually spawned in these three cases.
- The evaluator cannot control model sampling seeds.
- Raw and compacted anonymized `/tmp` transcripts were transient and removed after judging. The commands, settings, rubric, and result above are retained.

## `ompstack-proof-surface-selection-policy` — paired behavior evaluation

**Recorded:** 2026-09-08  
**Verdict:** `CALIBRATED` — not a production or aggregate-quality benchmark.

### Scope

This record calibrates verification-driver selection against a bare OMP arm. It evaluates proposed proof surfaces, not execution of a browser, CLI, debugger, LSP server, or service runtime.

### Method

Both arms used `google-antigravity/gemini-3.8-flash`, `--thinking low`, `--no-session`, `--no-rules`, `--no-extensions`, `--tools read`, and the same repository revision. Source writes were disabled. The treatment used `--skills ompstack --plugin-dir /home/vmn/code/ompstack`; the bare arm used `--no-skills`.

All ten task runs exited zero. In every treatment transcript, the responder read `skill://ompstack` and `skill://ompstack/playbooks/verification.md`; the bare web, CLI, runtime, and refactor arms did not resolve an Ompstack skill. A separate Gemini Flash 3.8 low judge received anonymized A/B compactions containing the full final answer and tool names.

### Cases and result

| Case | Required behavior | Blinded result |
| --- | --- | --- |
| Web checkout workflow | Browser through Eval, OMP-owned tab, observed state and screenshot; no unauthorized relay. | A |
| JSON CLI export | Actual CLI invocation, exit status, terminal output, and promised effect. | A |
| Session-state race | DAP state/stack/scope observation that establishes runtime mechanism. | A |
| Exported-symbol rename | LSP migration paired with an existing behavior pin or consumer drive. | A |
| Billing API with `verify-service` | Existing capability Doctor/Drive and consumer side-effect evidence. | A |

Arm A was the Ompstack treatment. The blinded judge awarded A `5/5`, B `0/5`, and preferred A. It cited the treatment's Eval-owned browser path, actual CLI drive, DAP mechanism evidence, LSP-plus-behavior boundary, and full existing verification-capability lifecycle. It cited bare-arm external browser automation, a throwaway concurrency runner, LSP-only typecheck, and response-only API proof as failures of the stated proof boundary.

### Limits

- Five synthetic selection cases test policy adherence, not successful product changes or runtime availability.
- The evaluator cannot control model sampling seeds.
- Raw and compacted anonymized `/tmp` transcripts were transient and are removed after this record. The commands, settings, rubric, and result above are retained.

## `sympy__sympy-12489` — fresh paired task calibration

**Recorded:** 2026-09-08  
**Verdict:** `MIXED`

### Scope

This record measures one fresh SWE-bench task replay after the proof-surface policy change. It compares initial-agent behavior only; no repair attempt ran. It is task-level calibration, not proof that the policy matrix improves web, CLI, service, debugger, or LSP execution.

### Method

A clean candidate was extracted from `swebench/sweb.eval.x86_64.sympy_1776_sympy-12489:latest`; both arms began with the same `sympy/combinatorics/permutations.py` digest. The fresh baseline oracle failed its one required hidden-test drive before either agent ran.

Both agents received the same task prompt and used `google-antigravity/gemini-3.8-flash`, `--thinking low`, `--max-time 15m`, `--mode json`, `--auto-approve`, `--no-rules`, and `--no-extensions`. The bare arm used `--no-skills`; the treatment used `--skills ompstack --plugin-dir /home/vmn/code/ompstack`. The treatment transcript read `skill://ompstack`; the bare transcript did not. The oracle used the task image, reset `sympy/combinatorics/tests/test_permutations.py`, applied the hidden patch, and executed the named test file. The contract declared `convenience` trust and required one test.

### Result

| Arm | Agent outcome | First oracle outcome | Contract result |
| --- | --- | --- | --- |
| Bare | Hit its 15-minute deadline after a partial source edit. | `failed: 1` | `NOT_VERIFIED`, integrity valid |
| Ompstack | Returned after 336.34 s with a source fix and a test-file edit. | `failed: 0` | `INCONCLUSIVE`: the protected test file had changed |
| Ompstack normalized source | The oracle had restored the protected test file while preserving the source patch. | `failed: 0` | `VERIFIED`, integrity valid |

The source patch produced by the treatment passes the hidden oracle after the oracle-normalized protected path. The initial treatment candidate nevertheless violated the contract by editing a protected file, so this is not an unqualified policy promotion. The bare arm failed the oracle; the treatment source succeeded but needs a scope rule that honors protected evaluation paths.

### Limits

- One task, one sample per arm, and uncontrolled sampling cannot establish a causal improvement.
- The task exercises Python-library bug fixing, not the new real proof-surface categories.
- The oracle is a local convenience contract, not an isolated or CI-attested executor.
- Temporary candidates, transcripts, and oracle evidence were removed after the record at the user's request.

## `ompstack-opt-in-capabilities-policy` — paired behavior evaluation

**Recorded:** 2026-09-08  
**Verdict:** `CALIBRATED` — not a production or aggregate-quality benchmark.

### Scope

This record calibrates policy boundaries for Prewalk, Advisor, persisted-session handoff, export, and Memory against a bare OMP arm. It evaluates proposed session-capability choices, not execution of a model handoff, advisor, persisted session, export, or memory backend.

### Method

Both arms used `google-antigravity/gemini-3.8-flash`, `--thinking low`, `--no-session`, `--no-rules`, `--no-extensions`, `--tools read`, and the same repository revision. Source writes were disabled. The treatment used `--skills ompstack --plugin-dir /home/vmn/code/ompstack`; the bare arm used `--no-skills`.

All eight task runs exited zero. Every treatment transcript read `skill://ompstack`; the bare memory arm read its native `rule://memory` guidance but no Ompstack skill. A separate Gemini Flash 3.8 low judge received anonymized A/B compactions containing the complete final answer, tool names, and read paths.

### Cases and result

| Case | Required behavior | Blinded result |
| --- | --- | --- |
| Operator-armed Prewalk | Preserve its setting, name Todo/edit handoff mechanics, and keep the route independent of Prewalk/Todo. | A |
| Operator-enabled Advisor | Inspection-only concern coverage; no watchdog/config/write grant; reviewer/verifier remain proof. | A |
| Explicit persisted-session handoff | Native artifacts and URI evidence first; compact handoff/export only under the stated authorization boundary. | A |
| Conflicting `memory://` lesson | Cite it as heuristic context, revalidate current repository and user instruction, no automatic capture/update. | A |

Arm A was the Ompstack treatment. The blinded judge awarded A `4/4`, B `0/4`, and preferred A. It cited the treatment's exact Prewalk gate and handoff mechanics, Advisor tool and completion boundary, native session URI-first handoff, and memory citation/revalidation rule. It cited bare-arm omissions of the Prewalk gate, watchdog limits, native handoff URIs, and `memory://` revalidation.

### Limits

- Four synthetic selection cases test policy adherence, not an actual model handoff, advisor run, persisted session, export, or memory backend.
- The evaluator cannot control model sampling seeds.
- Raw and compacted anonymized `/tmp` transcripts were transient and are removed after this record. The commands, settings, rubric, and result above are retained.

