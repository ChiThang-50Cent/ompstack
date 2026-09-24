# Datadog Telemetry

## What this source contains

Datadog holds the runtime record, what actually happened in production, as opposed to what was planned or discussed.

- **Metrics.** Counters, gauges, histograms instrumented by the team. A metric's *presence* is itself evidence. Someone thought this number worth watching.
- **Monitors & alerts.** Conditions the team decided warranted waking someone up. A monitor firing on `rate_limit_hit > 10/min` is direct evidence the team worried about that threshold.
- **Dashboards.** Curated views. The charts tell you what the team considers important for a subsystem.
- **APM traces & spans.** Request-level runtime data. Useful for "why is this slow" / "why is there a timeout here" questions.
- **Logs.** High-volume event records. Often contain the error conditions that motivated defensive code.
- **Incidents.** Formal incident records with timelines and linked postmortems.
- **Notebooks.** Exploratory investigations. Often contain hypotheses and analyses.

Datadog answers "what was the production reality around the time this code was written?", which often explains the code's shape.

## How to search it

Use the Datadog MCP tools exposed to the parent session. Start broad, then narrow.

1. **Identify the owning service(s).** Search services and dependencies by name or team.
2. **Dashboards and monitors first. They tell you what the team cares about.** When a dashboard or monitor covers the target, note its queries and watched thresholds. The threshold is frequently the answer to "why is this clamped at N?"
3. **Metrics around the target.** Search by name pattern, read metric context (description, units, tags), and inspect the time series around the PR date. Correlation can support a claim that a metric spiked before a change and stabilized after it.
4. **Logs. Narrow, don't dump.** Search with symbols, error strings, or feature names, set log-pattern mode when available, and use a bounded time window. Aggregate rather than dumping raw logs.
5. **APM spans and traces.** Aggregate failures or latency, inspect representative spans, and retrieve a trace when the target concerns timeouts, retries, slow paths, or cross-service behavior.
6. **Incidents.** Search by title, team, and date range. If the target looks defensive, search around the date it was added. An incident whose timeline includes "added defensive check for X" is near-direct evidence.

## What good evidence looks like here

- A monitor whose query and threshold match the constraint the code enforces (code clamps to 100, monitor alerts when requests exceed 100/min)
- A dashboard created by the target's author, with widgets that correspond to what the code measures or guards against
- A metric showing a production spike immediately before the code was merged, and stable values after
- An incident record referencing the target code, the same symbols, or the same error strings
- Logs showing a specific error pattern the defensive code would prevent, timestamped in the window before the change

## Common pitfalls

- **Correlation is not causation.** A spike before a PR and stabilization after is suggestive, not definitive. Other changes may have landed in the same window. Check neighboring changes.
- **Overfitting to the chart you found.** Datadog visualizations are *made* by humans and reflect that human's framing. A chart named "retry success rate" is evidence the team cared about retry success, not that it's why a specific line exists.
- **Vanished telemetry.** Metrics can be renamed, deleted, or have short retention. If you can't find data from the relevant window, that's a gap, not a null result.
- **Noise at scale.** Searching logs for a common string returns thousands of matches. Narrow by service, tag, and time aggressively. Aggregate rather than dumping raw logs.
- **Instrumented != caused.** A metric's existence tells you someone cared enough to measure something, not that the code was added *because* of it. Cross-reference with commit/PR dates.

## What to return

For each relevant item:
- Type (dashboard / monitor / metric / log pattern / trace / incident / notebook)
- Title or name
- Link or identifier (dashboard ID, monitor ID, metric name, incident ID)
- Owner/author and created/modified date
- The specific condition, query, or quote that bears on the question (verbatim where possible)
- Relevance: what this suggests about the target code, and how strong the connection is
