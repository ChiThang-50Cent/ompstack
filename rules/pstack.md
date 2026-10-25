---
description: Map pstack's Cursor names to OMP before following any pstack skill
alwaysApply: true
---
pstack skills (`poteto-mode`, `principle-*`, `how`, `architect`, `arena`, …) are written for Cursor. Before you follow any of them, read `skill://pstack-omp` once per session. Its Policy section overrides conflicting pstack text.

During a pstack run, these hold every turn:
- Write the final chat reply in OMP's style (system prompt Tone), not poteto-mode's "Writing the reply" format. pstack prose rules apply to artifacts only.
- Local-only experiments (including app/service/container builds, installs, starts, and restarts) are allowed even when called "deploy"; classify by actual target and effects. Never deploy to a non-local environment or write/delete against a non-local database or data service.
- Before each push or other remote-ref change (including merge and merge-queue arming), show the exact command, remote/repository, and refs; request explicit user approval and wait. Approval is specific to that command and scope, including for subagents. Block the todo while waiting; do not skip it. If declined, drop it and state why.
- A forbidden or unavailable PR step gets todo `drop`, never `done`, plus a `Skipped in OMP:` line and the exact command for the human.
