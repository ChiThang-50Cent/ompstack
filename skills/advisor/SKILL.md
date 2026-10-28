---
name: advisor
description: Consult a read-only model from a different family before implementing a substantial task, or when the user explicitly asks for an independent technical opinion.
---

# Advisor

Consult one independent advisor before implementing a substantial task. A substantial task involves a consequential design choice, multiple components, or a significant change to data, security, or a public contract. Do not consult for routine edits, evidence-only questions, or a decision that can be settled by a quick check. An explicit request for an advisor also invokes this workflow.

## Select a different family

Identify the main session's actual model. An explicitly selected session model takes precedence over the configured default. Read `cfg://modelRoles` to inspect the `advisor`, `slow`, and `task` roles. Compare model families, not provider prefixes: for example, GPT and Claude differ, while GPT models from different providers do not. Select a role whose configured model family differs from the main model. Prefer `advisor-role` for `@advisor`, then `advisor-slow` for `@slow`, then `advisor-task` for `@task`. If a role is unset or its family cannot be identified, do not assume it differs.

Model overrides and provider fallbacks can change the model actually used. Inspect the task result's resolved model metadata or the advisor session's runtime metadata after it runs. Accept the advice as a cross-family consultation only if the actual advisor and main model families are both known and different. Do not infer the actual model from the role or from the advisor's self-report. If model identity is unavailable, the roles match, or the advisor fails, report that the consultation could not be verified. Do not claim an independent review or silently substitute the main model. Continue the user's task unless the user explicitly requires a successful consultation before proceeding.

## Consult

First inspect the relevant code and prepare a concrete approach. Before making implementation changes, spawn the selected advisor with the `task` tool. Set the task item `agent` to the selected profile. Do not pass a model override. Give the advisor:

- The user's request and later constraints.
- Relevant paths, evidence, and facts already verified. Redact secrets.
- The proposed approach, material alternatives, and specific questions.
- An instruction to review only, not edit files, run state-changing commands, or spawn agents.

Wait for the result before implementing. Ask for concrete risks, missing requirements, a simpler alternative if warranted, and a recommendation. The main agent checks material claims against the repository and retains the final decision. Report the advisor's model, verdict, and any material disagreement. Do not treat agreement as proof.

## Follow-up and cache

Keep the advisor's agent ID for this task. When clarification or new evidence materially affects the decision, send a follow-up to the same agent with `write agent://<id>` if the runtime permits it. Send only the new question and changed evidence; do not repeat the initial brief or unchanged files. The advisor retains its previous context. Check that its model still satisfies the different-family requirement if the runtime reports a change.

Reuse can improve provider prompt-cache reuse but does not guarantee a cache hit or lower cost. Do not claim measured savings without usage evidence. Do not continue a discussion solely to reach agreement. If the agent cannot be resumed, report it; a fresh consultation must pass the same model-identity check. Use a fresh advisor for a different task.
