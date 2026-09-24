---
name: pstack-blast-radius
description: Find what a change could break beyond the diff and prove the safety-critical fact by running real code.
disable-model-invocation: true
---

# Blast radius

Find what a change could break somewhere else before it ships. Use for “blast radius of X,” “what could this break,” or a small diff you do not trust yet.

This complements `skill://pstack/operators/how.md` and `skill://pstack/operators/why.md`. How tells you what the code does. Why tells you why it is shaped that way. Blast radius tells you what it breaks elsewhere.

## Do not trust the writeup

A blast-radius writeup that sounds right is worthless. It reads as convincing whether or not it is true. Do not hand back an unsupported writeup. Find the one or two facts the whole safety argument depends on and prove them by running code.

## Confidence ladder

For each fact the change's safety depends on, take it as far down this list as is cheap and state where it stopped:

1. You said so. Worthless on its own.
2. You pointed at the line. Cite a real `file:line` or the library's source.
3. You showed the bad case cannot happen. Walk the failure step by step and show it does not reach the boundary.
4. You ran it. Use a script or test that calls the real code and fails loudly if you are wrong.
5. You reproduced it in the running application.

Step 4 is usually one small script that imports the same library the application ships and calls the exact function under concern.

## Steps

1. Read the change. Inspect the diff, symbols it adds, changes, and deletes, and what now behaves differently, including the part the diff does not spell out. Use `skill://pstack/operators/why.md` when history or rationale is material.
2. Find the one fact it is safe because of. Most changes that look risky are safe because of one fact, such as “this call only drops already-dead cache entries and does nothing else.” Find that fact. Spend time proving it, not writing a long list of maybes.
3. Look where grep stops. Read the source of the library you call, check its pinned version and local patches, and work out when things run. Follow what symbol search misses: the JSON an API returns, a database column, a wire format, another language reading the same bytes, a feature flag, or code several hops downstream.
4. Be honest about each risk. Give it a real chance of happening and a real cost if it does. Keep risks you confirmed. List the ones checked and cleared separately. Cite a real `file:line`; a search that finds nothing is still an answer. Never invent a caller or API.
5. Prove the safety-critical fact. Write a script or test that runs the real code and run it. In the parent session record the claim and reproducible command or artifact reference with `pstack_evidence`, using a precise evidence kind and `attachFingerprint: true` when the claim is artifact-bound.
6. For a big or wide change, use `skill://pstack/operators/arena.md`. Ask several agents the same question and merge the answers without treating agreement as proof.

## What to hand back

- **What it does.** What changed, including the part that is not obvious.
- **The one fact it is safe because of.** State it, name the confidence step, and show the proof. If you could not prove it, write `unproven`.
- **Risks.** Each names how it breaks, a `file:line`, likelihood, impact, and how to check. Include the proof for material risks.
- **Cleared.** What you checked and why it is fine.
- **Before merge.** The cheapest test or reproduction that catches the real bug, including the script used.

Run the result through `skill://pstack-unslop`. Redact private material before sharing it. The final response is the writeup above, with the one safety fact either proven or explicitly marked unproven.
