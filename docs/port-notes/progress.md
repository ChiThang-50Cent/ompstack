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
- Re-verified on `/home/vmn` with Node/npm and OMP 18.3.0: both fetch runs pinned `cursor-plugins` at `12d587d` and `oh-my-pi` at `62bc57b`; `npm run check` passed (44 tests, 33/33 router, asset validation).

### T0.2 Host OMP resolver {#t02}
- Status: done
- Files: `scripts/lib/resolve-omp.sh`, `test/resolve-omp.test.mjs`
- Proof:
  - `npm run check` → `ok … resolve_omp skips node_modules/.bin and returns the host omp`, `ok … resolve_omp honors PSTACK_OMP_BIN`, `# pass 44`, `# fail 0`
- Sources read: none
- Decisions: none
- Deviations from spec: none
- Open questions: none
- Re-verified on `/home/vmn` with Node/npm: `npm run check` passed (both resolver tests, 44 tests).

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
- Re-verified on `/home/vmn` with Node/npm: `node --check test/host/mock-llm.mjs` passed and `npm run check` passed (44 tests).

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
- Re-verified on `/home/vmn` with host OMP `/home/vmn/.bun/bin/omp` (`omp/18.3.0`): the status scenario passed.

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
- Re-verified on `/home/vmn` with host OMP 18.3.0: `npm run test:host` passed with 9 PASS and 2 XFAIL (`async-pending`, `gate-off-mode`), exit 0.

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
- Re-verified on `/home/vmn`: `npm run test:host:matrix` passed for OMP 18.2.11 and 18.3.0 with 9 PASS and 2 XFAIL per version, exit 0.

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
- Re-verified on `/home/vmn`: `capture-child-tools` passed on OMP 18.2.11 and 18.3.0; `capture-report.mjs` reproduced both tables from kept directories.

### T1.1 Truthful gates in `off` mode {#t11}
- Status: done
- Files: `src/gate-control.ts`, `src/gates.ts`, `test/gate-off-mode.test.mjs`, `test/host/scenarios/gate-off-mode.json`, `test/host/known-failing.json`, `README.md`, `docs/architecture.md`, `docs/configuration.md`, `src/commands.ts`, `src/policy.ts`, `src/status.ts`, `src/domain.ts`, `src/index.ts`
- Proof:
  - `npm run check` → 46 tests passed, router 33/33, asset validation passed.
  - `npm run test:host -- test/host/scenarios/gate-off-mode.json` → PASS on host OMP 18.3.0.
  - `npm run test:host:matrix` → `gate-off-mode PASS` on OMP 18.2.11 and 18.3.0; all other baseline scenarios unchanged.
- Sources read: `src/gates.ts`, `src/gate-control.ts`, `src/commands.ts`, `docs/architecture.md`, `docs/configuration.md`
- Decisions: `pstack_gate init` and `/pstack init` refuse in `off` without mutating state; active runs remain evaluable after the mode changes to `off`.
- Deviations from spec: none
- Open questions: none

### T1.2 Host resolver and `verify-with-omp` smoke {#t12}
- Status: done
- Files: `scripts/verify-with-omp.sh`, `docs/installation.md`, `docs/development.md`
- Proof:
  - `npm run verify:omp` → host OMP `/home/vmn/.bun/bin/omp` (`omp/18.3.0`), devDependency OMP `18.2.11 (not used)`, smoke skipped by default.
  - `PSTACK_LIVE_SMOKE=1 npm run verify:omp` → `verify-with-omp PASS` on host OMP 18.3.0 using the offline mock provider.
  - `PSTACK_OMP_BIN=.upstream/omp-18.2.11/node_modules/.bin/omp PSTACK_LIVE_SMOKE=1 npm run verify:omp` → `verify-with-omp PASS`.
  - `npm run check` → 46 tests passed, router 33/33, asset validation passed.
- Sources read: `scripts/lib/resolve-omp.sh`, `test/host/run.mjs`, `test/host/live-smoke/verify-with-omp.json`
- Decisions: `mock` is the default opt-in smoke provider; `real` preserves the provider-backed flow and explicitly enables `--pstack-mode auto`.
- Deviations from spec: none
- Open questions: none

### T1.3 Documentation truth pass {#t13}
- Status: done
- Files: `README.md`, `BUILD_REPORT.md`, `CHANGELOG.md`, `docs/architecture.md`, `docs/limitations.md`, `docs/security-model.md`, `docs/development.md`, `docs/model-routing.md`, `docs/verification.md`, `docs/configuration.md`, `skills/pstack/SKILL.md`, `skills/pstack/operators/verification.md`, `skills/pstack/playbooks/security.md`, `agents/pstack-reviewer.md`, `agents/pstack-verifier.md`
- Proof:
  - Reviewed every requested isolation, child-guard, and `read-only` claim with repository grep.
  - `npm run check` → 46 tests passed, router 33/33, asset validation passed.
  - `npm run test:host:matrix` → 9 PASS and 2 XFAIL per OMP version; no behavior regression.
- Sources read: `src/child-policy.ts`, `src/task/read-only-policy.ts`, `test/host/capture-report.mjs`, `docs/port-notes/child-tool-capture.md`
- Decisions: OMP owns tool admission and task isolation; pstack blocks parent-state `pstack_*`/`hub`, warns on non-isolated writers, and documents reviewer/verifier Bash as shell-capable.
- Deviations from spec: none
- Open questions: none

### T1.4 Async wait/hub reconciliation {#t14}
- Status: done
- Files: `src/task-lifecycle.ts`, `src/index.ts`, `src/tools.ts`, `src/commands.ts`, `test/task-lifecycle.test.mjs`, `test/host/known-failing.json`, `docs/port-notes/progress.md`
- Proof:
  - `npm run check` → 46 tests passed, router 33/33, asset validation passed.
  - `node --test test/task-lifecycle.test.mjs` → both OMP wait/hub fixtures pass; unknown marker IDs are ignored; replay is idempotent.
  - `npm run test:host -- test/host/scenarios/async-pending.json` → PASS on OMP 18.3.0.
  - `PSTACK_OMP_BIN=.upstream/omp-18.2.11/node_modules/.bin/omp npm run test:host -- test/host/scenarios/async-pending.json` → PASS on OMP 18.2.11.
- Sources read: `.upstream/oh-my-pi/packages/coding-agent/src/async/job-control.ts:241-246` (wait includes result text then consumes terminal job results), `.upstream/oh-my-pi/packages/coding-agent/src/async/job-manager.ts:775-790` (consumed-result state), `.upstream/oh-my-pi/packages/coding-agent/src/prompts/tools/task-summary.md:1-23` (marker envelope)
- Decisions: reconcile at pstack status/gate/check command boundaries; reconcile after `wait` and `hub op=wait`; parse the host's `<task-result>` marker as a fallback because wait consumes terminal rows from the async snapshot.
- Deviations from spec: none
- Open questions: none

### T1.5 Agent tool declarations match the host {#t15}
- Status: done
- Files: `agents/pstack-scout.md`, `agents/pstack-architect.md`, `agents/pstack-judge.md`, `agents/pstack-reviewer.md`, `agents/pstack-verifier.md`, `agents/pstack-builder.md`, `agents/pstack-synthesizer.md`, `scripts/omp-tool-names.json`, `scripts/validate-assets.mjs`, `test/host/capture-report.mjs`, `test/host/scenarios/capture-writer-tools.json`, `docs/port-notes/child-tool-capture.md`, `docs/verification.md`, `docs/limitations.md`, `docs/security-model.md`, `README.md`, `docs/port-notes/progress.md`
- Proof:
  - `PSTACK_HOST_KEEP=1 npm run test:host -- test/host/scenarios/capture-child-tools.json` → PASS on OMP 18.3.0; verifier now receives `eval`.
  - `PSTACK_HOST_KEEP=1 PSTACK_OMP_BIN=.upstream/omp-18.2.11/node_modules/.bin/omp npm run test:host -- test/host/scenarios/capture-child-tools.json` → PASS on OMP 18.2.11.
  - `PSTACK_HOST_KEEP=1 npm run test:host -- test/host/scenarios/capture-writer-tools.json` and the 18.2.11 matrix override → PASS; builder/synthesizer offered lists and workspace probes are recorded in the capture document.
  - `npm run check` → 51 tests passed, router 33/33, asset validation passed.
  - `npm run test:host:matrix` → 12 scenarios PASS on both OMP 18.2.11 and 18.3.0; `known-failing.json` is empty.
- Sources read: `.upstream/oh-my-pi/docs/tools/find.md:33`, `lsp.md:47`, `ast-grep.md:35`, `browser.md:16`, `computer.md:22-23`; OMP 18.2.11 `.upstream/omp-18.2.11/node_modules/@oh-my-pi/pi-coding-agent/src/sdk.ts:1984-1997`, `config/settings-schema.ts:4283-4315,4373-4381,4552-4560`, `lsp/tool.ts:195-197`, `task/index.ts:645-660`
- Decisions: remove default-unavailable `find`, `lsp`, and `ast_grep`; replace non-AgentTool `browser`/`computer` declarations with verifier `eval`; keep the optional UI path documented and require `INCONCLUSIVE` when its settings/target are unavailable. The allowlist is pinned to oh-my-pi commit `62bc57b`.
- Deviations from spec: browser/computer headless scenario not added because this CI surface did not establish a real UI target; limitation is documented.
- Open questions: none

### T1.6 Writer model fallback {#t16}
- Status: done
- Files: `agents/pstack-builder.md`, `agents/pstack-synthesizer.md`, `src/commands.ts`, `test/extension.test.mjs`, `test/host/scenarios/builder-noroles.json`, `docs/model-routing.md`, `README.md`, `docs/port-notes/progress.md`
- Red-first proof:
  - `PSTACK_HOST_KEEP=1 npm run test:host -- test/host/scenarios/builder-noroles.json` → `No model selected`, child rule not hit, README not built on OMP 18.3.0.
  - `PSTACK_HOST_KEEP=1 PSTACK_OMP_BIN=.upstream/omp-18.2.11/node_modules/.bin/omp npm run test:host -- test/host/scenarios/builder-noroles.json` → the same `No model selected` failure on OMP 18.2.11.
- Proof after fix:
  - `npm run check` → 52 tests passed, including per-agent doctor coverage; router 33/33 and asset validation passed.
  - `npm run test:host -- test/host/scenarios/builder-noroles.json` → PASS on OMP 18.3.0.
  - `PSTACK_OMP_BIN=.upstream/omp-18.2.11/node_modules/.bin/omp npm run test:host -- test/host/scenarios/builder-noroles.json` → PASS on OMP 18.2.11.
- Sources read: `.upstream/oh-my-pi/docs/models.md:449-465` (role aliases and model priority), `.upstream/oh-my-pi/packages/coding-agent/src/config/model-resolver.ts:1042-1065,1186-1207,1224-1255` (session-inherited `@smol`/`@slow` paths and effective agent patterns)
- Decisions: writer chains end with `@smol` after `@pstack_code, @task`; `/pstack doctor` reports all seven agent chains candidate-by-candidate, including unresolved custom aliases and the resolved fallback.
- Deviations from spec: none
- Open questions: none

### T1.7 Dependency bump and lockfile {#t17}
- Status: done
- Files: `package.json`, `package-lock.json`, `docs/port-notes/progress.md`
- Proof:
  - `npm install` → dependency tree updated to OMP 18.3.0.
  - `npm ls @oh-my-pi/pi-coding-agent` → `@oh-my-pi/pi-coding-agent@18.3.0`.
  - `npm run check` → 52 tests passed, router 33/33, asset validation passed.
  - `npm run test:host` → 13 scenarios PASS on host OMP 18.3.0.
  - `npm run test:host:matrix` → OMP 18.2.11 scenarios PASS; OMP 18.3.0 matrix run completed after the command's backgrounded final leg.
- Sources read: `spec3_1.md:333-339`, `package.json`, `package-lock.json`
- Decisions: devDependency and lockfile use 18.3.0; peer range remains `>=18.2.11` so the compatibility matrix remains required.
- Deviations from spec: none
- Open questions: none

### T2.0 Validator API, upstream map, and fixtures {#t20}
- Status: done
- Files: `scripts/lib/validate.mjs`, `scripts/validate-assets.mjs`, `scripts/build-upstream-map.mjs`, `scripts/upstream-map.json`, `test/assets.test.mjs`, `package.json`, `docs/port-notes/progress.md`
- Proof:
  - `npm run check` → 53 tests passed, router 33/33, asset validation passed.
  - `npm run check:upstream` → upstream map current: 93 entries from pinned commit `12d587d`.
  - `test/assets.test.mjs` → six fixture checks: clean copy, broken `skill://`, Cursor leftovers, model slug, unknown agent tool, and imported fidelity truncation.
- Sources read: `spec3_1.md:355-384`, `.upstream/cursor-plugins` inventory for Appendix A and Phase 2–4 targets
- Decisions: `validate(repoRoot, options)` owns all checks and returns `{ errors, warnings, summary }`; the CLI only renders/exits. `verify-*` links remain project-local external skill references; all repository-owned links are resolved. Map generation preserves imported status/reason while refreshing pinned hashes and word counts.
- Deviations from spec: none
- Open questions: none

### T2.1 Principles corpus {#t21}
- Status: done
- Files: `skills/pstack/principles/*.md` (23), `scripts/upstream-map.json`, `NOTICE.md`, `docs/port-notes/progress.md`
- Proof:
  - `npm run check` → 53 tests passed, router 33/33, asset validation passed with 23 principles.
  - `npm run check:upstream` → map current at pinned Cursor commit `12d587d`; all 23 principle entries are `imported`.
  - `type-system-discipline.md` contains the required illegal-state, branded-primitive, and test headings/bullets.
- Sources read: `.upstream/cursor-plugins/pstack/skills/principle-*/SKILL.md`, `spec3_1.md:386-390`
- Decisions: copied upstream principle bodies, adapted only local relative links and retained the OMP `Application record` section; `guard-the-context-window` keeps the existing local filename `guard-context-window.md`.
- Deviations from spec: none
- Open questions: none

### T2.2 Operator `how` {#t22}
- Status: done
- Files: `skills/pstack/operators/how.md`, `skills/pstack/operators/references/how/{explorer-prompt,explainer-prompt}.md`, `scripts/upstream-map.json`, `NOTICE.md`, `docs/port-notes/progress.md`
- Proof:
  - `npm run validate` → asset validator passed; operator count remains 12.
  - `npm run check:upstream` → map current at pinned Cursor commit `12d587d`; three `how` entries are `imported`.
- Sources read: `.upstream/cursor-plugins/pstack/skills/how/{SKILL.md,references/*}`, `spec3_1.md:392-397`
- Decisions: complex investigations use one OMP `task` batch of `pstack-scout` items and parent-side synthesis; simple investigations stay in the parent. Cursor model/Task/readonly mechanics were replaced with OMP agent/tool vocabulary.
- Deviations from spec: none
- Open questions: none
