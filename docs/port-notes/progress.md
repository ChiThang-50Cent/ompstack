# ompstack remediation progress

Commit SHAs are not recorded here; find a task's commit with `git log --grep='^Task: T0.1$' --format=%h`.

### T0.1 Pin upstream sources {#t01}
- Status: done
- Files: `scripts/fetch-upstream.sh`, `.gitignore`, `docs/port-notes/progress.md`
- Proof:
  - `sh scripts/fetch-upstream.sh` (first run) → `pinned …/.upstream/cursor-plugins at 12d587d`, `pinned …/.upstream/oh-my-pi at 62bc57b`
  - `sh scripts/fetch-upstream.sh` (second run) → same two lines, exit 0
  - `npm run check` → `# pass 42`, `# fail 0`, `Router corpus passed: 33/33 cases.`, `Asset validation passed (7 agents, 16 playbooks, 12 operators, 23 principles, 33 eval cases).`
- Sources read: none
- Decisions: none
- Deviations from spec: none
- Open questions: none

### T0.2 Host OMP resolver {#t02}
- Status: done
- Files: `scripts/lib/resolve-omp.sh`, `test/resolve-omp.test.mjs`
- Proof:
  - `npm run check` → `ok … resolve_omp skips node_modules/.bin and returns the host omp`, `ok … resolve_omp honors PSTACK_OMP_BIN`, `# pass 44`, `# fail 0`
- Sources read: none
- Decisions: none
- Deviations from spec: none
- Open questions: none

### T0.3 Mock LLM {#t03}
- Status: done
- Files: `test/host/mock-llm.mjs`
- Proof:
  - `node --check test/host/mock-llm.mjs` → exit 0
  - `npm run check` → `# pass 44`, `# fail 0`
- Sources read: `.upstream/oh-my-pi/packages/coding-agent/src/tools/yield.ts` (`buildYieldParameters`: `{ type?, data, error? }`) for the `yield` step sugar
- Decisions: none
- Deviations from spec: none
- Open questions: none

### T0.4 Runner and `test:host` {#t04}
- Status: done
- Files: `test/host/run.mjs`, `test/host/README.md`, `scripts/host-smoke.sh`, `test/host/scenarios/status-auto.json`, `package.json` (`test:host`), `docs/development.md` (§ Host scenarios)
- Proof:
  - `npm run test:host` (inside npm, where `node_modules/.bin` precedes PATH) → `Host OMP: /home/claude/.npm-global/bin/omp (omp/18.3.0)`, `status-auto PASS`
  - `npm run check` → `# pass 44`, `# fail 0`
- Runner guarantees reviewed in the diff: per-scenario temp root (`home/`, `PI_CODING_AGENT_DIR`, fresh git `ws/`, mock log, free port, `NO_PROXY`); `runs[]` share one workspace; `setup` whitelist = `plugin-link`; a run that times out or exits non-zero fails the scenario; rule-scoped assertions fail when the rule never ran; `known-failing.json` → XFAIL/XPASS; exit 1 on FAIL or XPASS.
- Sources read: `.upstream/oh-my-pi/docs/environment-variables.md` (`PI_CODING_AGENT_DIR`)
- Decisions: none
- Deviations from spec: none
- Open questions: none

### T0.5 Baseline scenarios {#t05}
- Status: done
- Files: `test/host/scenarios/*.json` (11), `test/host/known-failing.json` (`async-pending`, `gate-off-mode`), `test/host/live-smoke/verify-with-omp.json`
- Proof (`npm run test:host`, OMP 18.3.0, exit 0):

  | Scenario | Result |
  |---|---|
  | async-pending | XFAIL — `AGENT_PENDING` after `wait`; actor `scout1` not `completed` in state.json (BUG-7) |
  | capture-child-tools | PASS |
  | child-scout-spawn | PASS |
  | child-xd-guard | PASS |
  | gate-blocks-auto | PASS |
  | gate-blocks-strict | PASS |
  | gate-off-mode | XFAIL — `all gates passed`, `gate_closed` present (BUG-1) |
  | policy-off | PASS |
  | status-auto | PASS |
  | verifier-pass | PASS |
  | verifier-stale | PASS |

  - `npm run check` → `# pass 44`, `# fail 0`
- Sources read: `.upstream/oh-my-pi/docs/tools/task.md:29-44` (batch shape), `.upstream/oh-my-pi/docs/task-agent-discovery.md` (plugin agents require an installed/linked plugin; confirmed on host: with `-e` only, `Unknown agent "pstack-scout"`)
- Decisions: child-agent scenarios use `setup: ["plugin-link"]` with `loadExtension: false`
- Deviations from spec: none
- Open questions: none

### T0.6 Host compatibility matrix {#t06}
- Status: done
- Files: `scripts/host-matrix.sh`, `package.json` (`test:host:matrix`), `docs/development.md`
- Proof (`npm run test:host:matrix`, exit 0): both `omp/18.2.11` and `omp/18.3.0` → 9 PASS, 2 XFAIL (`async-pending`, `gate-off-mode`), identical to T0.5.
  - `npm run check` → `# pass 44`, `# fail 0`
- Environment note: each installed OMP version occupies ~1.3 GB under `.upstream/omp-<v>/`; the pinned oh-my-pi clone ~0.8 GB.
- Sources read: none
- Decisions: none
- Deviations from spec: none
- Open questions: none

### T0.7 Child-tool capture document {#t07}
- Status: done
- Files: `test/host/capture-report.mjs`, `docs/port-notes/child-tool-capture.md`, `test/host/run.mjs` (fix, see deviations)
- Proof:
  - `PSTACK_HOST_KEEP=1 PSTACK_OMP_BIN=.upstream/omp-<v>/node_modules/.bin/omp npm run test:host -- test/host/scenarios/capture-child-tools.json` → `capture-child-tools PASS` for 18.2.11 and 18.3.0; tables in the capture doc were generated from both kept directories.
  - `npm run check` → `# pass 44`, `# fail 0`; `npm run test:host` and `npm run test:host:matrix` → 9 PASS + 2 XFAIL per version, exit 0.
- Sources read: none beyond the capture logs
- Decisions: D-CHILD and D-EXPOSE confirmed by the capture (no difference from the spec's expected table)
- Deviations from spec: `test/host/run.mjs` now resolves a relative `--omp`/`PSTACK_OMP_BIN` against the invoking directory (runs use the scenario workspace as cwd, so a relative path crashed the runner) and turns spawn errors into scenario failures instead of an unhandled exception. Found while generating the 18.2.11 capture; included here because the capture could not be produced without it.
- Open questions: none
