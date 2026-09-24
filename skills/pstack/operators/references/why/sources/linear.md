# Linear Tickets

## What this source contains

- Issues describing features, bugs, and their motivation
- Project docs attached to issues (often PRDs or specs)
- Parent/sub-issue relationships (broader initiative → specific tickets)
- Comments on issues (clarifications, scope changes, "why we're doing this" rationale)
- Labels (e.g. `compliance`, `customer-request`, `perf`) that signal the type of motivation
- Status updates that explain scope changes
- Attachments and linked GitHub PRs

Linear is where product/business context often lives: the "we're doing this because customer X asked" or "this is for the Q3 compliance initiative" layer.

## How to search it

Use the Linear MCP tools exposed to the parent session.

1. **Start with linked tickets.** If seed commits or PRs reference ticket IDs (e.g. `ENG-1234`, `[BUG-567]`), fetch those first and read the full issue including comments.
2. **List related issues by keyword.** Search for the feature name, key symbol, or business term, and try multiple phrasings.
3. **Walk the issue tree.** If you land on a sub-issue, fetch its parent. Sub-issues are tactical; parents often carry the why.
4. **Read project docs.** If the issue belongs to a project, inspect attached documents. Project-level documents are where specs and rationale are often captured.
5. **Check labels and milestones.** Labels hint at motivation (customer request, incident follow-up, compliance, performance); milestones tie work to deadlines.

## What good evidence looks like here

- An issue description stating the business problem: "Customer Acme needs X because of their SOC2 audit"
- A comment recording a decision: "We decided to go with approach B because approach A would require touching the billing service"
- A parent issue titled like an initiative: "Q3 Enterprise Readiness" or "Reduce Payment Failures"
- An attached PRD or spec
- Labels like `customer:acme`, `incident-followup`, `compliance`, or `perf-regression`

## Common pitfalls

- **Scope drift.** The ticket the PR references may have been closed and reopened with a different scope. Read the whole history.
- **Mechanical templates.** Some teams require Why sections but fill them with boilerplate. Generic text such as "improve user experience" is probably not a real answer.
- **Stale tickets.** Old tickets often reflect a plan that changed. Check dates and cross-reference with the code's ship date.
- **Closed-as-duplicate chains.** Follow duplicate-of relationships back to the canonical ticket.
- **Private workspace content.** If you can't access an issue, note that as a gap rather than guessing.

## What to return

For each relevant ticket:
- Ticket ID and title
- The problem/motivation quoted from the description or comments (not paraphrased; the synthesizer needs exact text)
- Labels, parent issue, and project
- Author, created date, and closed date
- Link to the ticket if available
