# Incident & Postmortem Context

Not a separate source, a **cross-cutting angle**. Incidents often motivate defensive code ("we added this check after the X outage"), so if the target looks defensive (null checks, retry logic, timeout handling, rate limiting, feature flags), specifically hunt for incident history across every available source:

- **Long-form documents**: search postmortems mentioning the target file, feature, or error string
- **Issue tracker**: look for tickets labeled `incident`, `sev-*`, `postmortem-action-item`, or `reliability`
- **Team chat**: search incident and severity channels around the dates the target code was added
- **Repository history**: commits with messages like "fix for incident", "add defensive check", or "revert" followed by "re-apply with..." are strong signals
- **Infrastructure observability**: search formal incident records with timelines, dashboards, and monitors created as postmortem action items
- **Error tracking**: search issues whose first-seen/last-seen window aligns with the target change date, including stack traces through the target
- **Product analytics**: error-classifying events and user-visible retry events may spike during an incident; a drop after the change is circumstantial support

If you find an incident link, fetch the full postmortem. Postmortems typically have an "Action Items" section that ties directly to code changes. When multiple sources corroborate (an incident appears in an issue, a postmortem, a chat thread, and a target PR, with the error-event count dropping afterward), the evidence is especially strong.

If a source is unavailable in the parent session, report that as a gap rather than substituting a guess. Skip this angle for code that does not look defensive, and record why it was skipped.
