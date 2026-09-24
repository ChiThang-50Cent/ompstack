#!/bin/sh
# Run host scenarios against the host OMP (never the devDependency).
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
. "$ROOT/scripts/lib/resolve-omp.sh"
OMP_BIN=$(resolve_omp) || { echo "host OMP not found (install it or set PSTACK_OMP_BIN)" >&2; exit 1; }
echo "Host OMP: $OMP_BIN ($("$OMP_BIN" --version 2>&1 | head -n1))"
exec node "$ROOT/test/host/run.mjs" --omp "$OMP_BIN" "$@"
