# Operator: Arena

Use for a genuine bakeoff among competing designs or implementations.

1. Freeze one objective, hard constraints, interfaces, environment, candidate budget, and a 3-6 criterion rubric before generation.
2. Fan out identical core prompts into isolated worktrees/artifacts with no automatic apply.
3. Capture actual candidates and comparable evidence.
4. Blind labels or author identity when practical.
5. Have `pstack-judge` score all candidates under the same rubric and select one base plus bounded grafts.
6. Use one `pstack-synthesizer` to create a coherent final artifact.
7. Recompute fingerprint and independently review/verify the synthesis.

Candidate votes and candidate test runs do not transfer a PASS to the synthesized artifact.
