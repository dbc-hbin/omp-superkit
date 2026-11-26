---
name: programming
description: "Applies strict, modern language practice (typed errors, exhaustive match, tests that can fail) for Python, Rust, TypeScript, JavaScript, and Go. Use for work on .py, .rs, .ts, .js, or .go files, and whenever a test or spec file is written, reshaped, reviewed, or deleted: the four-question test authoring gate and the junk-test classes live here."
---

# Programming

**You own this code.** Fit new behavior into the structure that is there and leave no duplicate or dead code behind. Fix defects at their root in the code you are changing; report defects elsewhere rather than widening the change.

## Before writing: load the matching references

Read the language README and the references it names for the work **before editing**. Each README owns that language's hard rules, library defaults, toolchain, scaffolder, and CI gate. Existing project choices take precedence over defaults. One-off scripts follow the same rules.

Before changing production behavior, read the existing tests that cover it, even if no test file needs editing.

Resolve these resources with `read` using `skill://programming/<relative-path>`, not the project working directory. For bundled commands, set `SKILL_DIR` to the observed absolute directory of this `SKILL.md` (OMP does not set it). Run them from the audited project's directory, using paths rooted at `$SKILL_DIR` for the scripts.

| Touching | Read |
|---|---|
| Python (`.py`, `.pyi`, `pyproject.toml`) | [Python README](references/python/README.md) |
| Rust (`.rs`, `Cargo.toml`) | [Rust README](references/rust/README.md). For `unsafe`, `*mut`, `*const`, `MaybeUninit`, FFI, `unsafe impl Send/Sync`, or a custom lock-free primitive, also read every file in [`references/rust-ub/`](references/rust-ub/README.md). |
| TypeScript / JavaScript (`.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`, `package.json`, TS/OXC configs) | [TypeScript / JavaScript README](references/typescript/README.md) |
| Go (`.go`, `go.mod`, `go.sum`, `.golangci.yml`, `Taskfile.yml`, `buf.yaml`, `sqlc.yaml`, or codegen inputs such as `*.proto` next to a Go module) | [Go README](references/go/README.md) |
| A test or spec file, or a change that adds, reshapes, reviews, or deletes a test | The language README plus the [four-question authoring gate](references/testing/README.md) and [junk-test classes](references/testing/junk-classes.md). |
| Log lines, logger setup, a new service entry point, or an error boundary | [Logging](references/logging.md). Use only the project's designated logger; don't introduce logging to a project that doesn't log. |

**Rendered UI.** Changes to an actual rendered web or native UI, including visible copy, layout, accessibility, or user-facing behavior, also require `skill://frontend` before the edit. It selects the platform workflow and hands off to `skill://visual-qa` on the real rendered surface. A `.tsx` or `.ts` suffix, a UI folder, or a behavior-preserving refactor does not by itself trigger these rules. Static changes still need rendered QA, not an async state table. Terminal UIs use their terminal workflow and `skill://visual-qa`, not web design rules.

## Shared axioms

0. **Write only what needs to exist.** Trace the real flow first. Prefer no new code, then reuse code already in the project, the standard library, a native platform feature, or an installed dependency. Otherwise write the minimum; don't abstract a one-off operation. Inspect all relevant callers and fix their shared cause once rather than adding a guard at each caller.
1. **Give each design decision one owner.** A module earns its boundary by hiding a format, protocol, storage layout, or policy behind a smaller interface. A change to that decision should touch its owner, not every caller. Remove pass-through layers and split along the decisions the pieces hide, not along arbitrary line counts or execution order.
2. **Decisions in the core, effects at the edge.** Let domain logic take and return values. Keep I/O at the edge, where you also read time, randomness, and the environment. Pass in what the core needs. Dependencies point from the edge toward the domain, not the other way around, so domain tests don't need mocks.
3. **Use types as proofs.** Make illegal states unrepresentable. Give distinct domain units distinct types so the checker cannot mix a user ID with an order ID or seconds with milliseconds. Match tagged variants exhaustively with the language's compiler or linter, not a fall-through `if`/`else` chain.
4. **Parse once, at the boundary.** Inside, consume the typed value and trust the contract. Don't revalidate, check for an impossible null, catch an impossible error, or cast or suppress to conceal a missing type contract.
5. **Make state, failure, and resource lifetimes explicit.** Default to immutable data and treat parameters as inputs. Use typed errors, catch them only where handled or at a top-level boundary, and never swallow them. Release resources by scope; make concurrency structured and cancellable. Configure client timeouts and pool limits, and define schemas for parsed inputs rather than relying on bare defaults.
6. **Only tests that can fail count.** Reproduce a defect before fixing it when practical. Add a test only where the repository keeps coverage for the behavior and a credible regression would otherwise pass unnoticed. Keep one owner at the strongest real boundary and answer the [authoring gate](references/testing/README.md#before-writing-the-authoring-gate) before adding or reshaping a test. A test red on the unchanged base is a finding; don't delete or weaken it to unblock a run.

## Code smells

Use the [code-smell reference](references/code-smells.md) for rationale, measurement, exception markers, and split examples. Stop and fix these or give a specific reason for carrying one:

- **Oversized source:** 200–250 pure lines (nonblank, noncomment) is the warning band; report it and propose a split if the next edit will add lines. More than 250 is a defect: split the touched unit before adding lines, except for rare indivisible units or pure data tables. Name the owning decision; don't split at a line count.
- **Parameter bloat:** More than three parameters, including arguments hidden in an untyped map, variadic list, or throwaway options object. Group related inputs in a typed domain value; justify genuinely independent inputs.
- **Redundant verification:** Don't re-read after a delete, write, insert, or setter to prove what the operation already guarantees. If it can fail silently, fix its contract. This is not a substitute for verifying the task at the real boundary.
- **Negative naming:** Name what is true (`isValid`, `canProceed`) instead of what is absent. Negation still fits guards and filters when that is the intent.

## Dependency upgrades

- Treat a `0.x` minor bump as breaking. Read the changelog and use the project's build and upgrade test gate before trusting it.
- Find the old version outside the manifest too: Dockerfiles, CI workflows, and docs can pin it separately.
- Never hand-merge a lockfile. Take one side whole and regenerate with the package manager.

## After writing: review before claiming done

1. **Measure each changed source file.** Use the language checker if it counts pure lines of code; otherwise use the [size measurement guide](references/code-smells.md#measuring-pure-loc). A passing rule audit without a line count is not a size check.
2. **Review the diff against the axioms, smells, and applicable diagnostics**, including the [logging rules](references/logging.md) if you touched logging or error handling. Report the checks and any specific exception you carried. If a smell fires or the review finds more than two issues, load `skill://refactor` and use its safe-refactor protocol; don't improvise a structural change. For branch-scope AI-generated patterns or explicit de-slop work, load `skill://remove-ai-slops`.
3. **Review every changed test** against the [junk-test classes](references/testing/junk-classes.md). From the project directory run `bun run "$SKILL_DIR/scripts/typescript/check-test-junk.ts" <changed test files>` for the classes it can detect in any language. For tests added or reshaped, [break their production owner](references/testing/README.md#after-writing-test-your-test), observe the intended failure, then restore it byte for byte. Fix failures before claiming done; never weaken a test to pass.

Modified for OMP: the rendered-UI routing adapts [OMO v5.1.83 programming](https://github.com/code-yeongyu/oh-my-openagent/blob/69a1863a457da06fb64ae788e335bf272f1df406/packages/shared-skills/skills/programming/SKILL.md). The compact core and language-reference updates adapt [OMO PR #15043](https://github.com/code-yeongyu/oh-my-openagent/pull/15043) at [`bebc53af`](https://github.com/code-yeongyu/oh-my-openagent/blob/bebc53af3b2d6b988a995f25789f61c92490a36a/packages/shared-skills/skills/programming/SKILL.md). The upstream [Sustainable Use License 1.0 terms](../browser/LICENSE.md) are included in this distribution.
