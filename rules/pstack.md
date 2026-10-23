---
description: Map pstack's Cursor names to OMP before following any pstack skill
alwaysApply: true
---
pstack skills (`poteto-mode`, `principle-*`, `how`, `architect`, `arena`, …) are written for Cursor. Before you follow any of them, read `skill://pstack-omp` once per session. Its Policy section overrides conflicting pstack text.

During a pstack run, these hold every turn:
- Write the final chat reply in OMP's style (system prompt Tone), not poteto-mode's "Writing the reply" format. pstack prose rules apply to artifacts only.
- Never push or move a remote ref, and never write to a non-local database. A PR step you cannot finish gets todo `drop`, never `done`, plus a `Skipped in OMP:` line and the exact command for the human.
