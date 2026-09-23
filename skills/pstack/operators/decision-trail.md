# Operator: Decision trail

Persist decisions that affect scope, architecture, safety, migration, or verification. Store only reviewable summaries—not private chain-of-thought.

Each record contains:
- phase;
- decision;
- why this choice follows from evidence/constraints;
- evidence references;
- observed result or reversal condition.

Record rejected alternatives only when their rejection matters later. Keep raw logs in artifacts and link them. For long work, checkpoint after every verified unit so a new session can recover without trusting a narrative summary alone.
