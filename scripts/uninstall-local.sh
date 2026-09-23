#!/bin/sh
set -eu
if ! command -v omp >/dev/null 2>&1; then
  echo "ERROR: omp is not installed or not on PATH." >&2
  exit 1
fi
exec omp plugin uninstall pstack-omp
