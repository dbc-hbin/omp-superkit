# SUPER and OMP responsibility boundary

SUPER workflow skills define specialised deliverables, durable artifact formats and evidence gates. The extension's selected model guidance owns ordinary work style, including investigation, delegation, asynchronous work and verification choices; these skills do not add a generic execution policy. Actual tool schemas, permissions, approvals, explicit native modes, project rules and specialist completion contracts remain binding. For unsupported/custom profiles, use OMP's native fallback guidance. Native keyword connections select execution modes without granting additional permissions or changing workflow ownership.

## Activation and ownership

Use `/super` or one of the `/super-*` commands below. Use the matching SUPER skill ID for new direct `/skill:` invocations; legacy commands and skill IDs remain aliases. Only an explicit request selects a specialised workflow; reading or discussing one does not. A pointer locates its installed skill, not an additional execution mode.

For leading specialised invocations in interactive/RPC `prompt` input and registered slash-command handlers, the extension inserts a native trigger before user arguments: `/super-plan` -> `ultrathink`, `/super-run` and `/super-loop` -> `orchestrate`, `/super-research` and `/super-graph` -> `workflowz`. Existing keyword aliases use the same mapping. A user-supplied native word suppresses this default, even when quoted or negated; OMP decides whether that word activates. The extension does not copy native notice text or bypass disabled keyword settings, missing tools, child isolation, or `--omo-ulw-workflows-disabled`. Plain SUPER and ordinary follow-ups add no trigger; `jevify` is never automatically selected.

OMP 18.16's separate RPC `steer` and `follow_up` requests bypass native keyword processing. Clients needing queued native activation use RPC `prompt` with `streamingBehavior: "steer"` or `"followUp"`. The input hook does not expose the request kind; it must not resubmit inputs and silently change queue semantics or attachments. Initial CLI bare text and direct `/skill:` invocations also need explicit native words rather than assuming this extension's command bridge ran.

Plain SUPER uses OMP-native goal continuation. The extension routes explicit interactive `/super` and leading `super` invocations through `/goal` before command dispatch when native goal ownership permits. RPC and programmatic activation only arm the policy; clients create goals through the native goal API. `sendUserMessage()` does not expand a `/goal` command.

Durable workflows retain one owner for each kind of state. Keep the established on-disk locations below so existing runs, receipts and continuation can still find their records; do not create parallel `doc/super-*` state:

| Workflow | Owned state |
|---|---|
| `/super-plan` | Decisions, plan and plan-review status: `doc/drafts/` and `doc/plans/` ordinarily; lead-written `local://<slug>-draft.md` and canonical `local://<slug>-plan.md` in native plan mode |
| `/super-run` | `doc/boulder.json` and `doc/ulw-execute/ledger.jsonl`: plan selection, session ownership and checkpoints |
| `/super-loop` | `doc/ulw-loop/<run-id>/`: aggregate objective, goals and evidence checkpoints |
| `/super-graph` | `doc/mass-ulw/<run-id>/graph.json` and `ledger.jsonl`: dependency nodes, handoffs and recovery |
| `/super-research` | `doc/ulw-research/<timestamp>/` for claims, observations and deliverables; standalone continuation uses session-owned `doc/ulw-loop/<session-id>/` goals referencing those records |

The lead owns shared workflow state. A nested graph uses the enclosing loop or execution objective rather than registering another goal. Planning does not authorize implementation; workflow flags do not bypass OMP approval boundaries.

### Native plan submission

Native plan-mode children return proposed content without writing artifacts. The lead writes and reviews the canonical `local://<slug>-plan.md`, then runs `propose <slug>` through `bash` when the command is mounted; otherwise call the direct `propose` tool with that slug. Submit the slug matching the filename, not a path or the plan text. Never request plan approval in prose or through ask/chat. If neither route is exposed, report the missing capability; do not substitute approval in prose. The user's native selection governs execution.

Source: [OMP v19.1.0 native plan-mode contract](https://github.com/can1357/oh-my-pi/blob/a7135b8f31826c878734388b648f52bed8da436e/packages/coding-agent/src/prompts/system/plan-mode-active.md).

### Native decision forms

Use `ask` only when advertised and a material decision needs the user. In
[OMP 19.2.1](https://github.com/can1357/oh-my-pi/blob/b55cd1bb664d8ab46ddc77f2a34eb47555dbf1ac/packages/coding-agent/src/prompts/tools/ask.md),
`required`, `min`, `max` and `pattern` are hints: invalid submissions can
be flagged but still returned. Check that the response actually resolves
the decision before acting. A missing or out-of-scope answer, cancellation,
or timeout-selected default does not authorize action. A submitted form
does not satisfy a separate host approval gate or replace native plan approval.

### Live agent model controls

When the host exposes these writes, target yourself or a live direct child
you spawned, by its observed `agent://<id>`. Write a permitted task agent
kind (e.g. `task:high`) or an available user model tag (e.g. `m1`) to `agent://<id>/model`,
or a level such as `high` or `auto` to `agent://<id>/effort`. Read the
result: unsupported levels may snap to a supported effort. These controls
change only that live session's model or effort, not its assigned role,
scope, permissions or settings defaults. Do not use a historical output,
reused label, peer, cross-instance address or stale graph binding as a
control target. A denied or unavailable control grants no alternative.
See the [OMP 19.2.1 agent URL contract](https://github.com/can1357/oh-my-pi/blob/b55cd1bb664d8ab46ddc77f2a34eb47555dbf1ac/packages/coding-agent/src/prompts/internal-urls/agent.md).

## Continuation and evidence

The installed extension can resume active loop-format or Boulder work owned by the current session. Resume the workflow identified by its brief and linked records: standalone research remains research when it reuses loop-format continuation state. The hook checks pending state, respects terminal/blocked state and stops repeating an unchanged fingerprint. A hook notification is not proof of completion; update state from the actual outcome.

- `/stop-continuation` stops the extension's automatic continuations for the current session. The journal preserves the stop across compaction and history navigation, and across reopen for saved sessions. The command keeps workflow status, goals, plans, evidence and other sessions intact. It neither aborts an already-admitted turn nor stops workers. Ordinary follow-ups and delivered results do not lift the stop.
- `/resume-continuation` explicitly lifts that stop. It requests a turn only for eligible, active Boulder or loop-format work owned by this session; if none is eligible it only re-enables future continuation. It does not reopen blocked/terminal work, change a workflow's own paused status, or override `--omo-ulw-continuation-disabled`.
- In the TUI, the commands use OMP's mode-control API to pause an active native goal created through this session's plain SUPER route and to resume only the same goal this command actually paused. OMP controls native scheduling. If OMP refuses mode control (for example, while busy or when disabled), or the goal is not owned by this session’s SUPER invocation, the native goal is unchanged by the extension: use OMP's `/goal pause` or `/goal resume` separately as appropriate. In RPC use `prompt` for the extension slash commands, not the separate queue-only `steer`/`follow_up` methods. Command notifications use the extension UI channel, which is not available with `--no-ui`. Native goals are independent there: use the `goal` RPC command (`op: "pause"` or `"resume"`) and inspect its result. The extension cannot change an RPC-native goal.

Use the selected workflow's artifact schema and existing verifier where it has one. A checkpoint ties its criterion to the input identity, observed result and evidence location. Changed inputs invalidate dependent evidence, not unrelated completed work. Record the checks selected under model guidance, applicable native modes and project requirements rather than imposing a second generic verification pass.

Load linked references only when their artifact or state contract is needed. Tool documentation, not this file, specifies native task, workpool, wait, browser or memory APIs.

### Waiting for native results

Continue independent work while jobs run. When only results from work you started or a blocking reply remain, follow the current session's native `wait` description. In OMP 19 TUI, end the turn when the host says results or messages resume it. This leaves the work pending; it does not complete the workflow. In other sessions use `wait` as advertised.

A `wait` call is not a per-child wait or a wave barrier. It may return with no new terminal result, multiple events, or due to steering. Reconcile delivered results by their actual job or agent IDs and remove only terminal entries from the pending set. A message, preview, or running snapshot is not completion. Process delivered results before waiting again; never poll or sleep for them.

### Task-owned services

Use the advertised named Bash service for an authorized long-lived server.
If a task-owned process is already running, OMP 19.2.1's embedded shell
can adopt it without restarting it: `o2ctl services add <name> <pid|%job>`.
Use a unique project service name and a verified PID or shell job
belonging to this task. `o2ctl services ls` lists the project's services;
`o2ctl services stop <name>` stops a named service and its process tree.
Listing or adoption is not proof of readiness. Verify the endpoint
needed by the task, and record the service identity, owner and cleanup
result or explicitly authorized handoff. Do not stop unrelated services.

Service lifetime and shell cleanup are separate:

- `launch.persist` applies to named services, including adopted ones.
  Without persistence they are lease-held and stop when the last lease
  is released; with persistence they are not stopped by lease release.
  Check the effective host setting rather than assuming they die with
  the workflow or will outlive it.
- `bash.reapBackground` covers **unregistered** Bash leftovers. Where
  enabled, the main agent can receive a reminder at turn settle and
  ordinary `&` leftovers are reaped at session end. `nohup` leftovers
  may be reported but are not reaped by that path; RPC disables the
  reaper. Neither a reminder nor session exit is a cleanup receipt.

Sources at OMP 19.2.1: [service commands](https://github.com/can1357/oh-my-pi/blob/b55cd1bb664d8ab46ddc77f2a34eb47555dbf1ac/packages/coding-agent/src/launch/o2ctl-command.ts),
[service lifetime](https://github.com/can1357/oh-my-pi/blob/b55cd1bb664d8ab46ddc77f2a34eb47555dbf1ac/packages/coding-agent/src/launch/services.ts)
and [leftover process handling](https://github.com/can1357/oh-my-pi/blob/b55cd1bb664d8ab46ddc77f2a34eb47555dbf1ac/packages/coding-agent/src/session/leftover-processes.ts).
