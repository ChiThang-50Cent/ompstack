#!/usr/bin/env bash
# Append one safe, single-line decision row to a TSV export.
# Usage is log.sh logfile phase decision why evidence result.
# The pstack decision ledger remains canonical. This file is only a
# readable export and may be left out of Git for local work.
# The script deliberately appends rather than replacing a file.
# A first call creates the header. Later calls preserve prior rows.
# Tabs, line breaks, and carriage returns are flattened before writing.
# Spreadsheet formula prefixes are quoted so evidence from a user,
# filename, pull request, or generated result cannot execute on open.
# The timestamp is UTC and is generated at the moment the row is written.
# Callers should pass evidence pointers, not prose, in the evidence cell.
# A failed invocation must leave the existing log untouched.
set -euo pipefail

if [ "$#" -ne 6 ]; then
  printf 'usage: log.sh <logfile> <phase> <decision> <why> <evidence> <result>\n' >&2
  exit 1
fi

logfile="$1"
shift
logdir="$(dirname "$logfile")"
if [ -n "$logdir" ] && [ "$logdir" != "." ] && [ ! -d "$logdir" ]; then
  mkdir -p "$logdir"
fi

if [ ! -s "$logfile" ]; then
  printf 'ts\tphase\tdecision\twhy\tevidence\tresult\n' >> "$logfile"
fi

ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
clean() {
  local value
  value=$(printf '%s' "$1" | tr '\t\n\r' '   ')
  case "$value" in
    =*|+*|-*|@*) printf "'%s" "$value" ;;
    *) printf '%s' "$value" ;;
  esac
}
printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
  "$ts" "$(clean "$1")" "$(clean "$2")" "$(clean "$3")" "$(clean "$4")" "$(clean "$5")" \
  >> "$logfile"
