# State and flow

**Modified for OMP** from [OMO v5.1.83's state-and-flow reference](https://github.com/code-yeongyu/oh-my-openagent/blob/69a1863a457da06fb64ae788e335bf272f1df406/packages/shared-skills/skills/frontend/references/perfection/state-and-flow.md).
The matching [Sustainable Use License 1.0 terms](../../../browser/LICENSE.md) ship in the skills package; see [attribution](../../ATTRIBUTION.md).

Use this on the part of a rendered UI that changes a read, write, precondition, saved or restored state, or multi-step flow. Include affected entry points and shared consumers of that path, not every state on every screen. Static copy, color or spacing alone does not need this table, but still needs rendered QA. These rules apply to the real platform; a native app does not need a browser reconstruction to prove its behavior.

## Write the state table before code

Write one row for each outcome the changed path can reach. Use `DESIGN.md` section 5 when it is the implementation contract, or the change description or existing brief otherwise. Use the requirement or an agreed product rule to set the expected result, not the current build's behavior.

| State and what decides it | What the user sees | Next action offered | Requests or effects that run | Must not show or run | Leaves by |
|---|---|---|---|---|---|
| Unknown: first read pending | List placeholder | None yet | One read for the selected target | "No items", count of 0, signed out | Read settles or hits its deadline |
| Unknown: read failed | Could not load items, beside the list | Retry for a retryable cause | None until retry | False empty state, old list shown as current | Retry or leave |
| Empty: read confirms no items | What belongs here and how to add the first item | Add | None | Read error or load retry | Add or leave |
| Loaded: read confirms items | Current items | Primary action | None | Old spinner or error | Refresh or select |
| Saving: submitted write still pending | Form with the user's input, save action guarded | Cancel only if safe | One write for the submitted target | Duplicate write, premature success | Write settles or hits its deadline |
| Save failed: rejection confirmed | Input and the cause beside the relevant object or field | Retry or edit | None until retry | "Saved", reset form | Edit or retry |

These rows illustrate a read/save path; pick the states that actually apply. Check for unmet prerequisites, waiting on another party, conflicts, offline or reconnecting, uncertain write results, and partial success where an action covers multiple targets. For each affected transition also list what stays and what clears, and how QA can reach and observe it.

## Keep what is true when state changes

- **Unknown is not empty, zero or signed out.** A pending or failed read has not confirmed those facts. Derive the state from the owning data or an actual response, not an initial `false`, `[]`, `0` or `null`.
- **Give the next action that fits the cause.** Name what to prepare and where for an unmet precondition, and guard only the action it prevents. When waiting on someone else, identify who acts next. A conflict should offer the existing object or its status, not false success or another identical write. A retryable error should offer a retry and preserve input.
- **Keep one owner per fact.** Header, row, badge, count and action agree on the outcome. Clear the stale spinner, error, notice or form as appropriate. A pending operation ends in success, failure, or a deadline with an explanation and a way out.
- **Protect the work in progress.** Keep server data, operation status, selection, draft input and view state separate so refetches do not reset them. Preserve focus, scroll and the working region's position unless the action requires a change. For a same-target refetch, keep prior data only when safe and distinguish it from confirmed fresh data; never display a previous target's data as the new target's.

## Route responses and effects to the right owner

- Apply a response only to its target and request generation; key caches by the target. An earlier response must not overwrite newer data or open a dialog or report an error for the target the user left.
- Guard the action in the handler, not just visually, so repeated activation while pending does not duplicate the effect. An applicable retry sends a new request only after the original request definitively failed.
- Cancellation is not undo. If an abort, timeout or lost response leaves the write outcome uncertain, reconcile through the owning read or equivalent source of truth before claiming either outcome. An optimistic rollback restores only the value that write replaced, not a later edit or confirmed value.
- Define what happens if the user leaves mid-write. On return, show the completed result or clearly report that it did not complete or is still unresolved; do not silently lose work.

## Re-entry follows the real storage and entry points

Identify which values live in memory, URL, application storage or a server. For affected cases, check reload or app restart, reopen from the normal entry point, back/forward, a cold deep link, another window/device when sync is promised, or recovery after reconnect. Restore what was saved without resurrecting discarded edits. A control that depends on connectivity should explain reconnection or unavailability rather than silently disappear.

## Trace the implementation and hand off evidence

Follow the real control from handler to local state, effect, response and render. Inspect effect cleanup and ownership (timers, subscriptions and callbacks); keyboard and pointer activation (including Enter, IME, paste or autofill when relevant); focus across rendering and dismissal; initialization, storage and restoration; and whether IDs, dates or units survive the round trip. For failures or stale state, trace the target, response handling and invalidation rather than fixing only the displayed string.

Hand the table and its preserve/clear assertions to [visual QA's behavior evidence guide](skill://visual-qa/references/behaviour-evidence.md) for H12–H19. Exercise reachable cases through normal controls on the actual build. Observe the pending state while the response really is held, settlement or failure, and a late response after a newer request when applicable. Wait for the event or state, not a fixed sleep. Reopen or read back durable effects where relevant. Identify the build, data, and any injected boundary condition; evidence for a deliberately injected failure is not proof that real persistence works.

Use the current OMP [frontend runtime](../runtime.md) or the project's supported isolated fixture or test harness. Respect the same approval boundaries in either case. Do not alter the user's live session or mutate real data merely to produce a case. Source findings are TRACED; a case exercised and observed is EXECUTED. Only executed evidence can support a rendered-behavior PASS. An applicable case that could not be observed is UNVERIFIED with the reason, not N/A.

When adding an automated regression test, put it at the lowest layer that can fail on the contract: transition logic, request wiring, or the real rendered result. For races, control completion order (start A, start B, finish B, then finish A). Show the test fails for the intended defect, not a timeout or unrelated error.
