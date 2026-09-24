# Host scenarios

Real-OMP tests driven by a scripted mock LLM (`mock-llm.mjs`). Run with `npm run test:host` (host OMP) or `npm run test:host:matrix` (every supported OMP version). Scenarios in `scenarios/` are globbed; fixtures in `live-smoke/` run only when passed explicitly (by `scripts/verify-with-omp.sh`). Names listed in `known-failing.json` are expected failures: they report `XFAIL`; if one passes it reports `XPASS` and fails the run.

## Isolation

Each scenario gets a fresh temp root with its own `home/` (`HOME`), `home/.omp/agent/` (`PI_CODING_AGENT_DIR`, holding `models.yml` for the `mock/mock-1` model and optional `config.yml`), `ws/` (fresh git repo with one empty commit), mock log, and free port. `NO_PROXY=127.0.0.1,localhost` is set. The mock is killed and awaited after each scenario. The temp root is deleted on PASS and kept (path printed) otherwise, or always with `PSTACK_HOST_KEEP=1`.

## Scenario fields

| Field | Type | Meaning |
|---|---|---|
| `name` | string | unique; used for temp dirs, the result table and `known-failing.json` |
| `mode` | `off` \| `auto` \| `strict` | default `--pstack-mode` for every run |
| `prompt` | string | single-run shorthand (ignored when `runs` is present) |
| `runs` | `[{ prompt, mode?, ompArgs? }]` | sequential OMP processes sharing the same home, workspace, mock and log |
| `setup` | string[] | whitelisted host steps before the runs. Only `"plugin-link"` exists: `omp plugin link <repo root>` in the scenario env (required for spawning pstack agents; `-e` does not register `agents/`) |
| `loadExtension` | boolean | default `true` → pass `-e src/index.ts`. Set `false` together with `setup: ["plugin-link"]` so the extension is not loaded twice |
| `files` | `{ path: content }` | written into the workspace after `git init`; default `{ "README.md": "fixture\n" }`. Initial hashes are recorded for `fileUnchanged`/`fileChanged` |
| `commitFiles` | boolean | commit `files` after writing them |
| `pstackConfig` | object | written to `ws/.omp/pstack.json` |
| `ompConfig` | string | YAML written to `<agentDir>/config.yml` |
| `ompArgs` | string[] | extra OMP flags for every run |
| `timeoutSec` | number | per run, default 90. A run that times out **or exits with a code other than `expectExit`** fails the scenario |
| `expectExit` | number | expected OMP exit code, default 0; also settable per entry in `runs` |
| `persistSession` | boolean | default `false` → `--no-session`. `true` → `--session-dir <tmp>/sessions`, shared by every run, so a later run can pass `--continue` in its `ompArgs` |
| `rules` | array | mock rules (below) |
| `assert` | array | assertions (below); evaluated only when setup and all runs succeeded |

## Mock rules

`{ id, matchSystem?, matchUser?, captures?, steps }`. The first rule whose `matchSystem` is a substring of the request's system/developer text and whose `matchUser` is a substring of the concatenated user messages wins. Child agent sessions call the same mock; route them with `matchSystem` set to a line unique to the agent body. The step index is the number of tool results already in the conversation.

Step forms:

| Step | Effect |
|---|---|
| `{ "tool": "<name>", "args": { … } }` | emit that tool call |
| `{ "yield": { … } }` | sugar for `{ "tool": "yield", "args": { "data": { … } } }` (child structured output) |
| `{ "oneOf": [ step, … ] }` | first alternative whose `tool` is offered in this request (e.g. `wait` on 18.3, `hub {op:"wait"}` on 18.2.11) |
| `{ "final": "text" }` | end the turn with text (default after the last step: `MOCK_FINAL` + all tool results) |
| `"mutate": { "path", "write" \| "append" }` (on any step, or an array) | the mock edits the workspace **before** serving that step, once per rule+step |

`captures: [{ name, from: "system" \| "user" \| "result", step?, regex }]` → first capture group becomes `{{name}}`, substituted into every string of the step (e.g. `Target fingerprint: ([0-9a-f]{64})` from the verifier contract).

## Assertions

Any assertion with `rule` is restricted to requests matched by that rule **and fails if the rule was never hit**. `toolsExclude`/`systemLacks` also fail on an empty request set.

| Type | Fields | Passes when |
|---|---|---|
| `ruleHit` | `rule`, `min?` | the rule served ≥ `min` (default 1) requests |
| `toolResultContains` / `toolResultLacks` | `text`, `rule?` | a tool result contains / no tool result contains `text` |
| `toolResultMatches` | `regex`, `rule?` | a tool result matches |
| `systemContains` / `systemLacks` | `text`, `rule?` | system text contains / never contains |
| `userContains` | `text`, `rule?` | user messages contain (e.g. a contract injected into a child task) |
| `toolsInclude` / `toolsExclude` | `tools[]`, `rule?` | some request offered all / no request offered any |
| `toolsExcludeMatching` | `regex`, `rule?` | no offered tool name matches |
| `eventsContain` / `eventsLack` | `event` | pstack audit `events.jsonl` has / lacks the event type |
| `eventWhere` | `event`, `where` | an event of that type matches all `where` dotted-path equalities |
| `jsonlWhere` | `file` (glob, `*` per segment), `where`, `min?` | ≥ `min` rows across matching JSONL files satisfy `where` |
| `jsonWhere` | `file` (glob), `where` | some matching JSON document satisfies `where` |
| `fileContains` / `fileLacks` | `path`, `text` | workspace file exists and contains / does not contain text |
| `fileUnchanged` / `fileChanged` | `path` | sha256 equals / differs from the value recorded before the runs |
| `pathExists` / `pathAbsent` | `path` (glob), `base?` (`ws` \| `home`) | glob matches something / nothing |
| `outputContains` | `text` | combined OMP stdout/stderr contains text |
| `gitBranchExists` | `pattern` | `git branch --list <pattern>` is non-empty |
| `anyOf` | `of[]` (assertions) | at least one alternative passes; use it where OMP may deliver the same fact on two paths (a `wait` result or an `async-result` notice) |

Pitfalls: print mode (`-p`) does not print slash-command output, so drive tools through mock tool calls; `Unable to connect` in the OMP log means the mock is down or a proxy intercepted localhost.
