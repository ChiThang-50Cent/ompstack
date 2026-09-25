# Configuration

Pstack loads the first present file in this order:

1. `<workspace>/.omp/pstack.json`
2. `<workspace>/pstack.json`
3. built-in defaults

Malformed JSON or invalid value types do not crash the extension. Defaults are used and `/pstack doctor` reports the warning/source.

## Complete example

```json
{
  "defaultMode": "off",
  "writeAuditFiles": true,
  "enforceIndependentVerifier": true,
  "preferCrossFamilyVerifier": true,
  "requireEvidenceForPass": true,
  "requireArtifactFingerprint": true,
  "maxPolicyCharacters": 8000,
  "headlessOpenGateExitCode": 3,
  "engagementTripwire": true,
  "directMaxFiles": 1,
  "directMaxLines": 20,
  "auditDirectory": ".omp/pstack/runs",
  "fingerprintIgnore": [
    ".git",
    ".omp/pstack",
    "node_modules",
    "dist",
    ".test-dist",
    "target",
    "vendor",
    ".venv"
  ],
  "maxWorkspaceFiles": 20000,
  "maxHashedFileBytes": 26214400
}
```

The JSON schema is bundled at `skills/pstack/schemas/config.schema.json`.

## Fields

### `defaultMode`

One of `off`, `auto`, or `strict`. A CLI `--pstack-mode` value overrides this for the current session.

The built-in default is `off`. A mode selected with `/pstack auto`, `/pstack strict`, or `/pstack off` is stored in the current OMP session entry and restored when that session is reopened; it does not become a workspace-global default.

### `writeAuditFiles`

Writes state snapshots and append-only event records under `auditDirectory`. Session custom entries are still the durable in-session source of truth.

### Writer isolation

Pstack does not rewrite `isolated`. OMP owns task isolation: enable `task.isolation.enabled` so `pstack-builder` and `pstack-synthesizer` items can run in isolated worktrees. With isolation disabled, OMP silently drops an `isolated` field and the writer mutates the primary worktree. Pstack warns when it observes a writer task that OMP did not run isolated.

### `enforceIndependentVerifier`

Rejects a verdict when normalized `verifierActorId` is also present in `writerActorIds`.

### `preferCrossFamilyVerifier`

For verifier spawns, reorders the patterns OMP already resolved so a candidate whose model family differs from the latest builder/synthesizer comes first. It never introduces new patterns; if no different-family candidate is offered, OMP's order stands.

### `requireEvidenceForPass`

Requires evidence references for:

- required acceptance criteria marked passed;
- final `PASS` verdicts.

An evidence record is a claim plus a reproducible reference, producer, timestamp, optional fingerprint digest, and optional metadata.

### `requireArtifactFingerprint`

Requires a final verdict to carry a tested fingerprint and rejects it when the current digest differs.

### `maxStopGateBlocks`

How many times `session_stop` may block a gate-only run (no live OMP goal) before the session is allowed to end. Gate-only runs must have been initialized in `auto` or `strict`; `off` refuses initialization. When the key is omitted the budget depends on the mode: `strict` blocks twice, `auto` never blocks. Set it explicitly (including `0`) to override both. Stopping never passes a gate: the run stays `active`, and the next `pstack_gate action=check` or goal completion is still refused until the gates pass. Goal-bound runs are never blocked here; OMP's goal continuation owns that loop.

### `headlessOpenGateExitCode`

Exit code for a process without a UI (`omp -p`, `--mode json`, CI, cron) that ends while an auto/strict run has open gates or an unengaged change exceeds the direct budget. Default `3`; `0` disables the override. Only a clean exit is changed: a non-zero code chosen by OMP (provider error, abort, signal) is passed through. The same condition writes its report to stderr and attempts an audit event. A run whose gates pass but that was never closed with `pstack_gate action=check` is reported but does not change the exit code. Interactive sessions keep the UI warning and never change the exit code.

### `engagementTripwire`, `directMaxFiles`, `directMaxLines`

Gates only protect work done inside a run, so a model that never opens one bypasses them. In the Stage A bench every false completion came from sessions that changed code without a run, in strict mode too. The tripwire measures the artifact instead of guessing intent: at session/lifecycle start and mode activation pstack writes the working tree (tracked, modified and untracked files that git does not ignore, minus `.omp/pstack`, `auditDirectory` and `fingerprintIgnore`) to a git tree object through a throwaway index, so the user's index, refs and files are untouched. At stop and shutdown it snapshots again and diffs. When no run was opened during the lifecycle (an abandoned run still counts as engagement) and the diff exceeds `directMaxFiles` files or `directMaxLines` added+deleted lines:

- `strict` blocks the stop, with the same budget as `maxStopGateBlocks`, and asks the model to open a run for what it changed. Strict also blocks the direct write tools (`edit`, `write`, `ast_edit`) before a run exists, unless the prompt routed `direct`. `bash` writes are not intercepted; the diff catches them.
- `auto` never blocks. Interactive sessions get a warning.
- Without a UI, both modes print the finding on stderr, record `unengaged_change`, and exit `headlessOpenGateExitCode`.

Events without a run go to `<auditDirectory>/session-events.jsonl` when the audit write succeeds (`unengaged_write_blocked`, `unengaged_stop_blocked`, `unengaged_change`). Outside a git work tree, or where `env`/`git` are unavailable, the tripwire stays silent. Defaults: `true`, `1`, `20`.

### `maxPolicyCharacters`

Caps the compact system-prompt segment. The skill corpus remains lazy-loaded and is not included wholesale.

### `auditDirectory`

Workspace-relative directory for human-readable audit artifacts. Keep it inside the workspace; default fingerprint ignores `.omp/pstack`.

### `fingerprintIgnore`

Directory/file path segments excluded from workspace hashing. Entries are normalized path segments, not a full `.gitignore` implementation. Do not ignore source or generated assets that affect runtime behavior merely to make a digest stable.

### `maxWorkspaceFiles`

Maximum files considered for non-Git tree hashing and untracked discovery. Exceeding the limit produces a partial fingerprint with notes.

### `maxHashedFileBytes`

Maximum bytes read per file. Oversized files contribute metadata/partial notes rather than silently pretending their content was fully covered.

## Conservative profiles

### Minimal overhead

```json
{
  "defaultMode": "auto",
  "writeAuditFiles": false,
  "preferCrossFamilyVerifier": false
}
```

Keep isolation, evidence, independent verifier, and fingerprint requirements enabled unless conducting a controlled comparison.

### Strict regulated/high-risk repository

```json
{
  "defaultMode": "strict",
  "writeAuditFiles": true,
  "enforceIndependentVerifier": true,
  "preferCrossFamilyVerifier": true,
  "requireEvidenceForPass": true,
  "requireArtifactFingerprint": true,
  "maxWorkspaceFiles": 50000,
  "maxHashedFileBytes": 52428800
}
```

This does not replace organizational review, security controls, CI, protected branches, or deployment authorization.
