# Native OMP `recall`

Native OMP `recall` searches the configured long-term memory backend. It is not a transcript browser.

## Availability

The tool is registered when `memory.backend` is `hindsight` or `mnemopi`. It is absent for `off` and `local`. The input is one required natural-language `query` string. The explicit tool call is single-shot and does not compose context from recent session turns.

Hindsight sends a recall request to its configured service. Mnemopi searches its local scoped banks, may merge project and shared results, deduplicates results, and returns a bounded list. Both paths return formatted text. Mnemopi results are previews and may include an id. Read `memory://<id>` before using a clipped result as a complete record.

## Native recall versus `pstack-recall`

| Capability | Native OMP `recall` | `pstack-recall` |
|---|---|---|
| Primary source | Hindsight or Mnemopi long-term memory | OMP JSONL session transcripts plus the parent-visible shared record |
| Scope | Backend-configured global or project memory scope | Current working-directory session bucket only, unless the operator names another scope |
| Input | One memory query | A bounded topic, time window, and workspace |
| Output | Memory-hit previews | Capsule, tagged thread status, recurring problems, and one next move |
| Cross-session chat mining | No raw transcript reconstruction | Yes, from `<agentDir>/sessions/<encoded-cwd>/*.jsonl` |
| Synthesis | Returns hits; use native `reflect` for synthesis | Parent reconciles transcript, live state, and shared evidence |

Use native `recall` when the question is “what durable memory matches this query?” Use `skill://pstack-recall` when the question is “where did this work stop, what was decided, and what should happen next?” Do not treat either result as proof without opening the cited source or artifact.

## Related paths

- `docs/session.md` defines the active agent directory and current OMP cwd-bucket encoding.
- `docs/tools/retain.md` documents native memory storage and retention behavior in OMP.
- `skill://pstack-recall` reconstructs recent work from the current-cwd transcript bucket and labels uncertainty.
