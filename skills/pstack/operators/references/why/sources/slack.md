# Slack Conversations

## What this source contains

- Real-time discussions of problems and decisions
- Incident channels where fire-drill decisions were made
- Design discussion threads where tradeoffs were debated
- Questions answered by senior engineers that didn't make it into docs
- Post-merge discussions that explain why something was revisited
- DMs (usually not searchable, scope accordingly)

Slack is frequently where the *real* decisions got made, especially for smaller changes that didn't warrant a doc. It is also the most ephemeral source. Threads get deleted, channels get archived, and search quality degrades over time.

## How to search it

Slack MCP tools vary. The parent must inspect which Slack-compatible MCP is available and inspect its tool schema first. Authentication failure is an explicit gap.

1. **Author-bounded search.** Messages from the PR author around the PR merge date often hit the strongest signal.
2. **Keyword search for the feature name and key symbols.** Include misspellings and casual phrasings.
3. **PR URL search.** Slack often links PRs when they are reviewed or discussed. Search for the PR URL or just `/pull/<number>`.
4. **Error string search.** If the code handles a specific error, search for the error string; incident threads often surface.
5. **Channel-scoped search.** Narrow to likely channels:
   - engineering channels;
   - project channels;
   - incident and severity channels;
   - team-specific channels;
   - design review channels.
6. **Thread traversal.** When a relevant message appears, fetch the whole thread. The decision often lives in replies.

## What good evidence looks like

- A thread where tradeoffs were explicitly debated ("I was going to use A but B is better because...")
- An incident channel message describing the bug the code prevents
- A question from a reviewer and an authoritative answer from the author or lead
- A reference to a meeting where a decision was made
- A message from a product manager or customer-facing engineer explaining a customer ask

## Common pitfalls

- **Channel archaeology limits.** Very old messages may be gone due to retention policies. If nothing exists before a date, note the retention cliff.
- **Unsearched DMs.** Many decisions happen in DMs that are not searchable. This is a known limitation.
- **Speculative jokes as decisions.** Casual statements are not a decision, even if they preceded the commit. Look for considered discussion.
- **Context collapse in single messages.** Without the thread, a message often reads differently in context. Always fetch threads.
- **Auth failures.** If the MCP is not authenticated, stop and report the gap. Do not make up findings.

## What to return

For each relevant thread:
- Channel name
- Permalink or thread ID
- Participants
- Date range of the discussion
- The key quotes (verbatim) with attribution
- Context: what thread, incident, or design discussion this was part of
