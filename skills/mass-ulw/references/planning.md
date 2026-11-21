---
name: mass-ulw
description: Graph definition, handoff and evidence contract for mass-ulw; read before defining a run.
metadata:
  short-description: Phase graphs, file handoffs and recovery boundaries
---

# Graph and handoff contract

[The skill](../SKILL.md) owns run paths, node fields and recovery transitions. This reference defines what must be present in that state. Use current native OMP instructions for decomposition, role/model selection, capacity, dispatch and checks.

## Phase graph

Before starting, scout the actual work inline and record the phase deliverable, known needed stages, producer/consumer paths and evidence gates. A phase is the unit checkpointed by the owning plan or goal. Start with the smallest graph that covers the request; add nodes for additional work supported by findings, not a preemptive stage per item. Start another run when the phase changes, not merely because inputs arrive later.

Each node has a stable id, a self-contained assignment, `solutionSpace`, explicit read/write scope, acceptance evidence and `dependsOn`. Use one node per independently checkable piece; keep the change and its own proof together. Combine work that needs one coherent judgment or cannot split its write scope. Preserve optional routing metadata without treating it as an execution API. Concurrent write scopes must not overlap; an ordering edge or a single owner resolves shared-file work.

Audit ids, dependency existence and acyclicity. Every edge must represent an actual consumed output or write ordering. Chain related items independently; wait for the whole wave only when a downstream decision really needs all its results together. Where a later stage consumes a verified whole-wave digest, a reduction node can supply that digest rather than unnecessary all-to-all edges. Branch-specific consumers need only their actual upstream proofs.

## File transport

For every handoff record:

| Producer | Consumer |
| --- | --- |
| Exact absolute file path owned by this node | The same literal input path |
| Required report sections and size bound | The facts/sections it consumes |
| Evidence and source references | The check that rejects absent or invalid input |

`dependsOn` provides no data substitution. A downstream assignment must be usable without parent conversation or implied upstream context. Preserve the handoff file and its verdict before releasing its consumers. Missing files or unsupported claims block those consumers, not unrelated branches.

For large graphs, use bounded reports and staged reduction so downstream nodes consume verified digests rather than an unbounded set of raw outputs. Size clusters to observed runtime capacity and reducer input limits; record any split and its join point. There is no node-count quota or assumed capacity setting.

## Node records

Keep TASK, DELIVERABLE, SCOPE, VERIFY and STOP WHEN in the assignment when that is the host's brief format. For this graph, their load-bearing content is the node's output path/shape, exact owned files, dependency inputs and binary acceptance observable. The recorded artifact and verdict must establish the declared deliverable, not merely a successful worker return.

VERIFY carries the data behind each factual conclusion: `OBSERVED: <read URL | file:line | command and observed result>`. Conclusions must trace to a page or file actually read or a tool/command result actually observed; distinguish observations from inferences and their limits. Code shape or plausibility alone does not prove runtime behavior. Memory supplies a LEAD to investigate, never independent evidence. DEAD END decisions carry `PROBED: <searches/reads/commands and observed results>`; convergence and settled judgments link to the observations and probes establishing them.

## Verification

Before dispatch, define each node's acceptance and the final check that proves the deliverable against its owning criteria. The lead runs a straightforward check directly (for example, one test command or inspection of the actual artifact), then records its observable result and evidence in the ledger before marking the graph complete. Use a separate verification node only when justified: the check is substantial, has independent parts, needs a fresh context, or the user, repository or host requires independent verification. Name the reason, exact invocation or inspection, evidence path and observable pass/fail result. This changes who checks, not the required coverage or OMP's test/QA procedures.

For paginated deliverables, inspect every rendered page for clipping, broken pagination and other layout defects. File size, text extraction and sampling cannot prove page layout; use the [paged-media reference](../../frontend/references/design/print-paged-media.md#6-verify-by-rendering-every-page) for the applicable visual check.

## Research graph composition

When the actual requested work uses [ulw-research](../../ulw-research/SKILL.md), that skill owns the journal, claim graph, EXPAND leads, convergence and report delivery gates. Mass-ulw owns only the phase graph and handoffs; do not duplicate the research journal or add a second goal.

Web harvest, expansion and verification assignments carry the research skill's [source-access contract](../../ulw-research/SKILL.md#collection-and-evidence-independence), not an assumption that the lead's loaded browser guidance reaches a node. Name `read`/`web_search` for static retrieval/discovery, [browser](../../browser/SKILL.md#delegated-page-work) for required rendered/interactive/account evidence, and [ultimate-browsing](../../ultimate-browsing/SKILL.md) for blocked, incomplete or platform-specific sources. Include the relevant skill paths, actual tool/backend prerequisites, authorization/state requirements and expected evidence in each applicable brief. A node without the required capability stays blocked or hands that observation to a capable owner; its snippet or public page cannot stand in for the required browser/account evidence.

Start with the topic's meaningful source territories and competing explanations, without an angle quota. Use a harvest node per distinct angle that merits separate ownership. Give an actionable lead its own expansion node only when it needs a separate handoff; the lead can close straightforward leads directly. Chain per item, not per full collection wave:

```text
harvest-<a> -> expand-<a>-<n>   (only for an actionable lead needing a node)
```

Each delegated node has its own handoff file under `<session-dir>/waves/<run-key>/`, named for the node (for example `harvest-<a>.md` or `expand-<a>-<n>.md`). Assignments carry resolved absolute paths; if the child is read-only, the lead persists its returned evidence at that path before releasing consumers. Harvest and expand return candidate claims plus EXPAND tails. The research owner alone reconciles those results and any verifier handoffs into the journal and claim graph.

Carry each claim's OBSERVED evidence and each DEAD END's PROBED evidence in the handoff files, including the probes behind a `none` EXPAND tail. Remembered assertions travel as LEADs. Before accepting a claim for synthesis, check the recorded observation, its source anchor or command result, and support within scope; record the counter-search verdict. The lead can perform simple checks directly. Where an independent lane is justified, a `verify-<cluster>.md` handoff covers related angles and records verdicts, sources and remaining leads; create per-angle or per-claim verification nodes only when the requested rigor justifies them. Each verifier depends only on the handoffs it checks. This does not waive ulw-research's independent evidence, counter-search or adversarial gates. Reuse valid recorded evidence; reopen a source or rerun a check when the evidence is missing, inadequate or invalidated, or to establish required independent proof.

A missing tail or missing observation evidence leaves the affected claim or lane incomplete and holds its consumers. Obtain missing evidence through the actual host's result retrieval and steering contracts, or collect it directly within scope. If unavailable, preserve the gap as unresolved; a successful node return cannot substitute for evidence.

Deduplicate new leads against the whole owning journal, including duplicates and dead ends, and update the graph for newly discovered work that needs nodes. Apply the research workflow's expansion and convergence rules; the graph need not fabricate nodes for a lead check the owner performs directly. Failed or missing handoffs hold only their consumers within the run's attempt bounds.

Synthesize directly if the verified claim set fits the owner context. Add one reducer if synthesis needs its own bounded assignment, and cluster digests (normally at most 5k tokens each) only when input size or complexity warrants staged reduction. Preserve citations back to verified handoffs in the synthesis. Findings that change the graph are recorded revisions; a new checkpointed research phase gets a new run.

Adapted from [OMO v5.1.79 mass-ulw](https://github.com/code-yeongyu/oh-my-openagent/blob/822bd923038c88427b450744de75e0fa7d7401cd/packages/omo-senpi/skills/mass-ulw/SKILL.md) and its [sizing, research and verification guidance](https://github.com/code-yeongyu/oh-my-openagent/blob/822bd923038c88427b450744de75e0fa7d7401cd/packages/omo-senpi/skills/mass-ulw/references/planning.md).

## Recovery evidence

For failures retain the node id, attempt, diagnosis, last artifact/verdict and blocked descendants. For definition changes retain the changed definition, rationale and invalidated descendants. Apply the [run recovery bounds](../SKILL.md#recovery-and-resume); state files do not imply automatic retries, idempotent starts or host journal replay.
