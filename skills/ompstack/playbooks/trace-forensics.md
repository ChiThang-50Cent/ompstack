# Trace forensics workflow

Use this when the user provides a CPU profile, heap snapshot, browser trace, spindump, or another captured artifact. The deliverable is an evidence-backed diagnosis, not a new reproduction or a code change. For a live symptom that still needs capture, use Runtime forensics.

## 1. Establish artifact scope

Identify artifact type, capture environment, workload, time range, and what the artifact can and cannot prove. Confirm that it corresponds to the reported surface before analyzing it.

## 2. Reduce the artifact

Extract the smallest decisive finding: dominant stack, allocation retainer chain, repeated event sequence, blocking wait, or frame-cost cluster. Use a subagent only when artifact volume exceeds useful parent context; preserve the reduced finding and artifact path.

## 3. Separate observation from inference

State observed frames, allocations, timings, or events separately from the source-level mechanism they suggest. Do not claim causality without a live confirmation path.

## 4. Map to code and next route

Map the finding to file and symbol where possible. Recommend Runtime forensics when the mechanism needs a live experiment, Bug fix when behavior is known to be wrong, or Performance issue when the metric needs improvement.

## Reply

Report artifact scope, decisive observation, source mapping, confidence, proposed next route, and any missing capture needed to prove causality.
