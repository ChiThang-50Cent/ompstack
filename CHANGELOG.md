# Changelog

## 0.3.0

### Added

- Add a read-only advisor skill for cross-model consultation before substantial implementation. It prefers the `advisor` model role, then checks `slow` and `task` for a different model family.
- Reuse the advisor session for follow-up questions when available. Prompt-cache reuse depends on the provider and is not guaranteed.

### Removed

- Remove the brainstorm skill, its reviewer agents, and its automatic routing.

### Known limitation

- If OMP does not expose the advisor's actual resolved model identity, the skill reports that cross-family consultation is unverified.
