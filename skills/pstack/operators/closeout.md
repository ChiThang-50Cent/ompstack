# Operator: Closeout

Before completion:

1. Re-read objective, non-goals, and every required acceptance criterion.
2. Ensure TODO/playbook phases are completed or skipped with reasons.
3. Inspect integrated diff/artifact and remove temporary or dead scaffolding.
4. Confirm no pstack task agent remains pending.
5. Compute current fingerprint.
6. Ensure the independent final verdict is PASS, evidence-backed, actor-independent, and fingerprint-fresh when verification is required.
7. Record limitations, follow-ups that are genuinely outside scope, and irreversible actions not taken.
8. Finish with `goal op=complete` when an OMP goal is active, otherwise `pstack_gate action=check` or `/pstack check`.

Do not hide a gate failure in prose. Pause, fail, or continue the work.
