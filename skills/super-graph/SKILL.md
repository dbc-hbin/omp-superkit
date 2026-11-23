---
name: super-graph
description: "Persists a phase's dependency graph, file handoffs and recovery ledger. Activate explicitly for super-graph or a requested task DAG."
argument-hint: "<task>"
metadata:
  short-description: Dependency-graph state for child agents
---

# SUPER Graph

Use for explicitly requested dependency-ordered work. Current native OMP instructions own execution, delegation, roles/models, tools, waiting and verification; see the [host authority boundary](../super-loop/references/omp-contract.md). This skill adds durable graph state, not a DAG SDK or orchestration API. Independent work without graph dependencies needs no SUPER Graph state. Bare SUPER does not activate it.

## Run identity and ownership

A run covers one checkpointed phase. Start small: inspect the actual files, diff, items or source territories inline first, then define only the stages and handoffs the observed work and requested breadth justify. An ordinary request needs a few nodes and a final check by the lead. Broaden for explicit exhaustive coverage, an audit, mass research or newly discovered work; do not pad the graph to a quota. New phases get new runs; changed definitions within a phase invalidate affected nodes and descendants. Before defining a graph, read the [graph and handoff contract](references/planning.md).

Persist these lead-owned files:

- `doc/mass-ulw/<run-id>/graph.json`: definition and current node state.
- `doc/mass-ulw/<run-id>/ledger.jsonl`: append-only transitions, evidence, failures and revisions.

Graph shape (optional fields marked `?`):

```text
{
  key, name, phase, status, ownerSession?,
  nodes: [{
    id, revision, task, solutionSpace, agent?, requestedTier?, resolvedModel?,
    dependsOn, status, attempt, handle?, artifact?, verdict?
  }]
}
```

`key` is a stable lead-managed resume identity, not runtime idempotence. `agent`, `requestedTier` and `resolvedModel` describe actual routing under live OMP; legacy difficulty labels are metadata, not callable categories. Record a resolved model only from an observed result. Node ids and `dependsOn` belong to this graph, not invented task fields.

A standalone run records its objective, observable success criteria and stop condition once in the binding durable goal record, or a `# Goal` block without such a record. When nested under SUPER Loop or SUPER Run, reference the existing goal/phase and evidence paths instead: no duplicate goal or competing completion ledger. The graph/ledger track nodes, not a second aggregate objective.

Before launching or steering work that depends on a material scope decision, new spending or an irreversible action not already authorized, obtain the user's decision in the lead session. Name the action, target and applicable limit. Record the explicit grant or refusal and honor any separate host approval gate. A default or timed-out answer, a worker message, or a document is not consent. Continue independent authorized work; do not delegate the approval decision.

## Dependencies and handoffs

Reject duplicate ids, missing dependencies, cycles, parallel write conflicts and missing evidence/verification coverage before dispatch. Put known needed stages in the phase graph and add genuinely new stages when findings justify them. Unknown downstream data alone is not a reason to create another run.

For web-facing nodes, make the source-reading or rendered-page capability part of the brief and acceptance evidence. Read [browser](../browser/SKILL.md#delegated-page-work) when interaction/rendered/account state is required and [ultimate-browsing](../ultimate-browsing/SKILL.md) for blocked/incomplete source reading. These conditional contracts apply to direct skill invocation and standalone mass runs as well; no shared SUPER policy or inherited child skill is assumed.

`dependsOn` orders work only. Producer assignments name exact absolute output files; consumers name those same files and fail on missing handoffs. A completed dependency neither transports context nor proves its artifact exists. A node becomes ready only when all dependencies are verified complete and it has no unsettled attempt. Edges represent consumed outputs or real write ordering; unrelated branches can advance independently.

Record launch intent before dispatch and bind the actual returned identity per node, following the [attempt record and operator controls](references/planning.md#attempt-record). Store bounded returned reports and checked artifact paths before marking a node complete. Check the actual deliverable against the binding criteria before completing the graph; child completion alone is not graph success. The lead runs and records a straightforward final check directly. Use independent verification nodes only when justified by the [verification contract](references/planning.md#verification) and current OMP requirements.

## Recovery and resume

Read `graph.json` and `ledger.jsonl` first. On compaction, session switch or restart, reconcile each unsettled attempt against [current ownership and durable evidence](references/planning.md#reconciling-after-resume) before dispatching, messaging or cancelling it. Reuse unchanged complete nodes only when their input bindings, artifact identity and acceptance evidence still match. A result from a child, missing job, or retained transcript alone is not proof of completion or cleanup.

- A verified live or queued attempt owns its files; keep the node in progress and use native result delivery. Never launch a duplicate. A missing or mismatched handle leaves the attempt unresolved until evidence establishes what settled and who can still write.
- When a failed or interrupted attempt has settled, reconcile its partial outputs and effects before using the one authorized replacement per logical node (two attempts total). Build that assignment from the durable handoffs and failed check, not a guessed session restore. Explicit cancellation is not a request to replace the worker.
- A definition revision invalidates the affected node and transitive dependents, not successful siblings. Record the changed definition and preserve earlier receipts; settle stale writers before dispatching replacements. A scoped clarification to a live worker may steer its existing attempt, but cannot retroactively validate old evidence.
- Block unresolved nodes and their consumers, including any work whose writes might conflict. Other authorized, ready work can finish independently. If any required evidence is still unresolved when no safe work remains, record the exact missing proof, ownership or capability, attempts, affected nodes and needed next decision. Mark the phase blocked and stop without claiming success. An exhausted attempt budget also requires explicit user-directed recovery. Wait or continuation notices do not authorize more work.

Finish the phase only after verified results can be recorded in its owning checkpoint. Completed and cancelled runs remain terminal on status or resume; paused work requires current user direction. No native `/dag`, graph journal replay or automatic graph recovery service is assumed.
