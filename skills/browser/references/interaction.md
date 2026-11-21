# Observe, target and recover

Start with fresh `tab.observe({ compact: true })` or `ariaSnapshot`. Use numeric observe IDs through
`tab.id` and ARIA refs through `tab.ref`; neither is a CSS selector. Reacquire after navigation,
rerender, worker recovery or another snapshot. A compact observation saves output without replacing
actual page evidence.

## Escalate from a diagnosed miss

1. Prefer semantic observed elements or a precise supported selector. Confirm name, role, visibility,
   enabled state and the expected frame before input.
2. If the hit lands elsewhere, inspect the current overlay, modal, viewport and element box. A fresh
   screenshot plus `box`, `isVisible`, styles and page `document.elementFromPoint` can identify an
   obstruction. OMP has no `describeLayers` or `snapshotWithLayers` helper. Do not silently remove a
   consent banner or DOM overlay through evaluate to bypass the real flow.
3. For canvas/custom controls without a usable semantic target, use screenshot-grounded `clickAt`,
   `mouse*`, `drag` or wheel/scroll. Check coordinate scale and current viewport first. Never turn an
   inaccessible or wrong screenshot into guessed pixels.
4. For a challenge, diagnose whether the task requires an ordinary click/drag, visual interpretation
   or human login/consent. Use supported input and verify the resulting page. OMP has no built-in
   CAPTCHA solver, OCR adapter or pinned-fingerprint launcher; do not call upstream-only helpers or
   install a new engine as an automatic retry. Use [human-handoff.md](human-handoff.md) when the user
   must act.
5. If the failure is browser-level, inspect `errors`, console, the actual connection error and relevant
   process evidence. Report the diagnosed missing capability. A missing entitlement, dead extension,
   withheld access or unavailable authenticator is not fixed by speculative page code.

Two identical misses are evidence to change the hypothesis, not a reason for another identical
attempt. Follow the host's recovery bounds. A refusal is final for that operation; another engine
cannot be used to reach the same denied result.

## Coordinates and device state

Read actual CSS viewport, DPR and touch after changing device, window or page. Follow the
[screenshot point rules](commands.md#emulation-and-captures) for displayed image and CSS
coordinates. A full-page image uses page coordinates and an element capture uses an element-relative
origin; take a fresh viewport screenshot if you need viewport points. Re-observe after scrolling
or resizing. Native window geometry is not page viewport emulation.

Use `tab.devices()` and a returned device name for full mobile emulation; setting width alone can
leave a desktop user agent and touch mode. Device changes may reload the document. Restore the
required scenario before comparing captures or acting on previous refs. For a desktop capture after
a mobile preset, use a separate task-owned desktop tab. Neither `device: null` nor raw Puppeteer
viewport/UA changes reset the stored preset that OMP reapplies before each run.

## Frames and shadow roots

`await tab.frames()` lists frame IDs, names, URLs and, where available, the owning iframe selector.
Select an observed frame with `tab.frame(selectorOrNameOrUrl)` and use its scoped helpers:

```js
const frames = await tab.frames();
console.log(frames);
```

Once the actual owning selector/name/URL is known, a frame proxy supports `ariaSnapshot`, `click`,
`fill`, `type`, `press`, `text`, `html`, `value`, `attr`, `count`, `isVisible`, `evaluate`, waits and
screenshots. Inspect frame state before interaction. For nested frames, use the actual frame tree or
Chromium Puppeteer page/frame APIs inside `tab.run`.

Do not use OmOWright's merged page-level `f1e3` refs or claim that the main-frame snapshot includes
all cross-origin content. Record inaccessible/detached frames explicitly. Chromium semantic role
queries and `pierce/` can reach supported open shadow roots; closed roots and native backends are
not guaranteed. Tern and owned WebKit cannot drive frames transformed by CSS scale/rotation.

On Chrome relay, another extension's inline frame (for example a password manager popup) can
block the debugger. OMP can empty and hide that frame in the driven tab, for the user as well, and
report the extension and frame in the current or a later call. If reported, tell the user what was
hidden. Its content is gone and no offered action there was taken; do not re-create the frame,
claim consent or claim that a credential/autofill choice was made. Re-observe before continuing
ordinary page work and hand off extension-dependent steps to the user if necessary.

## DOM work and scroll collection

Prefer authorized passive response JSON for structured lists; see [network.md](network.md). Use
page `evaluate` for reading computed style, layout and rendered data when that is the evidence
needed. Do not submit by calling an internal API and then claim the visible button flow passed.
Use the actual scroll owner, not always the window; record top/end state and any pagination token.
Bound collection by the task's required count, actual exhaustion and a declared operation allowance.
No fixed sleep, unbounded scroll or new worker is needed for a short pixel loop.

## Files and extension UI

Use `uploadFile` only for the authorized file and observed file input; selecting a file is not proof
of server upload. Use a `tab.run` to start `tab.waitForDownload()` before clicking export, then
verify the returned downloaded path. Do not enumerate unrelated local files or the user's downloads.

A Chrome extension popup or browser chrome is not necessarily a normal inspectable page. Use
`browser.targets` only for targets the native API actually exposes; a missing popup target is a
capability gap. Native UI uses `computer-use` under host authorization, with
fresh window state. Do not fabricate `chrome-extension://` URLs, force security settings or replace
an explicit user cancellation with another transport.

## Native windows and pickers

In OMP 19.1, a browser call can report a native popup/list, floating panel or dialog that opened
during or after the call. It is outside the page; use `tab.select` for the underlying HTML
`<select>` or `tab.fill` with the control's supported value for a page color/date picker, then
verify through the page. A native print, save, sign-in, passkey or permission dialog is not a
JavaScript `tab.dialog()`. When the browser report exposes a window ID and says it is listed,
`computer.window(observedId)` targets it; otherwise the report may point to `computer.screenshot()`
for inspection. Follow `skill://computer-use` and host routing/approvals for any native
inspection or action. No reported dialog, window ID or permission prompt is authorization to
accept it. If the required native surface cannot be used, hand it back to the user.
