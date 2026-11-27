# Targeted change-risk review

Bind the question to the named design, diff or artifact and its intended contract. A targeted review is read-only: use existing inspection and permitted probes on isolated inputs; do not patch production code, check in a reproduction, update external state, or invent a new requirement. An explicit completed-work gate retains [review-work's two lanes and verdict rules](../SKILL.md); this reference supplies only scoped evidence.

## Compatibility and blast radius: test the safety premise

State what changed and the fact its safety depends on, not just a caller list. For example: “The previous reader accepts records emitted with the new field.” Name the boundary and both owners: the writer and actual earlier reader, not the writer's current tests. Trace the relevant path through persisted data, serialized or wire formats, pinned dependency versions, older or external consumers, migrations or timing and lifecycle. Check only boundaries where the change can reach the premise.

Choose the smallest observation that would fail if the premise were false. For the reader example, pass an artifact produced by the changed writer to the actual previous reader with representative data and check both acceptance and semantic readback. Report whether the evidence supports, contradicts or leaves the premise unproven. Record the input, consumer version, invocation and observed result. If that consumer or the required state is unavailable, show what the contract or trace does establish and mark compatibility **unproven** there. Passing the current reader or finding no in-tree references does not prove an old consumer is safe.

## Counterexamples: challenge the claim

State what would disprove the intended behavior. Follow plausible boundary, failure, timing or concurrency paths only where they bear on the named change. Use the smallest permitted probe of the real code or a representative prototype for a design; cite the exact scenario and expected versus observed behavior. For a claimed runtime break, require a reproducible observation, not a plausible story. A design contradiction shown directly by its contract is evidence about the design, not a reproduced product failure.

Report separately:
- **Confirmed counterexamples:** the violated contract, causal path, input or invocation, and observed result. Merge duplicates that share a cause.
- **Ruled-out suspicions:** what the check actually cleared and under which conditions.
- **Unverified risks:** why the failure is plausible, its consequence, the missing observation and the cheapest useful check. A probe that couldn't reach the risky path, or no verified findings, is not evidence of overall safety.

Do not assign a gate verdict or dispatch a review panel merely because a targeted probe is requested. Use the current host's permitted roles if independent work is needed; do not substitute the result for the gate's root-owned real-surface QA or fresh independent review.

Adapted from pstack's `blast-radius` and `interrogate`; see [attribution](../../superstack/ATTRIBUTION.md).
