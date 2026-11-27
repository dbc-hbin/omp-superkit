# omp-superkit

English | [한국어](README.ko.md) | [简体中文](README.zh-CN.md)

Model-specific prompts, code mode and SUPER workflows for [Oh My Pi (OMP)](https://github.com/can1357/oh-my-pi). OMP retains control of tools, permissions and execution; this extension adapts working methods and adds planning, research and specialist skills.

## Getting started

With Git, Bun and OMP installed:

```bash
git clone --recurse-submodules https://github.com/dbc-hbin/omp-superkit.git
bun ./omp-superkit/upstream/materialize-frontend-refs.mjs
omp -e ./omp-superkit
```

In the interactive TUI, enter `/super <task>` or `super <task>` to activate SUPER. It starts an OMP-native goal if continuation isn't stopped and there is no existing goal to preserve. Existing goals, including paused or budget-limited ones, are preserved. RPC clients must create native goals separately.

Commands must start the input; mentions such as `Explain /super` do not activate them. Plain SUPER does not automatically select a specialized workflow, and specialized commands do not start a separate plain native goal. Restart OMP after changing the installed extension.

## Workflows and skills

| Command | Purpose | Default OMP keyword |
| --- | --- | --- |
| `/super` | Activate SUPER for the session | — |
| `/super-plan` | Create a reviewed plan without implementation | `ultrathink` |
| `/super-run` | Execute and track a plan | `orchestrate` |
| `/super-loop` | Track goals, dependencies and evidence | `orchestrate` |
| `/super-graph` | Execute a persistent dependency graph | `workflowz` |
| `/super-research` | Research with sources and counterarguments | `workflowz` |

All commands in the table also work without the leading `/`. Canonical skill IDs now match these command names. Old invocations and published entry paths remain available for compatibility. CLI flags and saved session, goal and workflow data need no migration.

Use `/stop-continuation` to pause automatic SUPER continuation for the current session without deleting its plan or evidence. Use `/resume-continuation` to re-enable eligible work. These commands do not cancel running workers. In the TUI they can also pause the native goal created by this session's plain SUPER invocation (including a legacy alias) and resume only the goal they paused; they do not take over an unrelated goal. If OMP reports the native goal is busy, automatic SUPER continuation is stopped but the goal has not been paused. To pause it too, run `/stop-continuation` again when idle. RPC clients control native goals separately through the goal API.

Specialized commands add their default keyword unless one is already specified, respecting OMP's keyword settings and tool requirements. For RPC, use `prompt` with the appropriate `streamingBehavior`; separate `steer` and `follow_up` requests bypass keyword processing. Direct `/skill:` calls still use the installed skill IDs. Those calls and initial CLI text need an explicit keyword when they bypass the input hook.

Other entry points:

- **Code and review:** `/debugging`, `/programming`, `/review-work`, `/ast-grep`, `/lsp-setup`, `/refactor`
- **UI and evaluation:** `/frontend`, `/visual-qa`, `/visualize`, `/data-scientist`, `/eval-integrity`
- **Browser and desktop:** `/web-browser`, `/ultimate-browsing`, `/computer-use` use OMP's native Eval APIs and permissions; OMP's `/browser` and `/computer` controls remain intact.
- **Sessions and memory:** `/coding-agent-sessions`, `/init-deep`, `/reflection`, `/memory-advisor`

See [skills/](skills/) for individual instructions. Cross-product session discovery requires Python 3.11+; OMP session history and recaps use native Eval `archive`.

## Prompts and code mode

Superkit ships its own model profiles and applies them independently to main and supported child sessions. Specialist roles, project instructions, permissions and completion protocols remain intact. Custom templates and unsupported models retain native behavior. Explicit investigation and planning-only requests temporarily suppress prewalk; implementation requests restore only overrides owned by this extension.

Gemini keeps its native role. When a request offers Eval, Superkit recommends it for ordinary bridge calls, even for one call and even when the same tool is listed directly. Requests without Eval keep their native routes. Custom roles and resumed workers keep their own instructions. Superkit does not hide tool declarations or copy their schemas into another catalog.

- Use JavaScript by default. Use Python for Python libraries, APIs or existing kernel state, or when JS is unavailable. Call tools with `await tool["name"](args)` and use `tool.bash` to look up mounted command help.
- Launch asynchronous workers through `tool.task`. Use direct `task` for blocking workers to preserve usage accounting. Keep Prewalk's handoff, approvals, waits, session control and attachments on their native routes. Run mounted `propose`, `resolve` and `reject` through outer `bash`, never Eval.
- Independent reads, searches and lookups can run in parallel; mutations, approvals, waits and dependent calls remain sequential.

**Code mode is model-facing guidance, not a sandbox or an execution security boundary.**

Implementation: [model adaptation](presets.ts), [code mode](code-mode.ts), [session integration](index.ts), [native guidance](host-guidance.ts).

## Updates and tests

After pulling an update, regenerate frontend references from the pinned submodules:

```bash
git submodule update --init --recursive
bun upstream/materialize-frontend-refs.mjs
```

A GitHub source archive omits submodules and generated references. For deployment without Git, copy the complete materialized `skills/` tree. Initialization and upstream updates need network access; reference generation is local.

Edit model templates directly in [prompts/models/](prompts/models/), including the [GPT‑6.2 Astra/Sol template](prompts/models/gpt-6.2.ts). [Model routing](prompts/models/model-routing.js) handles aliases, and [presets.ts](presets.ts) combines the templates with active OMP tool and session guidance. Presets are no longer fetched or generated from OMO or Senpi.

```bash
bun test
bun run typecheck
bun run test:host
```

Host checks use the installed OMP with isolated state and a scripted local provider. They verify integration and transport, not external model obedience.

## Attribution

The original preset source is credited in the [catalog](prompts/models/catalog.js) and its [MIT license](prompts/models/LICENSE). Skill sources and licenses are recorded in their attribution files.
