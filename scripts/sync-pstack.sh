#!/usr/bin/env bash
# Vendor the pstack skills this port ships, from cursor/plugins at a given ref (default: main).
# Usage: scripts/sync-pstack.sh [ref]
set -euo pipefail
REF=${1:-main}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Only skills OMP lacks. Dropped skills and their OMP replacements are listed in
# skills/pstack-omp/SKILL.md ("Skills not shipped"); keep both lists in sync.
KEEP=(
  poteto-mode how why architect arena interrogate swarm figure-it-out
  show-me-your-work no-comments benchmark-checklist technical-writing unslop
  typescript-best-practices
  principle-attack-the-premise principle-boundary-discipline principle-build-the-lever
  principle-encode-lessons-in-structure principle-exhaust-the-design-space
  principle-experience-first principle-explain-the-number principle-fix-root-causes
  principle-foundational-thinking principle-laziness-protocol
  principle-make-operations-idempotent principle-minimize-reader-load
  principle-model-the-domain principle-outcome-oriented-execution
  principle-redesign-from-first-principles
  principle-separate-before-serializing-shared-state
  principle-sequence-verifiable-units principle-subtract-before-you-add
  principle-type-system-discipline
)

git clone -q --filter=blob:none --sparse https://github.com/cursor/plugins.git "$TMP/plugins"
git -C "$TMP/plugins" sparse-checkout set pstack
git -C "$TMP/plugins" checkout -q "$REF"
SRC=$TMP/plugins/pstack
SHA=$(git -C "$TMP/plugins" rev-parse HEAD)
VERSION=$(bun -e "console.log(require('$SRC/plugin.json').version)")

find "$ROOT/skills" -mindepth 1 -maxdepth 1 ! -name pstack-omp -exec rm -rf {} +
for name in "${KEEP[@]}"; do
  cp -R "$SRC/skills/$name" "$ROOT/skills/$name"
done
cp "$SRC/agents/comment-sicko.md" "$ROOT/agents/comment-sicko.md"
cp "$SRC/LICENSE" "$ROOT/LICENSE.pstack"
printf 'cursor/plugins pstack %s @ %s\n' "$VERSION" "$SHA" > "$ROOT/UPSTREAM"

echo "synced pstack $VERSION @ $SHA (${#KEEP[@]} skills)"
echo "upstream skills not in KEEP (new ones need a keep/drop decision):"
LC_ALL=C comm -23 <(ls "$SRC/skills" | LC_ALL=C sort) <(printf '%s\n' "${KEEP[@]}" | LC_ALL=C sort)
