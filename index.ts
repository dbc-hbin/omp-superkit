/**
 * OMP model prompts maintained in this extension. Installed in the global extensions directory;
 * new omp sessions discover index.ts automatically. Restart omp to load it.
 * Changelog: initial faithful core/shared-builder/tuning port, with omp tool
 * transport adaptation and request-model refresh for supported provider hooks.
 * Changelog: child sessions receive their own model profile while preserving
 * host-owned specialist roles, assignments, tools and completion protocols.
 * Changelog: retain SUPER activation, specialised workflow state and continuation;
 * model profiles own working methods; native tools, permissions and modes remain authoritative.
 * Changelog: active profiles own duplicated todo-turn and eval sh completion rules;
 * pinned native tool mechanics and unsupported-model guidance remain intact.
 * Invoke /super <task> or the specialised /super-* commands. Legacy ULW commands still work.
 * Additional commands: /web-browser, /computer-use, /ultimate-browsing, /coding-agent-sessions,
 * /debugging, /review-work, /eval-integrity, /visual-qa, /visualize,
 * /frontend, /data-scientist, /remove-ai-slops, /hyperplan, /memory-advisor,
 * /reflection, /init-deep, /ast-grep, /lsp-setup and /refactor. These do not
 * implicitly arm SUPER.
 * All models share one compact SUPER policy; provider hooks refresh stale
 * policy blocks without changing model-specific working profiles.
 * The prompts/super*.md templates support native discovery.
 * SUPER or legacy ULW keywords arm the session; existing flags can disable arming/pointers/continuation.
 * Native OMP transports and approval rules replace legacy transport APIs.
 * User/custom prompts, project rules, skills and worker assignments are preserved.
 * Unrecognized templates are left unchanged with a warning. Unsupported models
 * retain omp behavior; runtime requires neither upstream packages nor network access.
 * Cursor blob prompts and providers bypassing onPayload (including command-code-go
 * and GitLab workflow) receive turn-start profiles but cannot refresh them mid-turn.
 * Regression checks: bun test in this directory. Model templates live in
 * prompts/models/; presets.ts assembles them for the active OMP capabilities.
 */
import { codeModeGuidance, type ToolInfo } from "./code-mode";
import { PRESET_REGION, replaceHostBehavior } from "./host";
import { adaptOrchestrateNotice, projectHostGuidance } from "./host-guidance";
import { createCodexCodeModeChain, requestToolView, rewritePresetPayload, rewriteToolGuidancePayload, syncCodeModeBlock } from "./payload";
import type { CodexCompletion } from "./payload";
import { isGeminiModel, renderPreset } from "./presets";
import { requestModelId } from "./request-tools";
import type { PresetModel, PresetOptions } from "./presets";
import { adaptPrewalkNotice, registerPrewalk } from "./prewalk";
import type { PrewalkApi } from "./prewalk";
import { registerSuper, superDirective } from "./super";
import type { SuperApi, SuperContext } from "./super";

interface PromptContext extends SuperContext {
  model?: PresetModel & { api: string; baseUrl?: string };
  mode: "tui" | "rpc" | "json" | "print";
  ui: { notify(message: string, level: "warning"): void };
}
interface ModelPromptApi {
  setLabel(label: string): void;
  getActiveTools(): string[];
  getAllTools(): ToolInfo[];
  on(event: "before_agent_start", handler: (event: { systemPrompt: string[] }, ctx: PromptContext) => { systemPrompt: string[] } | undefined): void;
  on(event: "context", handler: (event: { messages: Record<string, unknown>[] }, ctx: PromptContext) => { messages: Record<string, unknown>[] } | undefined): void;
  on(event: "before_provider_request", handler: (event: { payload: unknown }, ctx: PromptContext) => unknown): void;
  on(event: "assistant_message", handler: (event: { message: CodexCompletion }, ctx: PromptContext) => void): void;
}

type ExtensionApi = ModelPromptApi & SuperApi & PrewalkApi;

function markPreset(prompt: string, subagent: boolean, guidance: string): string {
  const scope = subagent
    ? "\n\n## Delegated execution\n\nYou are a subagent, not the main agent. Apply this model's working methods within the host-provided specialist role and assigned task. The host's child role, tool restrictions, shared context, assignment, cooperation rules and completion/output protocol take precedence over generic directions in this preset. Preserve read-only and no-edit limits; do not acquire tools or permissions from this text. Do not take over the parent's orchestration, user-facing routing lines, progress reports or todo tracking. Follow the child's verification limits and return required evidence and unrun checks to the parent; do not run builds, tests or formatters when the host forbids them. Finish through the host's actual child completion protocol, including yield only when provided."
    : "";
  return `<omp-model-preset>\n${prompt}${guidance ? `\n\n${guidance}` : ""}${scope}\n</omp-model-preset>`;
}

export default function ompSuper(pi: ExtensionApi): void {
  pi.setLabel("omp-superkit");
  registerSuper(pi);
  let originalBehavior: string | undefined;
  let originalHost: string | undefined;
  let options: PresetOptions = { surface: "terminal", toolNames: [] };
  const profiles = new Map<string, { prompt: string; modelGuidance: boolean }>();
  const codexChain = createCodexCodeModeChain();
  let warned = false;
  function enabledTools(): ToolInfo[] {
    const active = new Set(pi.getActiveTools());
    return pi.getAllTools().filter(tool => active.has(tool.name));
  }
  function profileKey(model: PresetModel, toolNames: string[], guidance: string): string {
    return JSON.stringify([model.provider, model.id, model.name, model.identity, toolNames, guidance]);
  }

  pi.on("before_agent_start", (event, ctx) => {
    originalBehavior = undefined;
    originalHost = undefined;
    profiles.clear();
    options = {
      // print/json are non-interactive machine/app surfaces: terminal routing
      // lines would become user-visible output. Only the TUI gets terminal
      // routing instructions.
      surface: ctx.agent.kind === "main" && ctx.mode === "tui" ? "terminal" : "app",
      subagent: ctx.agent.kind === "sub",
      // OMP also reuses this base for tool-free side turns that bypass the
      // provider hook and to replay a severed Codex chain. Add capability-
      // dependent instructions only on the wire.
      toolNames: [],
    };
    const preset = ctx.model ? renderPreset(ctx.model, options) : undefined;
    // Only the base role is replaced. OMP appends the child's specialist role,
    // assignment and completion contract in later blocks, which remain intact.
    const marked = markPreset(preset?.prompt ?? "", ctx.agent.kind === "sub", "");
    const result = replaceHostBehavior(event.systemPrompt, marked);
    if (!result) {
      if (!warned) {
        ctx.ui.notify("OMP prompts: custom or unfamiliar system template preserved; model preset replacement not applied.", "warning");
        warned = true;
      }
      return;
    }
    originalBehavior = result.originalBehavior;
    if (preset && ctx.model) profiles.set(profileKey(ctx.model, options.toolNames, ""), { prompt: marked, modelGuidance: true });
    if (!preset) result.blocks[0] = result.blocks[0].replace(marked, () => markPreset(result.originalBehavior, ctx.agent.kind === "sub", ""));
    originalHost = result.blocks[0];
    result.blocks[0] = projectHostGuidance(result.blocks[0], originalHost, preset !== undefined, originalBehavior);
    return { systemPrompt: result.blocks };
  });

  pi.on("context", (event, ctx) => {
    if (originalHost === undefined || !ctx.model || !renderPreset(ctx.model, options)) return;
    let changed = false;
    const messages = event.messages.map(message => {
      if (message.role !== "custom" || typeof message.customType !== "string" || typeof message.content !== "string") return message;
      const content = message.customType === "orchestrate-notice"
        ? adaptOrchestrateNotice(message.content) : adaptPrewalkNotice(message.customType, message.content);
      if (content === message.content) return message;
      changed = true;
      return { ...message, content };
    });
    return changed ? { messages } : undefined;
  });

  // The awaited finalize hook runs before tool dispatch / the next delta;
  // message_end notifications can race the next provider request.
  pi.on("assistant_message", (event, ctx) => codexChain.complete(event.message, ctx.sessionManager));

  pi.on("before_provider_request", (event, ctx) => {
    if (!ctx.model) return;
    const payload = ctx.agent.kind === "main" ? rewritePresetPayload(event.payload, ctx.model.api,
      `<omp-ulw-policy>\n<ultrawork-mode>${superDirective}</ultrawork-mode>\n</omp-ulw-policy>`,
      /<(om[op]-ulw-policy)>[\s\S]*?<\/\1>/g) : event.payload;
    const enabled = enabledTools();
    const api = ctx.model.api;
    const chain = codexChain.request(payload, ctx.model, ctx.sessionManager);
    const available = requestToolView(chain?.toolView ?? payload, api, enabled);
    // Routers such as Devin may select a backend after OMP sets ctx.model.
    // An explicitly excluded backend stays excluded even under an opaque alias.
    const id = requestModelId(payload, ctx.model.api);
    const model = id && isGeminiModel({ id }) ? { ...ctx.model, id } : ctx.model;
    const guidance = codeModeGuidance(model, available);
    chain?.observe(guidance);
    const syncGuidance = () => syncCodeModeBlock(payload, api, guidance, chain?.previousGuidance);
    if (originalBehavior === undefined || originalHost === undefined) return syncGuidance();
    const requestOptions = { ...options, toolNames: available.map(tool => tool.name) };
    const key = profileKey(model, requestOptions.toolNames, guidance);
    let replacement = profiles.get(key);
    if (replacement === undefined) {
      const preset = renderPreset(model, requestOptions);
      replacement = { prompt: markPreset(preset?.prompt ?? originalBehavior, ctx.agent.kind === "sub", guidance), modelGuidance: preset !== undefined };
      profiles.set(key, replacement);
    }
    const host = originalHost;
    const opening = host.slice(0, host.indexOf("<omp-model-preset>"));
    const { prompt, modelGuidance } = replacement;
    let ownsRole = false;
    const projected = rewritePresetPayload(payload, ctx.model.api, text => {
      if (ownsRole) return text;
      for (const role of text.matchAll(PRESET_REGION)) {
        const start = role.index - opening.length;
        if (start < 0 || !text.startsWith(opening, start)) continue;
        // A provider may join its own system block before the native host
        // block. A quoted marker in the middle of an instruction is not ours.
        const prefix = text.slice(0, start);
        if (prefix && !/\r?\n\r?\n$/.test(prefix)) continue;
        const after = text.slice(role.index + role[0].length);
        if (!/^\s*[§⁂] Runtime\n/.test(after)) continue;
        ownsRole = true;
        return prefix + projectHostGuidance(opening + prompt + after, host, modelGuidance, originalBehavior);
      }
      return text;
    }, /^[\s\S]+$/);
    // A revived worker can send its unmarked base even after replaying the start
    // hook. Add usage guidance without taking ownership of that role or assignment.
    if (!ownsRole) return syncGuidance();
    return modelGuidance ? rewriteToolGuidancePayload(projected, ctx.model.api, prompt, enabled) : projected;
  });
  registerPrewalk(pi);
}
