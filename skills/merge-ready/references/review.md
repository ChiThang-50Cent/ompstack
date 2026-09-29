# Independent review

A reviewer asks whether the current implementation is flawed; it does not prove that the requested behavior works.

## Frozen packet

The root first calls `mr_refresh`, then calls `mr_review_packet` with `contextPointers` and `rubricVersion`; the tool computes the diff from the controller's current patch identity. Pass the returned packet path and digest verbatim to every replicated reviewer. Every reviewer receives the same packet and digest containing raw intent, contract version/digest, base/head/patch identity, relevant diff, context pointers, verification receipts, assumptions, and rubric version. Do not include the implementer's private reasoning transcript. If the patch changes, refresh, create a new packet, and rerun affected review.

## Review lenses

Code reviewers independently inspect correctness, boundary consumers, error paths, compatibility, races, security assumptions, and scope. Product review is required from MEDIUM and audits the contract's completeness; security review is added for auth, permissions, secrets, data exposure, or other high-risk surfaces.

Report only evidence-backed, patch-anchored findings with impact, trigger, location, and actionable remediation. Preserve disagreement. The root classifies findings as `ACT`, `CONSIDER`, `NOTED`, or `DISMISSED`; only an evidence-backed `ACT` finding blocks the gate. Never blindly apply every comment.

Reviewers are not implementers, have no edit/write tools, and do not call `mr_*` tools. The root records each structured result as a patch-bound receipt with `packetDigest` set to the returned digest, a distinct `producer.id` (for example, `mr-code-reviewer-a`), and that lane's `producer.model`. MEDIUM requires at least two distinct reviewer ids; HIGH requires distinct reviewer models as well. A product review returns `contractGaps`; any non-empty gaps fail the gate and send the run back to `SPEC_DISCOVERY` for a new contract version.

Re-review is incremental. Product review is bound to the contract version, not the patch. When a patch changes only to address review findings, keep the contract version and re-run only the reviewers whose findings were fixed; passing code reviews from earlier patches of the same contract still count toward reviewer independence, provided at least one passing review covers the current patch. Run independent verification once, on the final patch.
