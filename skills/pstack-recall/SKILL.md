---
name: pstack-recall
description: Reconstruct recent working context from OMP session transcripts, live state, and shared evidence, then return a tight current-state brief.
disable-model-invocation: true
---

# Recall

Before starting or resuming work, rebuild the user's recent working context and return a compact capsule of where things stand and what to do next. Keep it tight and on topic. Read only the in-scope threads, then stop.

## Scope and sources

Pin the workspace, topic, and time window before searching. “Recent” is a real range. Default it to the last seven days. “All” is not silently reduced to a recent range. Use the active current working directory by default and never read another project's transcript bucket without explicit authority.

The primary transcript source is:

```text
<agentDir>/sessions/<encoded-cwd>/*.jsonl
```

Resolve `<agentDir>` from the active OMP profile and `PI_CODING_AGENT_DIR` rules in `docs/session.md`. Read only the current-cwd bucket. Each JSONL line is one session entry. File modification time orders sessions. The bucket name is not a session id. Read `docs/session.md` before constructing it, and do not guess a path from a workspace slug.

The shared record contains what happened around the same code under other names. When the topic names a feature, file, subsystem, area, or bug, sweep the relevant repository history, issue records, long-form docs, and error evidence through the available parent tools. Use `skill://pstack/operators/why.md` for the source categories and record unavailable sources as gaps. Skip the shared sweep only for pure activity recall with no named target, such as “what did I do this week?”.

If the operator supplied a complete state capsule with paths, branch, and the change, use it and skip transcript mining. A human-readable summary of known work is not transcript recall.

## Procedure

1. **Classify and route.** A specific prior chat to resume is a session-pickup task, not recall. Turning habits into a durable skill is a separate automation task, not recall. Recall reconstructs working context across recent sessions before action.
2. **Lock scope.** State the workspace, named topic, and time range. Keep the current chat out of the search. Skip obvious noise such as child-agent, evaluation, and test-only sessions unless the topic is specifically about one.
3. **Mine transcripts.** For one or two candidate sessions, read them directly. For a larger set, use one OMP `task` batch of read-only `pstack-scout` items, with one disjoint transcript slice per item. Each item reads only matching sessions and relevant regions. Each returns the same schema, one block per session:

   - topic;
   - user's goal;
   - decisions;
   - open threads;
   - struggles and corrections;
   - artifacts such as commits, tickets, branches, and paths;
   - the session filename as its citation.

   The scouts never edit files and return findings only. Keep raw transcripts out of the parent context.
4. **Sweep shared evidence.** When the topic has a named target, gather current state, failed attempts, reverted fixes, and user-reported symptoms from the available sources in parallel with transcript mining. One investigation item owns each source slice. Null results are findings. Do not invent an unavailable MCP, issue, or chat permalink.
5. **Verify live state.** Check surfaced branches, commits, tickets, and files with the parent `read` and safe diagnostic tools. If a claim depends on what an agent actually ran, open the full cited transcript rather than trusting a clipped summary. Separate facts, supported inferences, and unknowns.
6. **Write the brief.** Lead with the capsule, then thread status, problems, and one next move. Run the result through `skill://pstack-unslop` and cite only paths, session files, evidence IDs, commits, or shared records actually read in this run.

## Output contract

Lead with the capsule, then the thread status, then the problems, then the next move. Deeper detail goes below or gets cut.

- **Capsule.** At most five bullets. State what this work is and where it stands overall.
- **Threads.** One line each, prefixed with exactly one status tag: `[merged #N]`, `[open PR #N]`, `[in flight <branch>]`, `[verified, uncommitted]`, `[reverted #N]`, or `[planned, not started]`. A thread without a tag is not done.
- **Problems.** At most five recurring problems. Include user-reported symptoms and fixes that shipped and were reverted, so the next attempt starts where the last one failed.
- **Next move.** The single most useful concrete next action.

Keep adjacent features or tickets out unless they block the named topic. When the capsule and thread lines outgrow a screen, cut detail before cutting threads. Sanitize private context before public output. Use `[INFERENCE]` for conclusions not directly observed.

## Native OMP recall is different

Native OMP `recall` in `docs/tools/recall.md` queries Hindsight or Mnemopi long-term memory with one query and returns memory-hit previews. It does not reconstruct raw session transcripts or produce this status brief. Use native recall for durable memory retrieval. Use this skill for current-cwd session history, live-state reconciliation, and an actionable continuation capsule.

**Reply:** the brief, using the contract above.
