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
