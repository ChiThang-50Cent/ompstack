# Refactors

A refactor changes structure while preserving the current contract unless the root explicitly versions a contract change.

- Establish the behavior and compatibility baseline before editing: public exports, wire/data formats, side effects, errors, ordering, performance constraints, and tests.
- Prefer mechanical, ownership-bounded transformations. Keep unrelated cleanup out of the patch and avoid introducing a second convention.
- Trace every changed boundary to its consumers. Preserve adapters only when they are part of the existing contract; do not leave speculative aliases or dead paths.
- Run focused before/after checks at the affected real surface. If a public API, persistence format, migration, concurrency boundary, or security policy changes, classify above LOW and use the corresponding design/review rigor.
- Treat behavior-changing discoveries as a contract decision, not as an incidental refactor detail. Refresh patch identity and invalidate affected evidence after each semantic change.
