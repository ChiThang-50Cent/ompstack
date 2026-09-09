# Evaluation Notes

## Invalid isolated replay: plugin did not load

The SymPy, Flask, Requests, and scikit-learn rollouts recorded before this note are **not valid Ompstack-vs-bare comparisons**.

### Cause

The runner passed `--no-skills` to both arms. In the treatment transcript, the first direct lookup returned:

```text
Unknown skill: ompstack
Available: none
```

`--plugin-dir /opt/ompstack` did not override disabled skill discovery. The treatment therefore received an extra instruction to read Ompstack, incurred a failed tool call, and continued without the Ompstack policy.

### Consequence

The recorded resolutions, failures, and empty patches measure bare behavior versus a prompt/tool-failure variant, not Ompstack behavior. They must not be used to claim that Ompstack helps or harms the model.

### Required rerun command

```text
bare:      --no-rules --no-skills --no-extensions
treatment: --no-rules --no-extensions --skills ompstack --plugin-dir /opt/ompstack
```

Never combine `--no-skills` with a plugin treatment. `--skills ompstack` scopes discovery to the plugin skill.

Before scoring, retain a successful treatment `read skill://ompstack` transcript entry; bare must not resolve that skill. Keep all other task, model, tool, timeout, image, and evaluator inputs identical.
Use an actual agent-session transcript for this gate: `omp read` bypasses `--skills` filtering and is not valid evidence.
The runner saves `skill_preflight.stdout.jsonl` and stops before the task rollout if that read fails.

## Valid single-task rerun

`psf__requests-2931` was rerun after the plugin lifecycle update with `--skills ompstack` and a fresh candidate source. Its baseline and candidate oracle evidence are recorded in `docs/BENCHMARK_EVIDENCE.md`. This is a verified task replay, not a replacement for the paired treatment-versus-control evaluation required above.

## Valid paired policy evaluation

`ompstack-native-todo-policy` is a valid four-case paired evaluation recorded in `docs/BENCHMARK_EVIDENCE.md`. It uses the required bare/treatment split, a successful treatment `read skill://ompstack`, identical Gemini Flash 3.8 low model settings, and a separate blinded judge over anonymized transcripts. Its scope is native Todo policy behavior only; it does not supersede the task-level benchmark records.

## Valid paired Task/Hub evaluation

`ompstack-task-hub-fanin-policy` is a valid three-case paired evaluation recorded in `docs/BENCHMARK_EVIDENCE.md`. It preserves the bare/treatment isolation and Gemini Flash 3.8 low controls, retains treatment skill preflight, and uses a separate blinded judge over complete final answers plus tool calls. It evaluates supplied fan-in states, not a full worker-lifecycle load test.

## Valid paired proof-surface evaluation

`ompstack-proof-surface-selection-policy` is a valid five-case paired evaluation recorded in `docs/BENCHMARK_EVIDENCE.md`. It preserves the same Gemini Flash 3.8 low bare/treatment isolation, confirms treatment reads both the Ompstack skill and its verification playbook, and uses a separate blinded judge over complete final answers and tool names. It calibrates policy choices for web, CLI/TUI, live-state, symbol-refactor, and project-capability service cases; it does not claim that those real surfaces were executed.

## Fresh paired task calibration: protected-path violation

`sympy__sympy-12489` was rerun as a fresh bare/treatment calibration after the proof-surface policy update. The fresh baseline failed. The bare arm timed out and failed the oracle; the Ompstack source patch passed the hidden oracle after normalization, but its initial candidate modified the protected test path and therefore received `INCONCLUSIVE` under the contract. The complete evidence and limits are recorded in `docs/BENCHMARK_EVIDENCE.md`. Do not report this as an unqualified policy gain.

## Valid paired opt-in capabilities evaluation

`ompstack-opt-in-capabilities-policy` is a valid four-case paired evaluation recorded in `docs/BENCHMARK_EVIDENCE.md`. It preserves the Gemini Flash 3.8 low bare/treatment isolation, confirms treatment skill preflight, and uses a separate blinded judge over complete final answers plus tool names and read paths. It calibrates policy boundaries only; it does not assert that Prewalk, Advisor, handoff/export, or Memory was executed.

## Fresh task replay effort

Future fresh task replays default to `--thinking low` unless the user explicitly overrides that setting. Keep thinking level identical across arms; record any exception before comparing time, token use, or outcome.
