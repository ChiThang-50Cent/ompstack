#!/bin/sh
# Pin upstream sources used by the port (never committed; see .gitignore).
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
UPSTREAM_PSTACK_REPO=https://github.com/cursor/plugins.git
UPSTREAM_PSTACK_COMMIT=12d587d
UPSTREAM_OMP_REPO=https://github.com/can1357/oh-my-pi.git
UPSTREAM_OMP_COMMIT=62bc57b
DEST="$ROOT/.upstream"
mkdir -p "$DEST"

pin() { # <repo-url> <dir> <short-commit> [sparse-path]
  repo=$1; dir=$2; want=$3; sparse=${4:-}
  if [ ! -d "$dir/.git" ]; then git clone --no-checkout "$repo" "$dir"; fi
  if ! git -C "$dir" cat-file -e "$want^{commit}" 2>/dev/null; then
    git -C "$dir" fetch --tags origin
    if [ -f "$dir/.git/shallow" ]; then git -C "$dir" fetch --unshallow origin; fi
  fi
  git -C "$dir" cat-file -e "$want^{commit}" || { echo "commit $want not found in $repo" >&2; exit 1; }
  if [ -n "$sparse" ]; then git -C "$dir" sparse-checkout set "$sparse"; fi
  git -C "$dir" checkout --detach -q "$want"
  actual=$(git -C "$dir" rev-parse --short=7 HEAD)
  [ "$actual" = "$want" ] || { echo "pin mismatch in $dir: $actual != $want" >&2; exit 1; }
  echo "pinned $dir at $actual"
}

pin "$UPSTREAM_PSTACK_REPO" "$DEST/cursor-plugins" "$UPSTREAM_PSTACK_COMMIT" pstack
pin "$UPSTREAM_OMP_REPO"    "$DEST/oh-my-pi"       "$UPSTREAM_OMP_COMMIT"
