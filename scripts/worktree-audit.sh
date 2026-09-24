#!/usr/bin/env bash
# Read-only worktree prune audit for OMP projects. It classifies every
# worktree by size, age, merge state, uncommitted work, remote state, and
# the newest current-cwd OMP session that mentioned the path. It never
# deletes a worktree. Deletion remains an explicit human-gated action.
#
# Usage: worktree-audit.sh [repo-path]
# The repository path defaults to the current git top level.
set -u

repo="${1:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -z "$repo" ] && { echo "not in a git repo; pass a repo path" >&2; exit 1; }
cd "$repo" || exit 1

main_wt=$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')
[ -z "$main_wt" ] && { echo "could not identify the main worktree" >&2; exit 1; }

# Use an existing remote ref when available. Do not fetch: this audit is
# read-only and a stale ref is reported rather than silently changed.
merge_ref="origin/main"
git show-ref --verify --quiet "refs/remotes/$merge_ref" || merge_ref="HEAD"

# PR state is optional. The audit remains useful when gh or jq is absent.
prs_file=$(mktemp)
trap 'rm -f "$prs_file"' EXIT
if command -v gh >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
  gh pr list --author "@me" --state all --limit 1000 \
    --json number,state,headRefName 2>/dev/null >"$prs_file" || printf '[]\n' >"$prs_file"
else
  printf '[]\n' >"$prs_file"
fi

# OMP 18.x stores sessions in a profile-aware current-cwd bucket. Home and
# temporary paths use their relative forms; other paths use the legacy
# absolute form. Keep the encoding here aligned with docs/session.md.
agent_dir="${PI_CODING_AGENT_DIR:-$HOME/.omp/agent}"
case "$main_wt" in
  "$HOME"/*) bucket="-${main_wt#"$HOME/"}" ;;
  /tmp/*) bucket="-tmp-${main_wt#/tmp/}" ;;
  *) bucket="--${main_wt#/}--" ;;
esac
bucket=$(printf '%s' "$bucket" | sed 's#[/:\\]#-#g')
transcripts="$agent_dir/sessions/$bucket"
now=$(date +%s)

printf 'SIZE\tAGE\tMERGED\tDIRTY\tREMOTE\tPR\tLAST_SESSION\tBUCKET\tWORKTREE\n'

# The first worktree is the primary checkout. Every other path is a
# candidate, but a bucket is advice only. The operator checks pinned chats,
# active goals, and uncommitted files before removing anything.
git worktree list --porcelain | awk '/^worktree /{print $2}' | while read -r wt; do
  [ "$wt" = "$main_wt" ] && continue

  size=$(du -sh "$wt" 2>/dev/null | awk '{print $1}')
  head=$(git -C "$wt" rev-parse HEAD 2>/dev/null)
  head_ts=$(git -C "$wt" log -1 --format='%ct' HEAD 2>/dev/null || echo 0)
  age=$([ "$head_ts" -gt 0 ] 2>/dev/null && echo "$(( (now - head_ts) / 86400 ))d" || echo '?')
  git merge-base --is-ancestor "$head" "$merge_ref" 2>/dev/null && merged=YES || merged=no

  porcelain=$(git -C "$wt" status --porcelain 2>/dev/null)
  if [ -z "$porcelain" ]; then
    dirty=clean
  elif printf '%s\n' "$porcelain" | grep -qv '^??'; then
    dirty="wip:$(printf '%s\n' "$porcelain" | grep -cv '^??')"
  else
    dirty="scratch:$(printf '%s\n' "$porcelain" | grep -c '^??')"
  fi

  branch=$(git -C "$wt" symbolic-ref --quiet --short HEAD 2>/dev/null || echo '')
  if [ -z "$branch" ]; then
    remote=detached
  elif git -C "$wt" show-ref --verify --quiet "refs/remotes/origin/$branch"; then
    [ "$(git -C "$wt" rev-parse "origin/$branch" 2>/dev/null)" = "$head" ] \
      && remote=pushed \
      || remote="ahead$(git -C "$wt" rev-list --count "origin/$branch..HEAD" 2>/dev/null)"
  else
    remote=no-remote
  fi

  pr='-'
  if [ -n "$branch" ] && command -v jq >/dev/null 2>&1; then
    pr=$(jq -r --arg branch "$branch" \
      '.[] | select(.headRefName==$branch) | "#\(.number)/\(.state)"' \
      "$prs_file" 2>/dev/null | sed -n '1p')
    [ -z "$pr" ] && pr='-'
  fi

  last='-'
  last_ts=0
  if [ -d "$transcripts" ]; then
    session_file=$(grep -R -l -E "${wt}/|${wt}\"" "$transcripts" --include='*.jsonl' 2>/dev/null \
      | while read -r file; do stat -c '%Y %n' "$file" 2>/dev/null; done \
      | sort -rn | sed -n '1p')
    if [ -n "$session_file" ]; then
      last_ts=${session_file%% *}
      last=$(date -d "@$last_ts" '+%Y-%m-%d' 2>/dev/null || echo '?')
    fi
  fi
  recent=$([ "$last_ts" -gt 0 ] 2>/dev/null && [ $(( (now - last_ts) / 86400 )) -le 4 ] && echo yes || echo no)

  case "$dirty" in
    wip:*) bucket_name=hold-wip ;;
    *)
      case "$pr" in
        *OPEN*) bucket_name=hold-open-pr ;;
        *)
          if [ "$recent" = yes ]; then bucket_name=verify-recent-session
          elif [ "$merged" = YES ] || [ "$pr" != '-' ]; then bucket_name=safe
          else bucket_name=review
          fi
          ;;
      esac
      ;;
  esac

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$size" "$age" "$merged" "$dirty" "$remote" "$pr" "$last" "$bucket_name" "$wt"
done | sort -t$'\t' -k1,1 -rh
