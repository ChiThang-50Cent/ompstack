# Poteto mode to ompstack diff

This table records the port decision for each upstream poteto-mode rule or paragraph. `yes` means the rule already exists or was imported unchanged. `partial` means the rule is expressed through an OMP equivalent. `no` means it was deliberately dropped because the Cursor-only mechanism or target skill does not exist yet. No row links forward to an asset that is not present at this commit.

## Metadata and non-negotiables

| Upstream rule / paragraph | In ompstack? | Location | Action | Reason |
|---|---|---|---|---|
| Frontmatter `name: Poteto Mode`, `mode`, icon, color, reminder | partial | `skills/pstack/SKILL.md` frontmatter | adapt | Pstack is an OMP skill, not a Cursor mode. Sticky behavior belongs to OMP session mode. |
| Principles section grounds every trigger; cite only leaf principles read this session | yes | `skills/pstack/SKILL.md`, Poteto-mode compatibility | keep | OMP already ships the 23 leaf principles and now makes citation scope explicit. |
| Nontrivial change or architecture decision uses `how` | yes | `skills/pstack/SKILL.md`, Principles and triggers | keep | Existing OMP operator is the equivalent. |
| Classify a proposed question before asking; observable facts are measured | yes | `skills/pstack/SKILL.md`, Classify before asking | import | Required T2.7 behavior. |
| `AskQuestion` mechanism | no | none | drop | Cursor-only tool; OMP uses the parent conversation and empirical prototype. |
| Prototype observable behavior/layout/timing/output/performance forks | yes | `skills/pstack/playbooks/empirical-prototype.md`, Classify before asking | keep | OMP already has the discriminating experiment contract. |
| Read-only investigation answers from evidence without a sketch | yes | `skills/pstack/operators/how.md`, `why.md` | adapt | OMP operators own cited investigation output. |
| Any code names data shape and uses model-the-domain | yes | `skills/pstack/SKILL.md`, non-negotiable execution contract | keep | Existing OMP policy and imported principle. |
| Function-boundary code uses architect and parallel design | yes | `skills/pstack/operators/architect.md` | keep | OMP architect/arena topology replaces Cursor Task runners. |
| Parallel fan-out uses swarm; design bakeoffs use arena | yes | `skills/pstack/operators/swarm.md`, `arena.md` | keep | Both operators are OMP-native imports. |
| Contested design uses interrogate before shipping | yes | `skills/pstack/operators/interrogate.md` | keep | Panel reviewers and role routing are OMP-native. |
| Nontrivial multi-step work writes a throughput checkpoint | yes | `skills/pstack/playbooks/feature.md`, `skills/pstack/SKILL.md` | keep | Feature step 4 is the OMP checkpoint. |
| Any prose uses unslop | yes | `skills/pstack-unslop/SKILL.md`, `skills/pstack/SKILL.md` | import | Target exists and resolves through `skill://pstack-unslop`. |
| Agent-facing prose uses Cursor create-skill | no | none | drop | Source skill is not yet imported and is Cursor-specific at this phase. |
| Docs/RFCs/readmes use technical-writing | no | none | defer | The target skill is a Phase 3 import; no forward link is emitted. Existing docs follow repository conventions. |
| Before commit uses cursor-team-kit deslop | no | none | drop | No OMP equivalent is present. Repository checks and review provide the current guard. |
| Before review uses no-comments | no | none | defer | Phase 3 import; no forward link is emitted. |
| Shipping UI/IDE/CLI uses Cursor control skills and reproduce-first exception | partial | `skills/pstack/playbooks/empirical-prototype.md`, `docs/limitations.md` | adapt | OMP verifies the actual surface when available; no Cursor control-skill dependency is introduced. |
| PR-status request uses Babysit and declares polling mode | partial | `skills/pstack/playbooks/shipping.md`, `skills/pstack/operators/closeout.md` | adapt | OMP has shipping/closeout contracts; the future babysit asset is not linked. |
| Bugbot/security-review comments use triage references | no | none | drop | The Cursor Bugbot and cursor-team-kit references are unavailable; findings still go through review and security playbooks. |
| Broken skill is fixed in its own PR | partial | `skills/pstack/SKILL.md`, multi-phase/closeout workflow | adapt | OMP commits are the local review boundary; no PR is fabricated. |
| Long/autonomous/multi-phase work creates a decision trail | yes | `skills/pstack/operators/decision-trail.md`, `skills/pstack/playbooks/multi-phase.md` | keep | Existing OMP state/evidence tools provide the durable trail. |

## Principles

| Upstream rule / paragraph | In ompstack? | Location | Action | Reason |
|---|---|---|---|---|
| Laziness Protocol | yes | `skills/pstack/principles/laziness-protocol.md` | keep | Imported at T2.1. |
| Foundational Thinking | yes | `skills/pstack/principles/foundational-thinking.md` | keep | Imported at T2.1. |
| Redesign from First Principles | yes | `skills/pstack/principles/redesign-from-first-principles.md` | keep | Imported at T2.1. |
| Attack the Premise | yes | `skills/pstack/principles/attack-the-premise.md` | keep | Imported at T2.1. |
| Subtract Before You Add | yes | `skills/pstack/principles/subtract-before-you-add.md` | keep | Imported at T2.1. |
| Minimize Reader Load | yes | `skills/pstack/principles/minimize-reader-load.md` | keep | Imported at T2.1. |
| Outcome-Oriented Execution | yes | `skills/pstack/principles/outcome-oriented-execution.md` | keep | Imported at T2.1. |
| Experience First | yes | `skills/pstack/principles/experience-first.md` | keep | Imported at T2.1. |
| Exhaust the Design Space | yes | `skills/pstack/principles/exhaust-the-design-space.md` | keep | Imported at T2.1. |
| Build the Lever | yes | `skills/pstack/principles/build-the-lever.md` | keep | Imported at T2.1. |
| Model the Domain | yes | `skills/pstack/principles/model-the-domain.md` | keep | Imported at T2.1. |
| Boundary Discipline | yes | `skills/pstack/principles/boundary-discipline.md` | keep | Imported at T2.1. |
| Type System Discipline | yes | `skills/pstack/principles/type-system-discipline.md` | keep | Imported at T2.1. |
| Make Operations Idempotent | yes | `skills/pstack/principles/make-operations-idempotent.md` | keep | Imported at T2.1. |
| Migrate Callers Then Delete Legacy APIs | yes | `skills/pstack/principles/migrate-callers-then-delete-legacy-apis.md` | keep | Imported at T2.1. |
| Separate Before Serializing Shared State | yes | `skills/pstack/principles/separate-before-serializing-shared-state.md` | keep | Imported at T2.1. |
| Prove It Works | yes | `skills/pstack/principles/prove-it-works.md` | keep | Imported at T2.1. |
| Fix Root Causes | yes | `skills/pstack/principles/fix-root-causes.md` | keep | Imported at T2.1. |
| Sequence Work into Verifiable Units | yes | `skills/pstack/principles/sequence-verifiable-units.md` | keep | Imported at T2.1. |
| Test Behavior, Not Implementation | yes | `skills/pstack/principles/test-behavior-not-implementation.md` | keep | Imported at T2.1. |
| Guard the Context Window | yes | `skills/pstack/principles/guard-context-window.md` | keep | Imported at T2.1 with the existing OMP filename. |
| Never Block on the Human | yes | `skills/pstack/principles/never-block-on-the-human.md` | keep | Imported at T2.1. |
| Encode Lessons in Structure | yes | `skills/pstack/principles/encode-lessons-in-structure.md` | keep | Imported at T2.1. |

## Autonomy, delegation, and reply style

| Upstream rule / paragraph | In ompstack? | Location | Action | Reason |
|---|---|---|---|---|
| Just do it for reversible work, including external actions | partial | `skills/pstack/SKILL.md`, Respect reversibility and Classify before asking | adapt | OMP proceeds on local reversible work; external/irreversible boundaries remain explicit. |
| Always pause for force-push, deploy, data deletion, and customer messages | yes | `skills/pstack/SKILL.md`, Classify before asking | import | Expanded with secrets and other irreversible boundaries. |
| Session overrides keep autonomous work moving | yes | `skills/pstack/SKILL.md`, Classify before asking | import | User autonomy grants cover reversible decisions without confirmation turns. |
| No is an acceptable answer; candor over sycophancy | partial | `skills/pstack-unslop/SKILL.md`, Reply and comment style | adapt | Plain, evidence-first replies are retained; the exact conversational slogan is not needed. |
| Use `poteto-agent` for every subagent | no | none | drop | OMP routes by named pstack agent contracts and each routed operator owns its agent choice. |
| Background Task defaults, model defaults, and file-pointer context | partial | `skills/pstack/SKILL.md`, Delegation defaults; `docs/model-routing.md` | adapt | OMP task calls and role aliases replace Cursor Task defaults. Hardest work maps to `@pstack_reason`; no provider slug is written. |
| Coordinator owns every worker result and must review artifacts | yes | `skills/pstack/SKILL.md`, Bound delegation and Agent topology | keep | Existing OMP contract. |
| Short declarative reply, no long dash, no mid-sentence colon | yes | `skills/pstack/SKILL.md`, Reply and comment style; `skills/pstack-unslop` | import | OMP-native wording rule. |
| Terse but complete, with tradeoffs and open decisions | yes | `skills/pstack/SKILL.md`, Reply and comment style | import | Required for playbook-complete replies. |
| Frame consumer and maintainer impact | yes | `skills/pstack/SKILL.md`, Reply and comment style | import | Concrete audience rule. |
| Never fabricate links/citations/transcripts | yes | `skills/pstack/SKILL.md`, Reply and comment style | import | Matches evidence contract. |
| Evidence or inference label travels with each claim | yes | `skills/pstack/SKILL.md`, Reply and comment style | import | Matches pstack evidence discipline. |
| PR links use a GitHub URL template | no | none | drop | No PR exists in this local implementation task. |
| Comments keep only non-obvious why and avoid phase narration | yes | `skills/pstack/SKILL.md`, Reply and comment style | import | Adapted without Cursor-specific tooling. |

## Playbook routing rules

| Upstream rule / paragraph | In ompstack? | Location | Action | Reason |
|---|---|---|---|---|
| Copy matched playbook steps into the TODO before task-specific todos | yes | `skills/pstack/SKILL.md`, Playbook sequencing | keep | Existing OMP workflow already requires this. |
| Keep skipped steps visible with a reason | yes | `skills/pstack/SKILL.md`, Playbook sequencing | keep | Existing evidence contract. |
| Route large cross-cutting work to a bespoke figure-it-out skill | no | none | defer | Target skill is not present at T2.7; `pstack-multi-phase` is the current OMP equivalent. |
| Investigation | yes | `skills/pstack/playbooks/investigation.md` | keep | OMP playbook. |
| Bug fix | yes | `skills/pstack/playbooks/bug-fix.md` | keep | OMP playbook. |
| Perf issue | partial | `skills/pstack/playbooks/performance.md` | adapt | OMP names the category performance. |
| Hillclimb | no | none | defer | Phase 4 map target, not imported yet. |
| Runtime forensics | no | none | defer | Phase 4 map target, not imported yet. |
| Trace forensics | no | none | defer | Phase 4 map target, not imported yet. |
| Feature | yes | `skills/pstack/playbooks/feature.md` | keep | OMP playbook. |
| Refactoring | partial | `skills/pstack/playbooks/refactor.md` | adapt | OMP uses the singular refactor filename. |
| Prototype | partial | `skills/pstack/playbooks/empirical-prototype.md` | adapt | OMP prototype is empirical and evidence-bound. |
| Visual parity | no | none | defer | Phase 4 map target, not imported yet. |
| Authoring a skill | no | none | defer | Phase 3 map target, not imported yet. |
| Eval | no | none | defer | Phase 4 map target, not imported yet. |
| Babysit | no | none | defer | Phase 4 map target, not imported yet. |
| Shipping | yes | `skills/pstack/playbooks/shipping.md` | keep | OMP shipping playbook. |
| Autonomous run | no | none | defer | Phase 4 map target, not imported yet. |
| Orchestrate | no | none | defer | Phase 4 map target, not imported yet. |
| Autopilot full | no | none | defer | Phase 4 map target, not imported yet. |
| Autopilot stack | no | none | defer | Phase 4 map target, not imported yet. |
| Session pickup | partial | `skills/pstack/operators/session-pickup.md` | adapt | OMP has an operator, not the upstream playbook yet. |
| Pause safely | no | none | defer | Phase 4 map target, not imported yet. |
| Multi-phase or multi-PR plan | yes | `skills/pstack/playbooks/multi-phase.md` | adapt | OMP's multi-phase playbook covers the live-session contract. |
| Worktree and simulator cleanup | no | none | drop | No matching OMP product surface in this repository. |
| Opening a PR | no | none | defer | Shipping remains the current local boundary; no forward link is emitted. |

## Prototype comparison

| Upstream prototype rule / paragraph | In ompstack? | Location | Action | Reason |
|---|---|---|---|---|
| Prototype owns the design decision, not production code | yes | `skills/pstack/playbooks/empirical-prototype.md`, When to use / Clean up | keep | Local playbook makes the disposable evidence boundary explicit. |
| Laziness and verification invert for a throwaway prototype | partial | `skills/pstack/playbooks/empirical-prototype.md`, Build disposable prototypes | adapt | OMP retains disposable scope and evidence while still requiring a safe transition. |
| Scope the exact decision before building; no decision means no prototype | yes | Procedure 1, State the fork | keep | Same observable-fork contract. |
| Gather references and moodboard when design space is open | partial | Procedure 1 and 2 | adapt | OMP can ground references but does not require a Cursor control-skill moodboard. |
| Build in an isolated scratch directory with the lightest stack | yes | Procedure 3, Build disposable prototypes | keep | OMP requires isolated variants/scripts and captured environment. |
| Compare variants behind one switcher | partial | Procedure 3 and 4 | adapt | One switcher is useful for visual variants; behavioral prototypes may use one script and separate labeled runs. |
| Verify on the matching surface; observation is the test | yes | Procedure 4, Observe | keep | Runtime observation remains the factual decision rule. |
| Present alternatives, tradeoffs, recommendation, and scratch path | yes | Procedure 5, Decide and Procedure 6 | keep | Local playbook records the decision, limitations, transition, and cleanup. |

## Cutover result

`skills/pstack/SKILL.md` keeps the existing OMP state, gate, fingerprint, agent, and verification contract. The imported behavior is loaded on demand through the compatibility sections above. `src/policy.ts` was not expanded. Deferred rows remain in this document and in the upstream map so later skill imports can replace them without inventing forward links.
