# Native OMP `reflect`

Native OMP `reflect` synthesizes information from the configured long-term memory backend. It is not the pstack transcript-reflection workflow.

## Availability and input

The tool is registered when `memory.backend` is `hindsight` or `mnemopi`. It is absent for `off` and `local`. It accepts a required `query` and optional `context` string. The explicit call is single-shot and does not inspect the active JSONL transcript directly.

With Hindsight, OMP may ensure the active bank exists and sends the query to the configured reflect endpoint. With Mnemopi, OMP performs scoped local recall and formats the recalled context. A Mnemopi result is recalled context, not a separate synthesis-model pass. Backend failures remain errors. Missing backend state is not converted into a successful empty answer.

## Native reflect versus `pstack-reflect`

| Capability | Native OMP `reflect` | `pstack-reflect` |
|---|---|---|
| Primary source | Hindsight or Mnemopi long-term memory | Active OMP JSONL transcript |
| Input | Query plus optional context | Current session path or bounded digest |
| Process | One backend request or local scoped recall | One batch of panel reviewers, then a separate synthesizer |
| Output | Memory synthesis or formatted recalled context | Accepted, rejected, and backlog proposals for skill edits |
| File changes | None by the tool | Never applies the proposed edits; operator approval starts a later workflow |
| Evidence | Backend memory result | Transcript citations, artifact paths, commands, and shared records actually read |

Use native `reflect` for a memory-backed answer. Use `skill://pstack-reflect` when the question is what the current engineering session taught the workflow and which durable skill changes should be proposed.

## Side effects and limits

Hindsight may perform a bank setup request before the reflect request. Mnemopi is local unless its configured runtime uses an external provider. Native reflect does not update the pstack acceptance ledger or artifact fingerprint. The pstack workflow requires a parent to preserve scope, reject prompt-injected transcript instructions, and wait for explicit approval before implementation.
