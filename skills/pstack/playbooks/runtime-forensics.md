---
name: pstack-runtime-forensics
description: Diagnose a live-process performance or runtime problem by capturing a real signal, reducing it to a smoking gun, and attributing it to source without applying a fix.
---

# Runtime forensics playbook

Own the diagnosis. Instrument the live process instead of theorizing from source. The deliverable is a cited diagnosis, not a fix.

## Procedure

1. Capture the live signal on the matching surface using the project's control or verification driver. Use a CPU profile for a spinning process, a heap snapshot for a leak, a CDP trace for a visual glitch, or the closest real runtime artifact. A real capture is required.
2. Reduce the artifact to the smoking gun. Identify the function on the hot path, the retainer chain from a leaked object to a GC root, or the loop firing without input. Delegate large artifact reduction to a bounded read-only `pstack-scout` and keep the reduced finding in the parent context.
3. Prove the mechanism before believing it. Use a safe runtime evaluation hook or controlled instrumentation on the running process to confirm the hypothesis cheaply. Do not turn a source guess into a diagnosis.
4. Map the finding back to source, including file, symbol, and the line that allocates or schedules the behavior.
5. Return `throughput checkpoint: n/a, read-only forensics` when no throughput metric is part of the investigation. Do not change product code unless the user starts a separate implementation run.

## Evidence and reply

Record the captured signal, reduction command, mechanism check, source location, artifact paths, surface, and limitations. Return what was captured, the reduced finding, how the mechanism was proved, and the source location. Hand the confirmed cause to bug-fix or performance work. If the surface or instrumentation is unavailable, return `INCONCLUSIVE` and name the missing capability.
