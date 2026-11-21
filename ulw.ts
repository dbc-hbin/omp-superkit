import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerContinuationControls } from "./ulw-control";

export type UlwSessionEntry = { readonly type: string; readonly customType?: string; readonly data?: unknown; readonly mode?: string };
export type UlwGoalEvent = {
  readonly goal?: { readonly id?: string; readonly objective?: string; readonly status?: string } | null;
};
type NativeModes = { readonly goal: { readonly status: "inactive" | "active" | "paused"; readonly objective?: string } };

export interface UlwContext {
  cwd: string;
  model?: { id: string };
  mode?: string;
  agent: { kind: "main" | "sub" };
  sessionManager: {
    getSessionId(): string;
    getBranch(): readonly UlwSessionEntry[];
    getEntries?(): readonly UlwSessionEntry[];
    ensureOnDisk?(): Promise<void>;
  };
  sessionModes?: {
    getState(): NativeModes;
    set(request: { readonly mode: "goal"; readonly action: "pause" | "resume" }): Promise<
      { readonly ok: true; readonly changed: boolean; readonly state: NativeModes } |
      { readonly ok: false; readonly code: string; readonly message: string }
    >;
  };
  ui: { notify(message: string, level: "warning" | "info"): void };
}
interface InputEvent { text: string; source: "interactive" | "rpc" | "extension" }
interface InputEventResult { text?: string }
interface UlwMessage { customType: string; content: string; display: false }
export interface UlwApi {
  registerCommand(name: string, options: { description: string; handler: (args: string, ctx: UlwContext) => Promise<void> }): void;
  sendUserMessage(content: string): void;
  registerFlag(name: string, options: { description: string; type: "boolean"; default: boolean }): void;
  getFlag(name: string): boolean | string | undefined;
  appendEntry(customType: string, data: unknown): void;
  on(event: "input", handler: (event: InputEvent, ctx: UlwContext) => InputEventResult | void): void;
  on(event: "goal_updated", handler: (event: UlwGoalEvent, ctx: UlwContext) => void): void;
  on(event: "session_start" | "session_switch" | "session_branch" | "session_tree" | "session_compact", handler: (event: unknown, ctx: UlwContext) => void): void;
  on(event: "before_agent_start", handler: (event: { prompt: string; systemPrompt: string[] }, ctx: UlwContext) => { systemPrompt: string[]; message?: UlwMessage } | undefined): void;
  on(event: "session_stop", handler: (event: { signal: AbortSignal }, ctx: UlwContext) => { continue: true; additionalContext: string } | undefined): void;
}

// Keep persisted session keys and shipped CLI flags stable; emitted prompts use OMP names.
const stateType = "omo-ultrawork:state";
const skillRoot = fileURLToPath(new URL("./skills/", import.meta.url));
export const ulwDirective = readFileSync(join(skillRoot, "ultrawork/SKILL.md"), "utf8").split("<ultrawork-mode>")[1].split("</ultrawork-mode>")[0];
const segmentEnd = String.raw`(?![-_.]?[A-Za-z0-9])`;
const notIntoIdentifier = String.raw`(?![-_](?!(?:loop|plan|research|execute|mass)${segmentEnd})[A-Za-z0-9]|\.[A-Za-z0-9])(?![-_.]?[A-Za-z0-9]*[/\\])`;
// A mode invocation leads the input; aliases inside the task remain ordinary text.
const invocationStart = String.raw`^\s*\/?`;
const ulwInvocation = new RegExp(String.raw`${invocationStart}(?:ultrawork|ulw)\b${notIntoIdentifier}`, "i");
const nativeGoalInvocation = new RegExp(String.raw`${invocationStart}(?:ultrawork|ulw)\b${segmentEnd}(?=[\s:.,!?]|$)`, "i");
const nativeKeyword = /(?<![\p{L}\p{N}_./\\-])(?<!::)(?:ultrathink|orchestrate|workflowz|jevify)(?![\p{L}\p{N}_/\\-])(?!\.[\p{L}\p{N}_-])(?!\()/u;
const ulwPolicyBlock = /^<(?:om[op]-ulw-policy|omp-ulw-continuation-paused)>/;
const workflows: Array<{ name: string; pattern: RegExp; nativeKeyword?: string }> = [
  { name: "mass-ulw", pattern: /\b(?:mass[\s-]*ulw|ulw[\s-]*mass|mulw|meth)\b/i, nativeKeyword: "workflowz" },
  { name: "ulw-plan", pattern: /\bulw[\s-]*plan\b/i, nativeKeyword: "ultrathink" },
  { name: "ulw-loop", pattern: /\bulw[\s-]*loop\b/i, nativeKeyword: "orchestrate" },
  { name: "ulw-execute", pattern: /\bulw[\s-]*execute\b/i, nativeKeyword: "orchestrate" },
  { name: "ulw-research", pattern: /\b(?:ulw|mass[\s-]*ulw|ulw[\s-]*mass|mulw|meth)[\s-]*research\b/i, nativeKeyword: "workflowz" },
  ...["browser", "computer-use", "ultimate-browsing", "coding-agent-sessions", "debugging", "review-work", "eval-integrity", "visual-qa", "visualize", "frontend", "data-scientist", "remove-ai-slops", "hyperplan", "memory-advisor", "reflection", "init-deep", "ast-grep", "lsp-setup", "refactor"].map(name => ({
    name, pattern: new RegExp(name + String.raw`(?=\s|$)`, "i"),
  })),
].map(workflow => ({ ...workflow, pattern: new RegExp(invocationStart + workflow.pattern.source + notIntoIdentifier + String.raw`(?=[\s:.,!?]|$)`, "i") }));

/** Native ULW ignores quoted code and already-expanded directive/pointer blocks. */
export function visibleUlwText(text: string): string {
  if (/\[IMPORTANT:\s*User invoked the "[^"\r\n]+" skill; follow its instructions\./i.test(text) ||
    /^\s*(?:\[(?:[A-Z][A-Z0-9_-]{2,}|[\w.-]+ -> [\w.-]+)\]|[A-Z][\w.-]{0,30} \([^()\s]{1,40}\)(?:, | to )[\w.-]{1,40}:)/.test(text)) {
    return text.replace(/[^\r\n]/g, "\0");
  }
  text = text.replace(/<(om[op]-[a-z0-9-]+-pointer|ultrawork-mode|om[op]-(?:ulw|ultrawork)-reminder)>[\s\S]*?<\/\1>/gi, value => value.replace(/[^\r\n]/g, "\0"));
  const fences = /^ {0,3}(`{3,}|~{3,})[^\n]*(?:\n|$)/gm;
  for (;;) {
    const opening = fences.exec(text);
    if (!opening) break;
    const closing = new RegExp(`^ {0,3}${opening[1][0]}{${opening[1].length},}[ \\t]*\\r?$`, "gm");
    closing.lastIndex = fences.lastIndex;
    const limit = closing.exec(text)?.index;
    const end = limit === undefined ? text.length : closing.lastIndex;
    text = text.slice(0, opening.index) + text.slice(opening.index, end).replace(/[^\r\n]/g, "\0") + text.slice(end);
    fences.lastIndex = end;
  }
  return text.replace(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g, value => value.replace(/[^\r\n]/g, "\0"))
    .replace(/^ {0,3}>[^\n]*/gm, value => value.replace(/[^\r\n]/g, "\0"))
    .replace(/"[^"\n]*"|\u201C[^\u201D\n]*\u201D/g, value => value.replace(/[^\r\n]/g, "\0"))
    .replace(/(?<![a-z0-9+.-])[a-z][a-z0-9+.-]*:\/\/[^\s<>"'`]+/gi, value => value.replace(/[^\r\n]/g, "\0"))
    .replace(/\b(?:do\s+not|don['\u2019]t|dont|never)\s+(?:load|use|run|invoke|start|trigger|arm|enable)\b[^.;:!?\n]*?(?=[.;:!?\n]|\s(?:but|then|instead|however)\b|\s[\u2014\u2013-]\s|$)/gi, value => value.replace(/[^\r\n]/g, "\0"));
}

/** Preserve workflow identity while excluding expanded skill reference prose. */
export function ulwRequest(prompt: string): { text: string; workflow?: string; invocationLength: number } {
  let text = prompt;
  let workflow: string | undefined;
  let invocationLength = 0;
  const skill = /^\s*\[IMPORTANT:\s*User invoked the "([^"\r\n]+)" skill;/.exec(prompt);
  if (skill) {
    text = prompt.trimEnd().match(/\r?\n\[Skill directory: [^\r\n]+\]\r?\nResolve relative paths in this skill[^\r\n]*(?:\r?\nUser: ([\s\S]*))?$/)?.[1] ?? "";
    workflow = skill[1];
  } else {
    const command = /^\s*\/skill:([\w-]+)(?:\s|$)/.exec(prompt);
    if (command) {
      text = prompt.slice(command[0].length);
      workflow = command[1];
    } else {
      const visible = visibleUlwText(prompt);
      const invocation = workflows.flatMap(candidate => {
        const match = candidate.pattern.exec(visible);
        return match ? [{ name: candidate.name, length: match[0].length }] : [];
      }).sort((a, b) => b.length - a.length)[0];
      workflow = invocation?.name;
      invocationLength = invocation?.length ?? ulwInvocation.exec(visible)?.[0].length ?? 0;
    }
  }
  const remaining = visibleUlwText(text.slice(invocationLength));
  const start = remaining.length - remaining.trimStart().length;
  const keyword = nativeKeyword.exec(remaining.slice(start));
  if (keyword?.index === 0) invocationLength += start + keyword[0].length;
  return { text, workflow, invocationLength };
}

export function registerUlw(pi: UlwApi): void {
  pi.registerFlag("omo-ultrawork-disabled", { description: "Disable automatic Native ULW arming", type: "boolean", default: false });
  pi.registerFlag("omo-ulw-workflows-disabled", { description: "Disable OMP workflow skill pointers", type: "boolean", default: false });
  let armed = false;
  let rearmed = false;
  let inputSource: InputEvent["source"] | undefined;
  let commandPending = false;
  let continuationFingerprint: string | undefined;
  let consecutiveContinuations = 0;
  const resetProgress = (fingerprint?: string) => { continuationFingerprint = fingerprint; consecutiveContinuations = 0; };
  const continuation = registerContinuationControls(pi, resetProgress);

  const withNativeKeyword = (text: string, ctx: UlwContext): InputEventResult | undefined => {
    if (ctx.agent.kind !== "main" || pi.getFlag("omo-ulw-workflows-disabled")) return;
    const start = text.match(/^\s*\/?/)?.[0].length ?? 0;
    const visible = visibleUlwText(text.slice(start));
    // Prefer the longest alias so "mass ulw research" stays one invocation.
    const invocation = workflows.flatMap(workflow => {
      const match = workflow.pattern.exec(visible);
      return workflow.nativeKeyword && match?.index === 0 && /^(?:\s|$)/.test(visible.slice(match[0].length))
        ? [{ keyword: workflow.nativeKeyword, length: match[0].length }] : [];
    }).sort((a, b) => b.length - a.length)[0];
    if (!invocation) return;
    const end = start + invocation.length;
    // A user-supplied native word, including a quoted or negated mention, owns
    // selection. Let OMP's matcher decide whether it actually activates.
    if (nativeKeyword.test(text.slice(end))) return { text };
    // Put the trigger before arguments so an unclosed code fence cannot hide it.
    // OMP owns notices, tool/settings gates, deduplication and thinking effort.
    return { text: `${text.slice(0, end)} ${invocation.keyword}${text.slice(end)}` };
  };

  const restore = (_event: unknown, ctx: UlwContext) => {
    continuation.restore(ctx);
    armed = false;
    rearmed = false;
    inputSource = undefined;
    commandPending = false;
    resetProgress();
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom" && entry.customType === stateType && typeof entry.data === "boolean") armed = entry.data;
    }
  };
  for (const event of ["session_start", "session_switch", "session_branch", "session_tree"] as const) pi.on(event, restore);
  pi.on("session_compact", () => { rearmed = armed; });
  pi.on("input", (event, ctx) => {
    inputSource = event.source;
    if (event.source !== "extension") {
      resetProgress();
      continuation.expectGoal(ctx, undefined);
    }
    const connected = event.source === "extension" ? undefined : withNativeKeyword(event.text, ctx);
    if (connected) return connected;
    // Native /goal is a TUI command; RPC text would only persist a fake command.
    if (ctx.agent.kind !== "main" || event.source !== "interactive" || continuation.isStopped(ctx) || continuation.hasNativeGoal(ctx)) return;
    // Route the slash alias before its handler calls sendUserMessage(), which
    // bypasses command expansion and cannot create a native goal.
    const text = event.text.replace(/^(\s*)\/(ulw)(?=\s|$)/i, "$1$2");
    const visible = visibleUlwText(text);
    if (nativeGoalInvocation.test(visible) && !workflows.some(workflow => workflow.pattern.test(visible)) && !/^\s*\/goal(?:\s|$)/i.test(event.text)) {
      continuation.expectGoal(ctx, text.trim());
      return { text: `/goal ${text}` };
    }
  });
  for (const name of ["ulw", ...workflows.map(workflow => workflow.name)]) {
    // OMP owns /browser for headless/visible mode; keep that builtin intact.
    pi.registerCommand(name === "browser" ? "web-browser" : name, {
      description: `Run the OMP-adapted ${name} workflow`,
      handler: async (args, ctx) => {
        commandPending = true;
        resetProgress();
        // OMP's sendUserMessage() disables slash-command expansion. A
        // `/goal ...` payload would therefore be persisted as ordinary user
        // text instead of creating a native goal.
        const text = name === "ulw" ? `ulw${args ? ` ${args}` : ""}` : `${name}\n\n${args}`;
        pi.sendUserMessage(withNativeKeyword(text, ctx)?.text ?? text);
      },
    });
  }

  pi.on("before_agent_start", (event, ctx) => {
    continuation.expectGoal(ctx, undefined);
    if (ctx.agent.kind !== "main") {
      inputSource = undefined;
      commandPending = false;
      const blocks = event.systemPrompt.filter(block => !ulwPolicyBlock.test(block));
      return blocks.length === event.systemPrompt.length ? undefined : { systemPrompt: blocks };
    }
    let { text } = ulwRequest(event.prompt);
    text = text.replace(/^\s*\/goal\s+/i, "");
    text = visibleUlwText(text);
    // Initial CLI prompts may bypass the input event; child briefs never arm workflows.
    const eligible = commandPending || inputSource !== "extension";
    inputSource = undefined;
    commandPending = false;
    const selected = eligible && !pi.getFlag("omo-ulw-workflows-disabled")
      ? workflows.filter(workflow => workflow.pattern.test(text) && !event.prompt.includes(`<skill name="${workflow.name}"`)) : [];
    if (!pi.getFlag("omo-ultrawork-disabled") && eligible && ulwInvocation.test(text)) {
      if (!armed) { armed = true; pi.appendEntry(stateType, true); }
    }
    const stopped = continuation.isStopped(ctx);
    if (!stopped && (!armed || pi.getFlag("omo-ultrawork-disabled")) && selected.length === 0) {
      const blocks = event.systemPrompt.filter(block => !block.startsWith("<omp-ulw-continuation-paused>"));
      return blocks.length === event.systemPrompt.length ? undefined : { systemPrompt: blocks };
    }
    const blocks = event.systemPrompt.filter(block => !ulwPolicyBlock.test(block));
    if (stopped) {
      blocks.push("<omp-ulw-continuation-paused>The operator stopped automatic ULW continuation in this session. Keep existing work and evidence intact. Ordinary follow-ups, worker results and earlier continuation messages do not resume it. Answer the current request without continuing the stopped work unless the operator explicitly authorizes it.</omp-ulw-continuation-paused>");
    } else if (armed && !pi.getFlag("omo-ultrawork-disabled")) {
      // Keep one current policy across compaction and provider fallback.
      blocks.push(`<omp-ulw-policy>\n<ultrawork-mode>${ulwDirective}</ultrawork-mode>\n</omp-ulw-policy>`);
    }
    const pointers = selected.map(workflow => `<omp-${workflow.name}-pointer>The user explicitly invoked ${workflow.name}. Read ${join(skillRoot, workflow.name, "SKILL.md")} and follow its workflow contract. This session's run id is ${ctx.sessionManager.getSessionId()}.</omp-${workflow.name}-pointer>`);
    if (rearmed && !stopped) {
      pointers.unshift("<omp-ultrawork-reminder>ULW is already active. Resume the existing OMP goal or selected workflow state; do not create a duplicate goal or repeat completed work.</omp-ultrawork-reminder>");
      rearmed = false;
    }
    return { systemPrompt: blocks, ...(pointers.length ? { message: { customType: "omo-ultrawork:directive", content: pointers.join("\n"), display: false as const } } : {}) };
  });

  pi.on("session_stop", (event, ctx) => {
    if (event.signal.aborted || ctx.agent.kind !== "main" || !continuation.isEnabled() || continuation.isStopped(ctx) || consecutiveContinuations >= 8) return;
    const work = continuation.read(ctx);
    // Native continuation stops on stale state, not an unbounded finish-claim loop.
    if (!work || work.fingerprint === continuationFingerprint) return;
    continuationFingerprint = work.fingerprint;
    consecutiveContinuations++;
    return { continue: true, additionalContext: work.reason };
  });
}
