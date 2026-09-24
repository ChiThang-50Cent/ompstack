#!/bin/sh
# Run host scenarios on every OMP version in the supported matrix.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
MATRIX=${PSTACK_OMP_MATRIX:-"18.2.11 18.3.0"}
status=0
for v in $MATRIX; do
  prefix="$ROOT/.upstream/omp-$v"
  bin="$prefix/node_modules/.bin/omp"
  if [ ! -x "$bin" ]; then
    npm install --prefix "$prefix" --no-audit --no-fund --no-save "@oh-my-pi/pi-coding-agent@$v" >/dev/null
  fi
  got=$("$bin" --version 2>&1 | head -n1)
  [ "$got" = "omp/$v" ] || { echo "matrix: expected omp/$v, got $got" >&2; exit 1; }
  echo "##### $got"
  node "$ROOT/test/host/run.mjs" --omp "$bin" "$@" || status=1
done
exit $status
