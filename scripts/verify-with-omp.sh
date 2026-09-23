#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
MIN_VERSION=18.2.11

if ! command -v omp >/dev/null 2>&1; then
  echo "ERROR: omp is not installed or not on PATH." >&2
  exit 1
fi

VERSION_OUTPUT=$(omp --version 2>&1)
VERSION=$(printf '%s\n' "$VERSION_OUTPUT" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n 1)
if [ -z "$VERSION" ]; then
  echo "ERROR: could not parse OMP version from: $VERSION_OUTPUT" >&2
  exit 1
fi

lowest=$(printf '%s\n%s\n' "$MIN_VERSION" "$VERSION" | sort -V | head -n 1)
if [ "$lowest" != "$MIN_VERSION" ]; then
  echo "ERROR: pstack-omp requires OMP >= $MIN_VERSION; found $VERSION." >&2
  exit 1
fi

HELP=$(omp --help 2>&1)
printf '%s\n' "$HELP" | grep -q -- '--extension' || {
  echo "ERROR: this OMP build does not advertise --extension." >&2
  exit 1
}

printf 'OMP compatibility preflight passed: %s\n' "$VERSION_OUTPUT"
printf 'Extension entry: %s\n' "$ROOT/src/index.ts"

if [ "${PSTACK_LIVE_SMOKE:-0}" != "1" ]; then
  cat <<'MSG'
Live model-backed smoke was skipped.
Run with PSTACK_LIVE_SMOKE=1 after configuring an OMP provider. Optional:
  PSTACK_SMOKE_MODEL=@slow PSTACK_LIVE_SMOKE=1 npm run verify:omp
MSG
  exit 0
fi

TMP=$(mktemp -d "${TMPDIR:-/tmp}/pstack-omp-smoke.XXXXXX")
trap 'rm -rf "$TMP"' EXIT HUP INT TERM
MODEL_ARGS=""
if [ -n "${PSTACK_SMOKE_MODEL:-}" ]; then
  MODEL_ARGS="--model ${PSTACK_SMOKE_MODEL}"
fi

git -C "$TMP" init -q
printf 'smoke\n' > "$TMP/artifact.txt"

run_omp() {
  # Print mode hangs on an inherited interactive stdin; close it.
  # shellcheck disable=SC2086
  omp --cwd "$TMP" --no-session --no-title --max-time 3m \
    --extension "$ROOT/src/index.ts" --tools "$1" -p $MODEL_ARGS "$2" </dev/null 2>&1
}

OUTPUT=$(run_omp pstack_status "Call the pstack_status tool exactly once. Return its tool text verbatim and do nothing else.")
printf '%s\n' "$OUTPUT"
printf '%s\n' "$OUTPUT" | grep -qi 'pstack mode' || {
  echo "ERROR: live smoke did not observe pstack_status output." >&2
  exit 1
}

# Gate-only end to end (goal mode is interactive-only): open proof state with one
# required criterion, check (must be refused), then abandon so the stop gate
# releases. Assert on the audit trail pstack writes, not on model prose.
OUTPUT=$(run_omp pstack_gate "Call pstack_gate with action=init, objective='Smoke gate', playbook='feature', ceremony='standard', verificationRequired=false, acceptance=[{id:'AC-1', text:'smoke criterion'}]. Then call pstack_gate with action=check. Then call pstack_gate with action=abandon and reason='smoke complete'. Return the check tool text verbatim.")
printf '%s\n' "$OUTPUT"
EVENTS=$(cat "$TMP"/.omp/pstack/runs/*/events.jsonl 2>/dev/null || true)
for expected in '"type":"start_run"' '"type":"gate_abandoned"'; do
  printf '%s\n' "$EVENTS" | grep -q "$expected" || {
    echo "ERROR: live gate smoke audit is missing $expected." >&2
    exit 1
  }
done
if printf '%s\n' "$EVENTS" | grep -q '"type":"gate_closed"'; then
  echo "ERROR: live gate smoke closed a run whose required criterion was open." >&2
  exit 1
fi
echo "Live OMP smoke passed."
