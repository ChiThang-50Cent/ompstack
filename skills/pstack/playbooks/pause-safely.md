---
name: pstack-pause-safely
description: Stop a long-running OMP effort at a safe boundary and leave a durable checkpoint a cold-start agent can resume without guessing.
---

# Pause safely

Use only for an explicit pause request. “Keep going”, “do not stop”, or equivalent is not a pause.

1. Finish the current atomic step or back out of it. Start nothing new. Cancel nested work that is no longer needed.
2. Take no irreversible action to pause. Do not create a PR, push, deploy, or delete state unless that action was already explicitly authorized.
3. Make work durable. Commit uncommitted edits as one clear `wip:` commit on the current branch. If the tree is broken, say so in the commit body in one line.
4. Write a resume note outside the active context. Include intent, current phase, progress, checks and evidence, on-disk state, next steps, key files, and gotchas. If a pstack decision trail exists, point to it instead of duplicating it.
5. Leave the OMP goal paused or explicitly closed according to the host contract. Record the pause and resume artifact through `pstack_decision`.

## Reply

Return where the loop stopped, what is on disk versus still unresolved, the commits made, tree state, resume-note path, and the first action on resume. This is a checkpoint, not a final success claim.
