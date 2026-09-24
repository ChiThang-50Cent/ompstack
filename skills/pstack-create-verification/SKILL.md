---
name: pstack-create-verification
description: Create or repair a project-local verification skill that teaches pstack how to start the product, seed state, drive real surfaces, capture evidence, and clean up.
disable-model-invocation: true
---

# Create a project verification skill

Every serious project needs a scripted way to drive the real product and prove behavior. Launch it, exercise a feature the way a user does, and capture evidence. Create the operational contract for the next agent, not a slogan for a human. The next agent may read it cold and mid-task without knowing the project.

## 1. Interview the repository, not the user

Answer these questions from the codebase. Ask the user only for facts that the repository and runtime cannot expose:

- **Surface:** What does a user actually touch? A web UI, CLI, TUI, desktop app, API, mobile app, or library? A repository can have several. Pick the primary surface and note the rest.
- **Run:** How does the product start locally? Prefer the documented development command, package scripts, Makefile, README quickstart, or CI command. Note ports, environment variables, seed data, and authentication.
- **Drive:** How can an agent interact with it programmatically? Check existing harnesses first, including Playwright or Cypress specs, expect scripts, PTY helpers, curl-able endpoints, and debug ports. Then choose a generic recipe: OMP Eval browser or desktop preludes for web and desktop, a PTY harness for CLI and TUI, or plain HTTP for services.
- **Observe:** What evidence can be captured? Screenshots, terminal transcripts, response bodies, logs, exit codes, database state, traces, or generated files.
- **Isolate:** Can two instances run side by side with separate ports, data directories, or profiles? If not, say so in the generated skill. Refusing to double-drive a shared instance is safer than corrupting the operator's session.

If the checkout does not build or start as-is, fix that first or report the exact blocker before generating. A skill written against a broken base teaches wrong steps. If an irrelevant missing asset blocks startup, the generated skill may create it as verification scaffolding, clearly mark it, and remove it during cleanup.

## 2. Generate the project skill

Write `.omp/skills/verify-<project>/SKILL.md` with YAML frontmatter. Set `name: verify-<project>` and a description that names the project, the surface, and when to use the skill. Without frontmatter the skill does not register.

Include these sections, each grounded in the interview. Leave no placeholders:

- **Launch:** the exact command that starts the product for verification, the readiness signal, logs, and teardown. For a short-lived CLI or TUI, build once and start each drive in an isolated PTY or terminal session.
- **Doctor:** one read-only check that answers whether the instance is worth driving. Check that the process is up, the expected version or build is running, the port is owned by this run, and authentication is valid. Run it first when anything looks wrong.
- **Drive:** the real harness recipe with stable selectors, commands, endpoints, or prompt strings from this repository. Prefer accessible names, data attributes, route paths, CLI commands, and API contracts over coordinates or tab order.
- **Evidence:** what to capture and where. Exercise the real user path, not internal setters or test-only endpoints. Capture the action and resulting state, not only the final screen. Verify side effects such as files, rows, messages, or jobs alongside visible output. Use mocks only where a production boundary already isolates the external system. If a dry-run or test mode is the safe path, observe what it skips instead of trusting its name.
- **Cleanup:** tear down only instances created by this run. Never kill by process name. Remove scratch state and fixtures, never proof artifacts. Name the location where proof survives.
- **Helpers:** every shipped helper is executable and its invocation appears in the skill body. Do not make the reader reverse-engineer a helper.

## 3. Seed the feature map

Create `.omp/skills/verify-<project>/features/README.md` and one Markdown file per user-facing feature you can identify. Start with the top three to five features from routes, commands, menus, or documentation. Follow the checked-in examples in `skills/pstack-create-verification/references/feature-map-example/`.

Use this exact layout:

```text
features/
  README.md
  <slug>.md
```

The index has one line per feature:

```markdown
- [<slug>](<slug>.md) — <one-line summary>
```

Each feature file has YAML frontmatter with these required keys:

```yaml
---
feature: Create note
slug: create-note
surface: ui
reach:
  - Open the app
handles:
  - "[data-testid=new-note]"
states:
  - "Editor focused with empty title"
last_verified: 2026-09-24
---
```

`feature` is the human name. `slug` equals the filename without `.md`. `surface` is `ui`, `cli`, `api`, or `tui`. `reach` lists ordered steps from a fresh start. `handles` lists automation handles such as selectors, commands, or endpoints. `states` lists observable states a verifier can assert. `last_verified` is optional and uses an ISO date.

The body is free prose for edge cases, fixtures, known flakiness, and proof details. Keep the user point of view. The feature map is the maintained verification source. A proof that drives one convenient entry point is incomplete when the map lists other entry points.

## 4. Prove the generated skill before handing it over

Run the instructions end to end once. Launch the product, run the doctor, drive one mapped feature, capture evidence, and clean up. One feature is enough for this first proof because the map lets later runs cover the rest. After cleanup, confirm that the named evidence still exists. A cleanup that eats the proof fails this step.

Fix every failure and run cleanup after every failed iteration so broken attempts do not strand processes, ports, or fixtures. A generated skill that was never executed is a draft, not a deliverable. Record the representative path, failure path, evidence references, and any unavailable surface with parent-owned `pstack_evidence`.

## 5. Maintenance

When the product changes, update the project skill and its `features/` map together. Re-run the project validator and at least one representative mapped path. Keep unreachable entry points explicit instead of claiming coverage through a different path.

## Verification map conventions

- Read the feature index before driving the product, then use the matching feature file as the recipe.
- Start every recipe from its documented baseline unless its preconditions say otherwise.
- Prefer accessible names and stable handles over DOM position or coordinates.
- Treat commands and flags as literal. Keep quoted names and flags unchanged.
- Capture the user action and resulting state, not only the final screen.
- Record the feature ID and entry point with every artifact.
- Report an unreachable path with the attempted command and unmet precondition.
- Do not report a skipped entry point as verified through another path.
