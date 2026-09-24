---
name: pstack-worktree-cleanup
description: Audit and safely prune merged or abandoned git worktrees and stale local runtime state, with a dry-run report and explicit gates for active chats and uncommitted work.
---

# Worktree and runtime cleanup

Own the disk and the safety gate. Pruning a worktree or runtime is irreversible, so the audit must identify active work, uncommitted changes, merge state, and current OMP sessions before any deletion.

## 1. Snapshot and audit

Record `df -h /` before cleanup. Run `scripts/worktree-audit.sh <repo-path>` in its read-only mode. It reads paths from `git worktree list`, classifies size, age, merge state, dirty state, remote/PR state, and the newest OMP current-cwd session that mentions each path. It suggests a bucket. Do not hand-type worktree paths. Do not treat a stale remote ref or an absent forge CLI as proof of safety.

The session scan is bounded to the current repository's OMP bucket from `docs/session.md`. It must not search sibling projects or unrelated private transcripts. The audit output is advice, not permission.

## 2. Confirm active usage

The operator's pinned chats, active OMP goals, and current worktree state are the real artifact. Cross-check every suggested candidate. For a recent-session candidate or anything uncertain, dispatch bounded read-only `pstack-scout` tasks over the cited session files. Ask whether the session is active or pinned and which worktree it touches. Do not let a worker delete files.

A clean worktree can still be in use by a background task. A stale-looking name is not evidence. A worktree with tracked edits, an open PR, or a current session stays held until the owner confirms its status.

## 3. Gate irreversible loss

Pause before deleting anything with uncommitted work or active use. `wip:N` means tracked uncommitted edits. Show the diff and ask for an explicit decision because removing it loses work. `scratch:N` means untracked files. Name them before asking whether they are disposable. A worktree with a pinned or recent session goes to `verify-recent-session` until the session owner confirms it is idle.

Clean, merged, and not-in-use worktrees may proceed only under the user's cleanup authorization. Branch refs survive a worktree removal, but uncommitted files do not. Do not delete the primary checkout. Do not delete production or customer data through this playbook.

## 4. Prune the confirmed set

For each explicitly confirmed path, run the least destructive supported git worktree removal. Re-run the audit after each small batch. If ignored build artifacts remain, report them and wait before using a recursive filesystem deletion. Prune stale git metadata only after the worktree list proves no live path remains. Keep a decision record with the path, reason, operator authority, and before/after evidence.

Never combine an audit and deletion command into one opaque script. Dry-run first. A failed removal is a blocker to report, not a reason to broaden deletion.

## 5. Other local reclaimers

Only after worktrees are handled, inspect large local runtime state such as simulator images, build caches, package caches, or old derived data. Use the platform's documented inventory and dry-run commands. Clear only caches the user has not said to keep. Treat simulator runtimes and shared caches as user state. Ask before deletion and record the exact selected identifiers.

## Reply

Return `df -h /` before and after when cleanup ran, the audit path, worktrees inspected and pruned, evidence for merge and usage checks, each held-back path with the active session or uncommitted reason, and any runtime caches left untouched. If no deletion was authorized, return the dry-run table and the next approval boundary.
