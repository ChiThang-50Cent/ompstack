# Investigation workflow

Use this for a read-only question: how a subsystem works, why a decision exists, whether a premise is true, or which of two approaches fits the observed constraints.

## 1. Set the boundary

State the exact question and the expected deliverable: an evidence-backed explanation, a recommendation, or named uncertainty. Do not turn an investigation into an implementation lane.

## 2. Gather only discriminating evidence

Inspect the direct code path first. Use bundled `scout` only when the relevant files, symbol path, or runtime boundary are genuinely broad or unknown.

Separate:
- observed facts with paths, symbols, commands, or runtime output
- inferences and the facts supporting them
- alternatives that remain plausible
- the smallest next experiment when the evidence cannot decide

## 3. Answer or recommend

Explain the mechanism and boundaries a maintainer needs to know. For a choice, compare concrete tradeoffs against the stated constraints and make a recommendation. Push back when the premise conflicts with repository evidence.

## 4. Preserve the read-only contract

Do not edit, create a write task, or run architecture ceremony merely because the answer exposes possible work. If the user then requests a code change, route that new request to Bug fix, Feature, Refactoring, or Prototype.

## Reply

Report the answer first, then the evidence, uncertainty, and any next experiment. Do not claim a behavior was observed when it was only inferred from source.