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
