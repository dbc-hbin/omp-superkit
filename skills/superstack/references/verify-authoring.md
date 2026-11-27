# Author or maintain a live verification method

“Verify this CLI” asks for a one-off run on the current behavior. Use the appropriate real-surface tools, or `skill://review-work` for an explicit completed-work gate; do not create or revise a skill. Use this reference only when asked to create or maintain a reusable project verification skill or guide. Formal properties belong to [formal checks](formal-check.md).

## Create the method

1. Read the project's documented launch path, build and runtime configuration, and entry points for the real user surface. Recover actual prerequisites, readiness signals, data/auth setup, and the approved way to isolate a run. Reuse an existing browser, terminal/PTY, desktop, HTTP, or public API harness when it reaches that surface. Don't drive someone else's session or substitute a live service where a safe isolated one is required.
2. Use [the skill drafting contract](skill-authoring.md#draft-and-validate) for frontmatter and references. Write only to the authorized project skill location or requested draft path; reuse the project's established location if the host supports it. If the location or run permission is unavailable, return an editable proposal, the exact blocker, and what remains unverified.
3. Document the full path from an empty, isolated state. Include exact startup and seeding commands, and a read-only readiness check that establishes the intended build, instance ownership, and usable prerequisites—not just a responding port. A short-lived CLI may instead start in a fresh isolated directory or PTY for each check. Specify stable ways to drive the real user path and the observable success or failure for each action. Read back relevant side effects as well as visible output; do not replace the feature with an internal setter or infer a dry-run's safety from its name. Describe which instance, ports, profiles, and scratch data the run owns and how to tear them down on success or failure. Do not tear down resources the run did not create.
4. Give the next executor a small feature map, starting with requested or primary journeys. For each, name the user entry point, prerequisites, commands or selectors, expected result, and known traps. Reuse the existing map structure when present. If the method ships its own helper, document its actual invocation. Record the build or revision, action, expected and observed results, and any limits in evidence stored outside disposable runtime state. Keep sensitive values out of retained records.
5. Follow the written method from empty state for at least one mapped journey on the real surface: start, confirm readiness, drive, observe, capture, and clean up. After cleanup, confirm the named evidence is still accessible. Clean up failed attempts too. A walkthrough against a stand-in does not prove the real target; state the setup and behavior it did not cover. If the real run cannot finish or the evidence is missing after teardown, report a draft and the blocker, not a completed method.

## Maintain the method

Locate the requested project guide and its owned helpers and feature map. Compare each in-scope entry with current source and entry points; include renamed, missing, or dead entries where source supports them. Drive each in-scope feature at least once even if source appears unchanged. Check readiness before each fresh instance and after unexpected behavior; return to a known state before trying the next journey. Re-run corrected steps and preserve evidence through cleanup as above.

- **Guide drift:** the current, intended behavior works, but an instruction or expected result is stale. Update the guide from the observed behavior and its supporting contract, not just from a new error message.
- **Harness gap:** the feature works through the supported user path, but the harness cannot drive or observe it. Correct the owned harness and prove the corrected path.
- **Product defect:** the actual user path violates the intended contract. Report the failing path, expected and observed behavior, and retained evidence. Do not rewrite the guide to treat the failure as success or change product code.

Report **clean** when all in-scope journeys were checked in source and live and no method corrections are needed; leave the tree unchanged. Report **changed** when authorized guide, map, or harness corrections were made and proved, naming the changed paths and evidence. Report **blocked** when required coverage, proof, or a safe authorized edit could not be completed; give the exact blocker, completed coverage, and any confirmed findings without claiming the rest passed. A product failure can block a journey without showing that the guide is stale.

Keep changes to authorized verification files. No dependency installs, managed skill changes, product fixes, or PRs as part of this procedure.

See [attribution](../ATTRIBUTION.md) for source workflows.
