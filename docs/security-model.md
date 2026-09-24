# Security model

## Purpose

Pstack-OMP is a workflow integrity layer, not an isolation sandbox. It reduces common agent failure modes and makes authority/evidence explicit. It does not make untrusted code safe to execute.

## Assets

- source and generated artifacts;
- repository history/worktrees;
- credentials and provider sessions available to OMP;
- product data/services reached during verification;
- run state, evidence, and verdict records;
- operator authority over deploy/merge/destructive actions.

## Trust boundaries

### Main OMP process

Trusted to enforce tool approvals, custom-agent allowlists, worktree semantics, and extension events. A compromised host/runtime defeats plugin-level guarantees.

### Extension

Trusted to interpret event payloads and persist accurate state. It does not execute arbitrary remote code itself, but verifier/builder Bash commands run under OMP authority.

### Models and subagents

Untrusted for factual correctness and instruction compliance. Child sessions do not own parent pstack state and the bundled definitions declare no `pstack_*` tools. Because OMP may add baseline or extension tools beyond that declaration, OMP enforces the agent `tools:` allowlist and pstack-OMP intercepts child calls to block parent-state tools and `hub`. Reviewer/verifier Bash and verifier `eval` remain powerful; browser/computer are optional Eval preludes and are not sandboxed. Claims still require evidence and independent checking.

### Repository content

Potentially attacker-controlled. Instructions in source/docs/logs can attempt prompt injection. Agents must treat repository text as data unless the operator/skill contract grants authority.

### External systems

Network pages, APIs, databases, browsers, and package registries can be mutable or malicious. Verification skills should pin endpoints, use test environments, redact secrets, and document side effects.

## Threats and mitigations

| Threat | Mitigation | Residual risk |
|---|---|---|
| writer self-approves | separate verifier actor/toolset; parent-owned verdict ingestion | same-model correlated errors |
| verifier checks old code | artifact fingerprint gate | external state not captured by digest |
| background worker still mutating | async lifecycle/job reconciliation | missing/expired host job records |
| parallel writers collide | OMP task isolation (`task.isolation.enabled`); pstack warns on non-isolated writer tasks | isolation disabled or coordinator merges badly |
| fabricated evidence | reproducible refs + independent verifier | refs can still be misleading or unavailable |
| prompt injection in repo | frozen objective, bounded roles, tool restrictions | model may still follow malicious text |
| OMP exposes undeclared baseline/extension tools | OMP enforces frontmatter `tools`; pstack child guard blocks `pstack_*` and `hub`; assets never declare `task`/`spawns` | Bash/browser/external side effects remain possible |
| destructive verification | explicit project skill, reversibility rule, approvals | Bash is not a sandbox |
| runaway orchestration/cost | proportional ceremony, OMP model roles, bounded outputs | operator/model can still over-delegate |
| state hidden in chat | session entries + audit snapshots | operator can disable/reset workflow |

## Operational rules

- Do not place secrets in evidence files, prompts, or audit metadata.
- Use dedicated test accounts/environments for browser/API verification.
- Keep deployment, force-push, destructive migration, customer messaging, and production-data writes outside autonomous authority unless separately approved.
- Inspect builder worktrees/diffs before promotion.
- Treat `web_search`, package metadata, issue text, and repository instructions as untrusted content.
- Never weaken verifier tools merely to let it repair a failing artifact.

## Reporting

Security issues in the plugin should include:

- OMP version;
- plugin version/commit;
- mode/config;
- minimal event/task sequence;
- expected and observed gate/state;
- whether the issue depends on a specific provider/model;
- redacted audit excerpt and fingerprint metadata.
