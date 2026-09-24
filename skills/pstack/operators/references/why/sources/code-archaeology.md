# Code Archaeology (git + in-repo)

## What this source contains

- Commit history (messages, dates, authors, diffs)
- PR descriptions, review comments, and discussion threads (via the configured GitHub client)
- Inline code comments, TODOs, FIXMEs, deprecation notes
- ADRs (architectural decision records) if the repo keeps them
- Tests. Names and assertions often encode the edge cases that motivated a change
- Related files modified in the same commits (co-change signal)
- CHANGELOG entries and release notes in the repo
- Issue/ticket IDs mentioned in commit messages and PR bodies

The most trustworthy source, tied directly to the code, and the most complete. Everything that went through the repo should be here.

## How to search it

Expand the seed commit list from the parent code anchor:

```bash
# Full history of the file through renames
git log --follow --oneline -- <file>

# Pickaxe: commits that added or removed this exact text
git log -S '<exact_string_from_code>' -- <file>

# Or for patterns
git log -G '<regex>' -- <file>

# Who wrote each line and when
git blame -L <start>,<end> <file>

# The full diff of a specific commit
git show <hash>

# Commits between two points affecting this file
git log <old>..<new> -p -- <file>
```

For each substantive commit, pull the PR context from the configured GitHub client:

```bash
git log -1 --format=%B <hash>
gh pr view <number> --json title,body,author,createdAt,mergedAt,labels,closingIssuesReferences,comments,reviews,files
```

Look for out-of-band docs and related tests with the OMP `grep` and `glob` tools:

- search ADR directories and Markdown files for architecture decisions;
- search TODOs, FIXMEs, HACKs, and notes near the target;
- locate tests that mention the target symbol.

## What good evidence looks like here

- A PR description that explains the problem being solved, not just the change
- A long review thread where alternatives were debated
- An inline comment near the target line that explains a non-obvious constraint
- A test named `test_handles_edge_case_when_X` that reveals an edge case motivating a change
- A commit message that references a ticket or incident ID
- A CHANGELOG entry that summarizes the user-visible rationale

## Common pitfalls

- **Squash-merge flatlands.** If the repo squashes PRs, individual branch commits are lost. Fall back to PR body and comments.
- **Misleading commit messages.** "Small refactor" sometimes hides an intentional behavior change. Look at the diff, not the message.
- **Cargo-culted patterns.** The author may have copied a pattern without understanding why. Check whether it originated earlier and investigate that commit.
- **Bot commits and auto-merges.** Automated backports usually don't carry motivation. Skip them when trying to find intent.
- **Treating code as evidence of intent.** Evidence comes from commit messages, PRs, comments, tests, and docs. Don't cite a function name as intent.

## What to return

Every commit/PR/comment that bears on the question, with:
- the exact text (quoted);
- the hash / PR number / file:line;
- author and date;
- whether it is direct (explicitly addresses the question) or circumstantial.
