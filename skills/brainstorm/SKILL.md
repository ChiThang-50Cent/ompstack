---
name: brainstorm
description: Clarify an early idea, challenge it with two independent read-only reviewers, and record a decision brief before design or implementation. Use for /skill:brainstorm or an explicit request to explore an uncertain concept.
disable-model-invocation: true
---

# Brainstorm an idea

Help the user decide whether an idea solves a problem worth solving. Finish with a self-contained brief, not code or an implementation plan. This skill works without poteto-mode.

## Keep the phase bounded

The main session owns the conversation, repository observations, reviewer dispatch, synthesis, and all artifact writes. Reviewers return findings only.

Use read-only observation to establish repository facts. Do not change product code, create executable stubs, install dependencies, run prototypes, commit, or open a PR. Do not disguise an experiment as clarification. Write only concept briefs during this phase.

Do not force this workflow onto a clear implementation request, an evidence-only investigation, or one missing product decision. Answer the narrower request instead. If the user explicitly invokes brainstorm, respect that phase even when an implementation seems obvious.

## Clarify the problem

Start with the user's idea and original intent. Note whether they want discussion only or eventual design or implementation. Read relevant project instructions and inspect the repository yourself with `read`, `grep`, and `glob`. Do not ask the user for facts that the repository can answer.

Build a working hypothesis from these subjects as they become relevant:

- The problem, affected users, and current workaround.
- The desired outcome and why the current workaround is insufficient.
- Goals, non-goals, and constraints.
- Evidence that would demonstrate success.
- Assumptions, existing evidence, and unresolved choices.

Ask open questions about unresolved goals and preferences. Choose questions that can change the concept. There is no required number of questions or conversation turns. Do not turn the subjects above into a mandatory questionnaire. Mark unknowns rather than invent answers.

Keep chat to a short working hypothesis and focused questions. Do not start selecting modules, signatures, dependencies, or a file-by-file implementation plan. Compare possible outcomes and no-build alternatives at the concept level.

## Obtain readiness for review

Before dispatch, summarize the anchored hypothesis. State the problem, intended users, proposed outcome, key constraints, repository evidence with paths, and remaining assumptions. Explain that two independent reviewers will challenge the concept without implementing it.

Ask explicitly whether this version is ready for review. Reuse genuine prior explicit approval when it clearly authorizes this review of the same concept. Agreement that the idea sounds useful is not review approval. If the concept materially changes after approval, summarize the change and obtain renewed readiness before another review.

Do not dispatch reviewers until that readiness exists. Record its scope in the brief.

## Dispatch independent reviewers

Prepare one self-contained reviewer input. Include the current hypothesis, users, workaround, goals, non-goals, constraints, success evidence, known facts, unresolved assumptions, and evidence references. Include an explicit allowed repository reading list of files or bounded directories. Choose enough evidence for both reviewers to assess the concept. If no repository reading is relevant, state that the list is empty.

Give both reviewers exactly that input. Do not provide conversation transcripts, the author's private rationale, advocacy for the idea, or either reviewer's verdict. Include necessary constraints and decisions neutrally. Fresh context means no inherited conversation, not exemption from project instructions or system policy.

Use a single `task` call with two concurrent `tasks[]` entries. Select `brainstorm-a` for one entry and `brainstorm-b` for the other. Put the common input in shared `context` and give each entry the same assessment request. These installed profiles supply the two review perspectives and model roles. Do not hardcode providers or override their tool restrictions.

Each reviewer may use only `read`, `grep`, and `glob` over the allowed repository list and applicable project instructions. Neither reviewer may write artifacts, execute commands, spawn agents, inspect session history or memory, or communicate with the other reviewer. The main session does not relay findings between them.

If a profile or the task tool is unavailable, report the blocker. Do not replace the independent panel with a claimed review by the main session. If one seat fails, retain the completed findings and retry the failed seat with the same input in a fresh context. Do not claim both reviews completed until both return.

## Synthesize and iterate

Merge the findings yourself. Distinguish observed facts, user decisions, reviewer judgments, and unsupported assumptions. Preserve substantive disagreement instead of counting votes.

Present the top objections and the questions that could change the decision. For each material finding, record whether the user accepts the tradeoff, rejects the objection with evidence, changes the concept, or leaves the point unresolved. Do not manufacture acceptance from silence.

Use the conversation to revise the concept, reduce scope, choose a no-build alternative, or stop. Reviewers identify problems and questions, not fixes to implement. Do not demand deployment, migration, quotas, telemetry, or other infrastructure unless the concept makes those concerns relevant. Do not require implementation detail to approve a concept.

If another review would resolve a material uncertainty, obtain readiness for the revised concept and dispatch fresh reviewers. Do not carry earlier verdicts into their input.

## Record one brief per concept

Put the substantial brief in a file. Use the caller's chosen path, or choose `local://brainstorm-<slug>-<unique>.md` with a unique suffix. Check for an existing destination before creating it. Choose another name on collision. Update an existing file only when it is this concept's brief and the caller has identified it for revision. Never overwrite an unrelated artifact. Keep separate concepts in separate files.

Make the brief understandable without this conversation. Include:

- The concept and its current status, such as under discussion, revised, deferred, or ready for a separate design phase.
- The problem, users, and current workaround.
- Goals, non-goals, constraints, and success evidence.
- Observed facts with repository paths or other sources.
- Assumptions and how they could be resolved.
- Decisions and their reasons, including no-build alternatives considered.
- Review readiness, reviewer findings, and accepted or rejected tradeoffs with evidence.
- Risks, unanswered questions, and any missing review or evidence.
- The authorized stopping point and any proposed next phase.

Mark unknowns explicitly. Do not present the brief as an approved implementation specification. Link the brief in chat and summarize only the current conclusion, top objections, and unresolved choices. Do not add autobiographical principle lists.

## Stop or hand off explicitly

If the original intent was discussion only, stop at the brief. Approval to review and acceptance of the brief never authorize code.

Only an explicit user request permits a separate design or implementation phase. If the original request included implementation, restate the proposed handoff and obtain explicit transition approval before leaving brainstorm. Do not treat the original request as permission to skip this checkpoint.

For a design-only handoff, read `skill://pstack-omp` and `skill://architect`, and invoke architect with its explicit checkpoint. State that implementation is excluded. Architect implements by default, so never invoke it silently or without the design-only boundary. For implementation, carry the accepted brief and unresolved risks into the separately authorized workflow.
