---
name: pstack-trace-forensics
description: Diagnose a captured trace or profiling artifact by loading, reducing, querying, and attributing it to source without rerunning or fixing the system.
---

# Trace forensics playbook

Own diagnosis from the artifact. The capture already exists. Read the fixed dataset and do not re-run the workload. Keep tooling generic so the workflow works for CPU profiles, compressed JSON traces, spindumps, heap snapshots, and project-specific trace formats.

## Procedure

1. **Identify and load.** Name the artifact path and format. Choose the matching parser or developer tool. If the artifact is large, delegate a bounded read-only reduction to `pstack-scout` under the context-window guard. Keep only the reduced finding in the parent context.
2. **Make it queryable.** Transform the raw capture into a form that can be queried. For a trace or heap snapshot, use a temporary SQLite table or an equivalent indexed representation with one row per sample, frame, event, or node. Preserve a pointer to the raw artifact and the transformation command.
3. **Narrow to the cause.** Query the frames with the most time and walk the call tree to the hot path. For a leak, follow the retainer chain from the object to a GC root. For a spindump, find the thread stuck on CPU or blocked and record its wait reason. Do not call a top frame a cause without following the path.
4. **Attribute to source.** Map the hot frame, retained node, or blocked function to file, symbol, and line using the artifact's symbols and source maps. A frame without source mapping is not a diagnosis. Resolve the symbols or state plainly that the artifact cannot support source attribution.
5. **Compare captures.** When a paired before/after capture exists, diff them and report what changed. Without a pair, label the result the strongest hypothesis supported by this artifact, not a confirmed cause.
6. **Hand back.** Return the diagnosis and evidence. Do not implement a fix unless requested. Route a confirmed cause to the bug-fix or performance workflow. Include `throughput checkpoint: n/a, read-only forensics` when the run has no throughput measurement.

## Evidence

Record raw and reduced artifact paths, parser or query commands, source mappings, and whether a paired capture confirmed the finding. A worker report is not evidence until the parent reads the reduced artifact or reproducible query result.

## Reply

Return the artifact and format, the reduced finding, source location, artifact paths, query or parser command, limitations, and whether a paired capture confirmed it. State when attribution remains inconclusive. No fix unless the user asked for one.
