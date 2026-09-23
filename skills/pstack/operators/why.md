# Operator: Why the system is this way

Use when design rationale, historical constraints, compatibility, or prior failed approaches affect the current decision.

## Evidence order

1. Current code and tests establish what exists, not necessarily why.
2. Version-control history and blame identify the change and contemporaneous context.
3. Issues, PRs, ADRs, docs, release notes, and operational records may document intent.
4. Chat or recollection is supporting evidence, not the only source for irreversible conclusions.

Label each conclusion as documented, strongly inferred, weakly inferred, or unknown. Record searches with no result. Do not convert absence of rationale into permission to remove a constraint; validate whether the constraint still exists empirically.
