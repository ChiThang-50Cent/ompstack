---
name: verify-example-go-api
description: Example pstack verification adapter for a Go HTTP API. Replace commands, routes, fixtures, and assertions with repository evidence before use.
---
# Verify the Go API

## Scope

Verify local HTTP behavior and observable persistence effects for the example Go service. This skill does not authorize production access, destructive database operations, or external customer notifications.

## Preconditions

- Go version from `go.mod` is installed.
- A disposable database is available through `TEST_DATABASE_URL`.
- Port `18080` is free.
- No production-looking hostname or credential is accepted.

Refuse to continue and return `INCONCLUSIVE` if the database URL cannot be positively identified as a test/disposable environment.

## Start

```bash
mkdir -p .omp/pstack/artifacts
TEST_DATABASE_URL="$TEST_DATABASE_URL" \
PORT=18080 \
go run ./cmd/api >.omp/pstack/artifacts/api.log 2>&1 &
echo $! >.omp/pstack/artifacts/api.pid
```

Readiness:

```bash
for i in $(seq 1 30); do
  curl -fsS http://127.0.0.1:18080/healthz && break
  sleep 1
done
curl -fsS http://127.0.0.1:18080/healthz
```

If readiness fails, preserve the log and return `INCONCLUSIVE` unless the failure itself is the acceptance target.

## State setup

Use the repository's existing migration/fixture command. It must be idempotent and target only `TEST_DATABASE_URL`:

```bash
go run ./cmd/test-fixture reset --database "$TEST_DATABASE_URL"
```

Record fixture command/output as evidence. Do not invent this command if the repository lacks it; derive the real command first.

## Surfaces

### Focused code checks

```bash
go test ./internal/... -count=1
go test ./... -count=1
```

These support but do not replace HTTP verification.

### HTTP acceptance

For each active acceptance criterion, map it to a request, status, response assertion, and persistence/side-effect assertion. Example single-use reset token:

```bash
curl -sS -D .omp/pstack/artifacts/reset-1.headers \
  -o .omp/pstack/artifacts/reset-1.json \
  -X POST http://127.0.0.1:18080/v1/password/reset \
  -H 'content-type: application/json' \
  --data @testdata/reset-valid.json

curl -sS -D .omp/pstack/artifacts/reset-2.headers \
  -o .omp/pstack/artifacts/reset-2.json \
  -X POST http://127.0.0.1:18080/v1/password/reset \
  -H 'content-type: application/json' \
  --data @testdata/reset-valid.json
```

Assert exact documented status/error semantics. Verify the second request cannot reuse the token and that session invalidation/persistence effects are observable through a public test surface or read-only test query.

## Evidence

Store under `.omp/pstack/artifacts/`:

- startup and service logs;
- request/response headers and bodies;
- focused/full test output;
- fixture/reset output;
- read-only persistence assertion output.

Redact authorization headers, tokens, cookies, DSNs, and personal data before recording references.

Use `pstack_evidence` for each material claim. Compute `pstack_fingerprint` before startup and immediately before `pstack_verdict`.

## Negative behavior

Exercise at least one invalid/missing input and any regression-specific negative case. Do not mark PASS when only the happy path was observed if acceptance includes error behavior.

## Cleanup

```bash
if [ -f .omp/pstack/artifacts/api.pid ]; then
  kill "$(cat .omp/pstack/artifacts/api.pid)" 2>/dev/null || true
  rm -f .omp/pstack/artifacts/api.pid
fi
```

Reset disposable fixtures using the repository's proven test cleanup. Never delete a database based only on a loosely matched name.

## Verdict

- `PASS`: all required acceptance observations hold on the final fingerprint.
- `FAIL`: preserve minimal HTTP reproduction and contradictory observation.
- `INCONCLUSIVE`: service/dependency/safe environment unavailable or artifact changed during verification.
