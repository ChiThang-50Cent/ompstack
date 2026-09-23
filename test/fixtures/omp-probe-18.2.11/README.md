# OMP 18.2.11 compatibility probe

Raw event logs captured on 2026-09-23 with `scripts/probe/omp-probe.ts` against the installed
`omp/18.2.11` binary. The logs have `systemPrompt` fields, MCP tool names and home paths removed.

| Probe | File | Observed |
|---|---|---|
| A. Goal interception | `A-B-goal-block-resume.jsonl` | `tool_call` receives `toolName=goal`, `input={op:"complete"}`. Returning `{block,reason}` leaves the goal `active`. No `complete` `goal_updated` is emitted. Goal continuation then re-prompts the model. `/goal complete` is not a user subcommand; users can only `drop`. |
| A. Print mode | `A-goal-print-mode.jsonl` | `-p "/goal …"` does not enter goal mode. Goal mode is interactive-only by default (`goal.continuationModes=["interactive"]`). |
| B. Goal hydration | `A-B-goal-block-resume.jsonl` | Goal state is persisted on the branch as `mode_change` entries (`mode: "goal" \| "goal_paused"`, `data.goal`). On `--continue`, `session_start` sees those entries and `goal_updated` fires with `status: "paused"`. `Goal.id` is stable across updates and resume. |
| C. Isolation | `C-*.jsonl` | With `task.isolation.enabled=false`, the model-facing schema omits `isolated`. A hook-injected `isolated:true` is **silently ignored**: the child runs in the main tree and the call does not fail. With isolation enabled, the child runs isolated and the merge applies its patch. |
| D. Child identity | `E-async-batch.jsonl` | Child sessions run in the same process and re-run parent-loaded extension hooks. `session_init` (fields: `task`, `agent`, `tools`, `readOnly`, `spawns`, `outputSchema`, `outputSchemaMode`) exists at child `session_start`, before its first tool call. Children with `tools: read` still get `write` (the xd:// device host) and MCP tools as active tools. A `write` to a workspace file from a `readOnly` child does not create the file. |
| D. Write scope | `D-write-scope-bash-child.jsonl` | A child with `tools: read, bash` still sees `write`, but OMP rejects a workspace path ("This `write` tool is limited to the xd:// device transport…") and no file is created. OMP enforces the frontmatter tool list; pstack needs no direct-mutator block. |
| E. Task results | `E-*.jsonl` | Async spawns: `tool_result.details` = `{results: [], progress: [...], async: {state:"running", jobId}}`; no structured output reaches `tool_result`. Blocking spawns: `details.results[].structuredOutput = {source, mode, status, data, error}`. Strict + invalid output → `status:"invalid"`, `exitCode:1`. `api.events` exposes `task:subagent:lifecycle` payloads `{id, agent, parentToolCallId, status, sessionFile, index}` (undocumented). |
| F. Settings | all | `ExtensionContext` keys: `cwd, hasUI, mode, model, models, modelRegistry, sessionManager, memory, getAsyncJobSnapshot, getContextUsage, getSystemPrompt, invokeTool, isIdle, isProjectTrusted, …`. `ExtensionAPI` has no settings reader. |

`before_subagent_spawn.patterns` holds expanded concrete models, e.g. `["anthropic/claude-opus-5-5"]`, and `spawnKey` is the child id.

Not probed: plan-mode × isolation. The documented behavior is that plan mode removes `isolated` from the task schema.
