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
  "maxStopGateBlocks": 0,
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

How many times `session_stop` may block a gate-only run (no live OMP goal) before the session is allowed to end. Default `0`: the session ends on the first stop and a warning lists the open gates. Stopping never passes a gate: the run stays `active`, and the next `pstack_gate action=check` or goal completion is still refused until the gates pass. Raise it to give the model that many extra attempts.

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
