# Performance issue workflow

Use this for a measured slowness or throughput regression. A live diagnosis without a requested fix belongs to Runtime forensics; a provided profile artifact belongs to Trace forensics.

## 1. Pin the measurement

Name the user-visible operation, workload, environment, metric, and acceptance threshold. Capture a baseline with the closest real surface: existing benchmark, profiler, browser trace, CLI timing, API load, or database measurement.

Do not infer a performance ceiling from source. If the baseline cannot be captured, report that limitation instead of claiming an improvement.

## 2. Form a measured hypothesis

Use the baseline artifact to identify the dominant cost. Prefer deleting avoidable work before adding caching, batching, indexing, parallelism, or scheduling. Name invalidation, ordering, load, and correctness trade-offs before changing the hot path.

Use `ompstack-architect` only when the optimization crosses a meaningful API, concurrency, or subsystem boundary.

## 3. Change one dominant cost

Make the smallest change that addresses the measured cost. Preserve the workload and metric. Do not combine unrelated optimizations; each accepted attempt needs its own before/after evidence.

## 4. Remeasure and verify

Capture the same measurement after the change. Compare baseline and post-change values, including variance or inconclusive results. Run the closest behavioral regression check so a speedup does not hide a semantic regression.

Use `ompstack-verifier` when independent measurement on the target surface is more valuable than static review.

## Reply

Report the baseline, post-change value, delta, workload, artifact paths, behavioral check, and any remaining trade-off or uncertainty.
