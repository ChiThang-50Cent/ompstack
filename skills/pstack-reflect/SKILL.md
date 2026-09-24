---
name: pstack-reflect
description: Mine the active OMP session transcript for durable learnings, review them through three independent panel lenses, and return proposed skill edits without applying them.
disable-model-invocation: true
---

# Reflect

Mine the current OMP session transcript for durable learnings, then route them into proposed skill edits. Do not auto-apply changes. Reflection is for patterns that survive the immediate task, not for a trivial or already well-covered conversation.

## When to invoke

Invoke when the operator says “reflect” or asks for durable learnings from the current work. Skip when the conversation is trivial, off topic, or the parent followed an existing skill correctly without discovering a reusable gap.

## 1. Locate the active transcript

The parent locates the active OMP transcript before creating the review batch. Use the active session path and the current-cwd session bucket documented in `docs/session.md`. Do not glob across all projects or read unrelated private chats. OMP transcripts are JSONL. If the path cannot be resolved, write a tight digest of the session and pass that digest to every reviewer.

## 2. Review in one panel batch

Launch exactly one OMP `task` batch with one item each for `pstack-reviewer-a`, `pstack-reviewer-b`, and `pstack-reviewer-c`. Give every item the same transcript path or digest, scope, and instructions. Use `schemaMode: "strict"`. The panel frontmatter supplies ordered OMP model-role candidates. Do not assign provider slugs or reviewer personalities. Reviewers use their independent contexts and panel role candidates.

Read the lens prompts at:

- `skill://pstack-reflect/references/judgment-reviewer.md`
- `skill://pstack-reflect/references/tooling-reviewer.md`
- `skill://pstack-reflect/references/divergent-reviewer.md`

The panel reviews only skills, tools, or MCPs that the transcript actually used or that clearly should have triggered. A reviewer must name the exact transcript evidence, durable principle, and routing. It returns the reviewer schema with its findings in the explanation or `findings[]`. It does not edit files, call parent-state pstack tools, or award the final verification verdict.

If all panel role candidates resolve to one model, report a single-model panel. Fresh contexts still provide review separation, but a single model is not model diversity.

## 3. Synthesize without applying

After all three results arrive, launch `pstack-synthesizer` in a separate task with the full reviewer outputs, transcript scope, and the synthesizer prompt at `skill://pstack-reflect/references/synthesizer.md`. The synthesizer may inspect cited artifacts but must not edit, write, or commit for this reflection. Its output is a proposed skill edit, a rejected finding list, and a backlog. The parent never applies the proposal automatically.

The synthesizer verifies citations, applies durability, specificity, existing-skill-first, convergence, decision-changing, structural-mechanism, skill-was-used, and already-covered criteria, and separates mechanism work into backlog. A reviewer finding is not a fact merely because two models repeat it.

## 4. Structural check and approval boundary

Review the synthesizer's accepted list. Move any item better enforced by a validator, lint rule, script, metadata field, or runtime gate to backlog. For every remaining accepted item, show the complete accepted, rejected, and backlog output to the operator. Wait for explicit approval before any edit. The operator may approve a subset or redirect a route.

If approved later, apply only the selected edits through the normal bounded implementation workflow. This skill itself never applies them. Keep a fresh artifact fingerprint before any implementation begins.

## Output

Return a short list:

- **Proposed edits:** skill path and one-line change for each accepted row.
- **New skills:** any approved new-skill proposal, which remains unapplied until a separate creation task.
- **Backlog:** durable patterns that belong in tooling, validation, or tracking.
- **Dropped:** each rejected finding with its reason.
- **Panel:** reviewer names, resolved role families when observable, finding counts, and whether the panel was single-model.

Cite only transcript paths, artifacts, evidence IDs, commands, and source files actually read in this run. Redact private context before public output. Run the result through `skill://pstack-unslop`.

## Native OMP reflect is different

Native OMP `reflect` in `docs/tools/reflect.md` queries the configured Hindsight or Mnemopi memory backend and returns a single memory synthesis or formatted recalled context. It does not inspect the active JSONL transcript through three reviewer contexts and does not propose edits to skills. Use native reflect for long-term memory synthesis. Use this skill for transcript-derived workflow learnings.
