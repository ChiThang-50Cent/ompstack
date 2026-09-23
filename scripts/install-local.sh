#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if ! command -v omp >/dev/null 2>&1; then
  echo "ERROR: omp is not installed or not on PATH." >&2
  exit 1
fi
exec omp plugin link "$ROOT"
