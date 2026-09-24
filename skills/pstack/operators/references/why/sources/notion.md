# Notion Docs

## What this source contains

- PRDs (product requirement documents)
- Technical specs and RFCs
- Architectural decision records (ADRs)
- Meeting notes from design reviews
- Team pages with domain context
- Postmortems from incidents
- Runbooks that may explain defensive code
- Strategy documents that set priorities

Notion is where "why" often lives in long-form before it becomes code. A significant feature usually has a doc.

## How to search it

Use the Notion MCP tools exposed to the parent session.

1. **Keyword searches.** Try the feature name, key symbols or class names, author handles, error strings or user-visible terms, and time-bounded variants if the ship date is known.
2. **Fetch candidate pages.** Read the full content, not the preview. Rationale is often buried mid-document.
3. **Follow backlinks and child pages.** Design docs often have sub-pages for alternatives considered, appendices, or implementation notes.
4. **Check related databases.** Query meeting notes and data sources to surface discussions that mention the decision.
5. **Search author-specific spaces.** If the PR author has a personal notebook, it may contain exploratory thinking that preceded the code.

## What good evidence looks like

- A PRD with a "Problem statement" or "Motivation" section that matches the target code's purpose
- An "Alternatives considered" or "Rejected approaches" section
- A postmortem that names the target code as the fix for a specific incident
- Meeting notes that record "we decided X because Y" and tie to the same author/date range as the PR
- An ADR template filled out non-trivially (status, context, decision, consequences)

## Common pitfalls

- **Outdated docs.** Specs are often written before implementation and not updated. The doc may describe a plan that changed. Cross-check against the actual PR.
- **Doc vs. reality drift.** A spec may say "we'll do X" but the code actually does Y. Flag the divergence for synthesis.
- **Boilerplate templates.** Some organizations require a Why section that gets filled with fluff. Look for specificity.
- **Unlinked docs.** The most relevant doc may not be linked from anywhere. Broad keyword searches help.
- **Multiple drafts.** Find the finalized or most recently updated version. Check dates.
- **Access-restricted pages.** Note inaccessible pages as a gap.

## What to return

For each relevant doc:
- Title and URL
- Authors and last-updated date
- The motivation text (verbatim quote), with page/section location
- Relevant linked pages (so the synthesizer can cite them)
- Whether the doc was finalized or draft
