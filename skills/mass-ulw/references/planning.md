---
name: mass-ulw
description: Graph definition, handoff and evidence contract for SUPER Graph; read before defining a run.
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

When the actual requested work uses [SUPER Research](../../ulw-research/SKILL.md), that skill owns the journal, claim graph, EXPAND leads, convergence and report delivery gates. SUPER Graph owns only the phase graph and handoffs; do not duplicate the research journal or add a second goal.

Web harvest, expansion and verification assignments carry the research skill's [source-access contract](../../ulw-research/SKILL.md#collection-and-evidence-independence), not an assumption that the lead's loaded browser guidance reaches a node. Name `read`/`web_search` for static retrieval/discovery, [browser](../../browser/SKILL.md#delegated-page-work) for required rendered/interactive/account evidence, and [ultimate-browsing](../../ultimate-browsing/SKILL.md) for blocked, incomplete or platform-specific sources. Include the relevant skill paths, actual tool/backend prerequisites, authorization/state requirements and expected evidence in each applicable brief. A node without the required capability stays blocked or hands that observation to a capable owner; its snippet or public page cannot stand in for the required browser/account evidence.

Start with the topic's meaningful source territories and competing explanations, without an angle quota. Use a harvest node per distinct angle that merits separate ownership. Give an actionable lead its own expansion node only when it needs a separate handoff; the lead can close straightforward leads directly. Chain per item, not per full collection wave:

```text
harvest-<a> -> expand-<a>-<n>   (only for an actionable lead needing a node)
```

Each delegated node has its own handoff file under `<session-dir>/waves/<run-key>/`, named for the node (for example `harvest-<a>.md` or `expand-<a>-<n>.md`). Assignments carry resolved absolute paths; if the child is read-only, the lead persists its returned evidence at that path before releasing consumers. Harvest and expand return candidate claims plus EXPAND tails. The research owner alone reconciles those results and any verifier handoffs into the journal and claim graph.

Carry each claim's OBSERVED evidence and each DEAD END's PROBED evidence in the handoff files, including the probes behind a `none` EXPAND tail. Remembered assertions travel as LEADs. Before accepting a claim for synthesis, check the recorded observation, its source anchor or command result, and support within scope; record the counter-search verdict. The lead can perform simple checks directly. Where an independent lane is justified, a `verify-<cluster>.md` handoff covers related angles and records verdicts, sources and remaining leads; create per-angle or per-claim verification nodes only when the requested rigor justifies them. Each verifier depends only on the handoffs it checks. This does not waive SUPER Research's independent evidence, counter-search or adversarial gates. Reuse valid recorded evidence; reopen a source or rerun a check when the evidence is missing, inadequate or invalidated, or to establish required independent proof.

A missing tail or missing observation evidence leaves the affected claim or lane incomplete and holds its consumers. Obtain missing evidence through the actual host's result retrieval and steering contracts, or collect it directly within scope. If unavailable, preserve the gap as unresolved; a successful node return cannot substitute for evidence.

Deduplicate new leads against the whole owning journal, including duplicates and dead ends, and update the graph for newly discovered work that needs nodes. Apply the research workflow's expansion and convergence rules; the graph need not fabricate nodes for a lead check the owner performs directly. Failed or missing handoffs hold only their consumers within the run's attempt bounds.

Synthesize directly if the verified claim set fits the owner context. Add one reducer if synthesis needs its own bounded assignment, and cluster digests (normally at most 5k tokens each) only when input size or complexity warrants staged reduction. Preserve citations back to verified handoffs in the synthesis. Findings that change the graph are recorded revisions; a new checkpointed research phase gets a new run.

Adapted from [OMO v5.1.79 mass-ulw](https://github.com/code-yeongyu/oh-my-openagent/blob/822bd923038c88427b450744de75e0fa7d7401cd/packages/omo-senpi/skills/mass-ulw/SKILL.md) and its [sizing, research and verification guidance](https://github.com/code-yeongyu/oh-my-openagent/blob/822bd923038c88427b450744de75e0fa7d7401cd/packages/omo-senpi/skills/mass-ulw/references/planning.md).

## Attempt record

Record `ownerSession` as the lead's observed OMP session id and, when available, its transcript file; use the native session metadata, not a guessed id. A node starts at revision `1`, attempt `0`. A launch record in `ledger.jsonl` names the node, revision, next attempt, owning session, exact owned paths and handoff/acceptance inputs before calling the executor. Include the run key, node, revision and attempt in the worker assignment so a recovered transcript can be tied to this launch. Bind the observed handle per node as soon as dispatch returns (`sessionId`, `agentId` and `jobId` when supplied, transcript path when known). Keep the launch/return receipts in the ledger; the graph is a summary, not an authority for whether a process exists. Record inline completion directly, and map partial batch returns per item, never the batch's aggregate id to every node.

An intent without an unambiguous return means the launch might have happened, even if the graph still shows `pending`. Keep its attempt reserved and reconcile before sending another. Release the reservation only if the host establishes that no execution started. Ledger entries for later decisions name the same node/revision/attempt, state change, reason and observed result or evidence reference. Preserve old bindings as history, not control addresses; late results from superseded attempts never satisfy a newer revision. Record the verified input and artifact identities (for example file digests), acceptance verdict, failures, partial outputs, cleanup and held consumers. For revisions retain the changed definition and why dependent proofs were invalidated. A legacy bare handle with no launch binding is not a control address.

For individually steerable or cancellable nodes, use native `task` or a separately tracked Eval `agent()` handle if advertised. Eval/workpool handles and item ids are local to their runtime, not graph node ids. A pool's job is aggregate: never kill it to cancel one item or steer a pooled worker without proving which item and scope the action would affect. Use the live tool schema; graph fields are not task parameters.

## Operator controls

Treat status, steer, cancel and resume as ordinary requests about an existing run. Resolve the exact graph path/key and node where applicable; if they are ambiguous, do not mutate either candidate. Use only controls advertised by the current session. If a required check or control is unavailable, record what could not be observed or done; do not substitute a shell signal or another session.

- **Status:** Read this run's graph and ledger, then take a one-off `read proc://` or `read proc://<jobId>` snapshot for its current owned work. Report verified, live/queued, blocked/unsettled and terminal nodes with the relevant evidence. Inspect `agent://<agentId>` for returned output and `history://<agentId>` or the known transcript for lineage. The output may be from a previous turn; a progress snapshot, parked transcript, elapsed time, or eviction alone is not a terminal receipt. Status does not launch, wake or retry. Snapshots do not consume delivery; take actual results as delivered and use native `wait`/turn-end guidance only when there is no other safe work.
- **Message or steer one node:** Match the live/queued attempt in the current owning session before `write` to `agent://<agentId>` with the scoped clarification and unchanged boundaries. Name the attempt and tell the worker not to apply the change if that attempt already ended. Use the actual agent id, not a job id, label, broadcast or cross-session address. Record whether the message queued, steered or started a turn; delivery is not completion. Sending can wake a worker that settles between inspection and delivery, so do not send if another turn would exceed scope or budget. Intentionally waking an idle or parked worker is a recovery attempt, not inspection: require a settled unverified node, proven ownership, authorization and room within the attempt bound. Record the intent first and rebind the actual follow-up job when exposed. If delivery or revival is uncertain, reconcile before another send/spawn. If refused, record it; no alternate path around a denial.
- **Cancel one node:** Record the target and reason first and prevent redispatch. Match the current caller-owned task job and `write` to `proc://<jobId>/kill` with empty `content`; use `proc://<agentId>/kill` only for an owned running agent shown without a job, never for an old job alias or a service. If the original job is settled but a follow-up is running, target the verified follow-up job, not the original id. If no execution remains and settlement is known, report that outcome, not a successful kill. Record the actual response, including an already-settled race, and the terminal/cleanup evidence; a kill request does not prove rollback. Hold consumers of an unverified result, leave siblings alone, and never wake a cancelled worker to check its status.
- **Cancel a run:** Freeze dispatch and record cancellation intent before acting. Use the same scoped procedure on each confirmed live node of this run only; preserve verified outputs and account for partial files and owned side effects. If any target cannot be matched or settled, record unresolved cancellation/cleanup and stop without claiming it was stopped. Neither a node nor a run with recorded cancellation intent resumes automatically.

## Reconciling after resume

For manual inspection after restart, use the original session with `omp --resume <session-id-or-file>` when available, then identify the existing run by its graph path. OMP 19.1's interactive `--restore` (also used by `/restart`) can resume interrupted, eligible persisted subagents and the lead's interrupted turn; it is not graph replay and can even retry an interrupted tool batch. Do not invoke it as a graph retry. If the host already restored the session, inspect the fresh task roster and delivered results before any dispatch.

After any restart or session change, treat stored process ids and Eval references as historical. To rebind, require the correct current owner, a fresh native task observation and matching attempt lineage (for example, the exact recorded transcript containing the attempt assignment linked to the active restored job). Append the new observation and binding before using it, even if the native id string is the same. No live match is not proof that an original owner, detached process or external write stopped. A different session must not operate old handles or take over a run while the old lead can still dispatch. Transfer lead ownership only on current user direction, after establishing the old lead is no longer running the graph; record the transfer and reconcile any outstanding work before dispatching overlapping writes.

Use retained terminal results or the exact original transcript plus the current artifacts/diff and scoped effect receipts to reconcile old attempts. If exposed, read-only Eval `archive` can locate an earlier session by its recorded id; archived material is evidence, not a live control binding. Check the recorded input and artifact identities and the acceptance verdict; reuse verified unchanged nodes without relaunching them. An interrupted attempt can still have a valid deliverable, but accept it only after ruling out further writes and verifying the output for this revision. If settled without proof, apply the [run recovery bounds](../SKILL.md#recovery-and-resume). If ownership, attempt identity, effect status or required artifact evidence remains unresolved, keep the affected work blocked; absence from `proc://`, a new session, or a found filename is not enough.

For example, in `doc/mass-ulw/release-notes/`, `collect` hands `verify` its `collect.json`, and `audit` owns an independent `audit.json`:

- **Live:** The graph and launch receipt bind `collect` attempt 1 to `NotesCollect`; the current `proc://NotesCollect` confirms the owned task. Send an in-scope correction with `write agent://NotesCollect` or, if the user cancels `collect`, use `write proc://NotesCollect/kill` with empty content and retain its settlement/cleanup receipt. Do not launch `collect` again or release `verify` on a message acknowledgment. An independent verified `audit` stays complete.
- **After restart:** If native restore reports a matching live task in the same owning session, record a fresh binding and await its result. If `proc://` has no matching task (or shows the same string for an unrelated job), make no control write. Read the recorded transcript and `collect.json`, and check writer settlement and acceptance. Reuse a verified result; if the prior attempt settled and its incomplete output is accounted for, dispatch attempt 2 only. If settlement or evidence cannot be established, record the gap in `ledger.jsonl`, hold `verify`, retain `audit`, and stop blocked when no eligible work remains.
- **Terminal:** If the graph is complete or cancelled, report the saved acceptance or cancellation/cleanup receipts. Do not relaunch, re-message, reopen downstream work or reinterpret a terminal run as a new run on status or resume.

[OMO Senpi's mass-ulw](https://github.com/code-yeongyu/oh-my-openagent/blob/9e448c6c35a8745e4aae00e339f5903aae8bd782/packages/omo-senpi/skills/mass-ulw/SKILL.md) supplies `workflow`/SDK attach, snapshot, retry, send, amend, journaled idempotent start and `/dag`. The counterparts here are the lead's graph/ledger decisions and [OMP 19.1 task](https://github.com/can1357/oh-my-pi/blob/a7135b8f31826c878734388b648f52bed8da436e/packages/coding-agent/src/prompts/tools/task.md), [process control](https://github.com/can1357/oh-my-pi/blob/a7135b8f31826c878734388b648f52bed8da436e/packages/coding-agent/src/internal-urls/proc-protocol.ts) and [session restore](https://github.com/can1357/oh-my-pi/blob/a7135b8f31826c878734388b648f52bed8da436e/packages/coding-agent/src/task/restore.ts) surfaces. No equivalent graph attach, retry/amend API or dashboard is required.
