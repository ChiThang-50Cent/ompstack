# Runtime forensics workflow

Use this to diagnose a live leak, idle CPU spin, race, intermittent glitch, or other runtime symptom. The deliverable is a diagnosis, not a fix. Route a confirmed cause to Bug fix or Performance issue only when the user asks for the change.

## 1. Capture a live signal

Collect the smallest artifact that observes the symptom on its real surface: CPU profile, heap snapshot, trace, debugger stack, runtime counter, browser trace, or targeted command output. State the workload and whether the symptom reproduced.

## 2. Reduce to a mechanism

Find the hot path, retainer chain, unscheduled wakeup, ordering violation, or other concrete mechanism. Keep large artifacts out of parent context; summarize only the evidence that distinguishes the leading hypothesis.

## 3. Prove the mechanism

Use the least invasive runtime instrumentation, debugger evaluation, or controlled input to distinguish the mechanism from plausible alternatives. A source-level explanation without runtime confirmation remains a hypothesis.

## 4. Map to source

Identify the file, symbol, and responsible allocation, scheduling point, or state transition. Name uncertainty explicitly when the artifact cannot prove causality.

## 5. Stop at diagnosis

Do not edit source unless the user extends scope. If a fix is requested, preserve the artifact and route to Bug fix or Performance issue with the confirmed mechanism and proof surface.

## Reply

Report the captured signal, reduced finding, mechanism check, source mapping, artifact paths, and remaining uncertainty.
