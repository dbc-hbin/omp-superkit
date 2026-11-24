# Behaviour evidence: state and flow

This procedure supports H12–H19 in `skill://visual-qa`. Screenshots show what was painted; they do not by themselves tell you whether a request was sent once, a value survived reload, or a late answer reached the right target.

## Scope the case list

Use the `frontend` [state table](skill://frontend/references/perfection/state-and-flow.md): what decides the state, what the user sees, the next action, what requests run, what must not show or run, and how the state ends. Use the table, explicit requirements, or an established product rule as the oracle for expected outcomes, not the current implementation. If an applicable expectation is genuinely undecided, name the decision and mark it UNVERIFIED.

| Changed path | Cases to consider |
|---|---|
| Read: list, detail, status or count | Held and Failed (H12–H14, H18 where the working region can reset); Switch when the target can change (H15). |
| Write: save, send, delete, sign in or rename | Held and Failed (H13–H14), Twice and leave mid-flight (H17), Re-entry when the result should persist (H16), preserve/clear checks (H18). Add Switch if the write can settle on another target. |
| User-visible precondition | Exercise the unmet and met conditions and the normal recovery action; verify the guarded effect does not run early and the next step is findable (H13, H17, H19 as applicable). |
| Persisted or restored state: session, draft, selection, layout or scroll | Re-entry (H16); preserve/clear checks (H18). |
| Multi-step flow: onboarding, pairing, checkout or a wizard | First-use walk (H19), supported re-entry at the affected steps (H16), and Held/Failed/Twice/Switch where the changed step exposes those paths. |
| Copy or style only, with no change to the user path or state contract | No H12–H19 case added for that change. Give the scope reason; keep the existing applicable visual QA. |

Map each applicable item to the cases needed for the actual change and affected consumers. Name material inapplicable variants and why (e.g. no switchable target). Being unable to reproduce a reachable state does not make it inapplicable.

## Drive and capture the real path

Use observed browser controls through `skill://browser` and `skill://visual-qa/references/browser-setup.md`, native controls via `skill://computer-use`, or the actual terminal and PTY. Start from the entry point a person uses. A typed URL in place of a click, forced click, scripted DOM event, injected app state, or direct API call is not evidence that the skipped path works. A cold deep link is valid when that entry point is itself under test. Keep diagnostic bypasses separate.

For each case record the client and revision (installed package or dev build), backend/data (real, seeded, or mocked), test boundary if any, steps, and evidence paths:

1. **Observed state and pixels:** intended build, page, theme and control; labels, count, selection, enabled state, inputs, focus, notices, and what the user can actually see. A locator's `visible` flag is not proof against occlusion, transparency or off-viewport rendering. Inspect the current region in the capture and check geometry/occlusion when relevant.
2. **Observed effects:** request or command count, method/action, target and outcome; include authoritative persisted readback where relevant. A success message is not readback. Record `none` only when the observation can establish no effect; if the relevant log was unavailable, name the gap.
3. **Source trace, if useful:** file/symbol and what it suggests. Label it TRACED, apart from observed behavior. Discard product conclusions from a wrong, stale, blank or unpainted frame; tag the frame as an `[evidence]` defect and replace it.

Wait for the request or user-visible postcondition with a bounded deadline, not a fixed delay. Do not loosen a locator, threshold or expected result to make a check pass. If a retry passes after a failure, keep the first frame and log. If adding a behavior regression test, verify against the fault in an isolated copy as well as against the clean and restored builds; an unrelated timeout is not detection.

## Held, Failed and Switch

- **Held:** arrange an explicit test-side release signal, trigger the real control, and wait until the targeted request is confirmed held. While held, capture the pending state and the keep/clear assertions below. Release the request and wait for the expected settled state before capturing again. If the deadline path is required, keep the request held until the expected deadline output and escape action appear; release in cleanup.
- **Failed:** exercise the expected failure or dropped response on the same real path. Capture the post-failure state and recovery. A failed read must not look like a successful empty result; a successful retry must clear the previous error.
- **Switch:** hold A, switch to B through the actual control, let B settle, then release A. Verify that B keeps its data, selection and controls, with no dialog, notice or error from A. Record request targets and completion order.

Use the project's controllable test server or a task-owned test boundary where permitted. On an authorized test-owned Chromium tab, the native Eval browser's `tab.run` exposes Puppeteer's `page.setRequestInterception` and `page.on("request")` (see `help://eval/browser`). Scope any manual interception to the intended request, confirm the intercept before capture, pass unrelated requests through, and release or abort held requests in that run's cleanup. The native `tab.route` is declarative and does not accept a release handler. For backends without manual interception, a task-owned test server can wait for the explicit signal if the real client supports that endpoint; do not add production hooks only for QA. If a service worker, transport, backend or permission prevents the intended hold/failure, record UNVERIFIED instead of treating an idle frame as pending. Never intercept shared/live traffic to manufacture evidence.

### Keep and clear

Read before the action, while held, and after settlement: matching endpoints can hide a jump. On web, read selection and field value, `document.activeElement`, the actual scroller's `scrollTop` and the working region's `getBoundingClientRect()` without altering application state. For native and terminal surfaces use the real focus, selection and geometry sources.

- **Keep** the selection, typed input, focus, scroll and working region specified by the table. Movement explicitly caused by the user can be correct; still verify it does not discard other state.
- **Clear** indicators or notices from the previous state when specified. Check that a stale form does not reopen on a late answer, a previous error is gone after a successful retry, and the pending indicator is actually gone after settlement.

## Re-entry, Twice and first use

- **Re-entry:** after the action settles, return via the supported paths: reload/restart, close and reopen from the ordinary entry point, back/forward, cold deep link, or a second window/device if sync is in scope. Verify the state, controls and readback against the table. A discarded draft must not reappear. Do not simulate persistence by restoring browser state through the tool.
- **Twice and leaving:** repeat the real action while it is held and check that no duplicate side effect occurs. If the second attempt is refused, the product should explain why when appropriate; retry after the refusal must create a new attempt. Leave mid-flight and return: the result completed or the UI communicates that it did not complete or still needs reconciliation; silent loss is a defect.
- **First-use walk:** for each changed step note the first control that appears to be right, where it is, what its label leads you to expect, and how the interface signals the outcome. A dead row or a result visible only after an undisclosed action is a finding. This is a walkthrough, not a user study: do not invent user reactions or rates.

## Normalize the evidence for Pass A

For each applicable H12–H19 checklist item in `verdict-schema.json`, give each applicable assertion a `behaviour` case with a `scenario` identifying the table row or capture-manifest entry, and a `claim` of `condition` or `success`. Split combined cases when the evidence differs, e.g. pending feedback versus successful save:

- **EXECUTED** (`execution`): artifacts from actions actually run and observed on the real client. `basis: real-path` is the actual user path to the claimed result, using the real implementation and seeded or otherwise authorized data. `basis: injected-condition` can prove what the real client did under the controlled hold/failure/out-of-order condition, not that a write/read succeeded. For a success answered by a fixture or mock use `basis: stubbed-success` and leave real success UNVERIFIED. Releasing a hold and letting the original real request complete can support a separate `real-path` success assertion when the real outcome is observed and read back as applicable.
- **TRACED** (`traced`): separate source pointers from a read of the implementation. A trace alone proves neither rendered PASS nor rendered FAIL; report source defects separately from case observations.
- **UNVERIFIED** (`gap`): explain what is missing and why, name a `verifier`, and set `resolution` to `NEEDS WORK` when the task executor can still obtain the evidence in this authorized environment (even if the read-only reviewer cannot), or `NEEDS HUMAN REVIEW` when it needs a prerequisite beyond that environment. Include any partial EXECUTED evidence and separate source trace. Only mark a checklist item N/A if no case applies, with the scope reason. A missing required capture outside H12–H19 uses the checklist item's own `gap`.

## Approvals and cleanup

Use task-owned data and test endpoints. Respect host and project approvals, refusal-final rules, and the user's session ownership; this procedure does not authorize sending, publishing, payment, deletion, permission changes or navigation of a borrowed session. If a consequential step lacks authorization, stop before it and mark that condition UNVERIFIED; do not substitute a different route after a refusal. Redact private data from evidence. Release held requests and stop only the tabs, servers and fixtures owned by the task according to their lifecycle and approval rules.
