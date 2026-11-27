import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerContinuationControls } from "./super-control";

export type SuperSessionEntry = { readonly type: string; readonly customType?: string; readonly data?: unknown; readonly mode?: string };
export type SuperGoalEvent = {
  readonly goal?: { readonly id?: string; readonly objective?: string; readonly status?: string } | null;
};
type NativeModes = { readonly goal: { readonly status: "inactive" | "active" | "paused"; readonly objective?: string } };

export interface SuperContext {
  cwd: string;
  model?: { id: string };
  mode?: string;
  agent: { kind: "main" | "sub" };
  sessionManager: {
    getSessionId(): string;
    getBranch(): readonly SuperSessionEntry[];
    getEntries?(): readonly SuperSessionEntry[];
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
interface SuperMessage { customType: string; content: string; display: false }
type ContextMessage = Record<string, unknown>;
export interface SuperApi {
  registerCommand(name: string, options: { description: string; handler: (args: string, ctx: SuperContext) => Promise<void> }): void;
  getCommands(): readonly { readonly name: string; readonly source: string; readonly path?: string }[];
  sendUserMessage(content: string): void;
  registerFlag(name: string, options: { description: string; type: "boolean"; default: boolean }): void;
  getFlag(name: string): boolean | string | undefined;
  appendEntry(customType: string, data: unknown): void;
  on(event: "input", handler: (event: InputEvent, ctx: SuperContext) => InputEventResult | void): void;
  on(event: "goal_updated", handler: (event: SuperGoalEvent, ctx: SuperContext) => void): void;
  on(event: "session_start" | "session_switch" | "session_branch" | "session_tree" | "session_compact", handler: (event: unknown, ctx: SuperContext) => void): void;
  on(event: "before_agent_start", handler: (event: { prompt: string; reason?: "prompt" | "revive"; systemPrompt: string[] }, ctx: SuperContext) => { systemPrompt: string[]; message?: SuperMessage } | undefined): void;
  on(event: "context", handler: (event: { messages: ContextMessage[] }, ctx: SuperContext) => { messages: ContextMessage[] } | undefined): void;
  on(event: "session_stop", handler: (event: { signal: AbortSignal }, ctx: SuperContext) => { continue: true; additionalContext: string } | undefined): void;
}

// Keep persisted session keys, prompt markers and shipped CLI flags stable across the rebrand.
const stateType = "omo-ultrawork:state";
const skillRoot = fileURLToPath(new URL("./skills/", import.meta.url));
const superCommand = "super";
const legacyCommand = "ulw";
const skillBodies = new Map<string, string>();
function shippedSkillBody(name: string): string {
  const cached = skillBodies.get(name);
  if (cached !== undefined) return cached;
  const body = readFileSync(join(skillRoot, name, "SKILL.md"), "utf8").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
  skillBodies.set(name, body);
  return body;
}
export const superDirective = shippedSkillBody(superCommand).split("<ultrawork-mode>")[1].split("</ultrawork-mode>")[0];
const segmentEnd = String.raw`(?![-_.]?[A-Za-z0-9])`;
const notIntoIdentifier = String.raw`(?![-_](?!(?:loop|plan|research|execute|mass)${segmentEnd})[A-Za-z0-9]|\.[A-Za-z0-9])(?![-_.]?[A-Za-z0-9]*[/\\])`;
// A mode invocation leads the input; aliases inside the task remain ordinary text.
const invocationStart = String.raw`^\s*\/?`;
const invocationEnd = String.raw`(?=[\s:.,!?]|$)`;
const legacyMode = "(?:ultrawork|ulw)";
const nativeGoalInvocation = new RegExp(String.raw`${invocationStart}(?:${superCommand}|${legacyMode})\b${segmentEnd}${invocationEnd}`, "i");
const nativeKeyword = /(?<![\p{L}\p{N}_./\\-])(?<!::)(?:ultrathink|orchestrate|workflowz|jevify)(?![\p{L}\p{N}_/\\-])(?!\.[\p{L}\p{N}_-])(?!\()/u;
const superPolicyBlock = /^<(?:om[op]-ulw-policy|omp-ulw-continuation-paused)>/;
type Workflow = { readonly name: string; readonly pattern: RegExp; readonly legacyName?: string; readonly nativeKeyword?: string };
const workflowSpecs: readonly Workflow[] = [
  { name: "super-graph", legacyName: "mass-ulw", pattern: /\b(?:mass[\s-]*ulw|ulw[\s-]*mass|mulw|meth)\b/i, nativeKeyword: "workflowz" },
  { name: "super-plan", legacyName: "ulw-plan", pattern: /\bulw[\s-]*plan\b/i, nativeKeyword: "ultrathink" },
  { name: "super-loop", legacyName: "ulw-loop", pattern: /\bulw[\s-]*loop\b/i, nativeKeyword: "orchestrate" },
  { name: "super-run", legacyName: "ulw-execute", pattern: /\bulw[\s-]*execute\b/i, nativeKeyword: "orchestrate" },
  { name: "super-research", legacyName: "ulw-research", pattern: /\b(?:ulw|mass[\s-]*ulw|ulw[\s-]*mass|mulw|meth)[\s-]*research\b/i, nativeKeyword: "workflowz" },
  ...["browser", "computer-use", "ultimate-browsing", "coding-agent-sessions", "debugging", "review-work", "eval-integrity", "visual-qa", "visualize", "frontend", "data-scientist", "remove-ai-slops", "hyperplan", "memory-advisor", "reflection", "init-deep", "ast-grep", "lsp-setup", "refactor"].map(name => ({
    name, pattern: new RegExp(name + String.raw`(?=\s|$)`, "i"),
  })),
];
const workflows = workflowSpecs.map(workflow => {
  const pattern = workflow.legacyName ? String.raw`(?:${workflow.name}\b|${workflow.pattern.source})` : workflow.pattern.source;
  return { ...workflow, pattern: new RegExp(invocationStart + pattern + notIntoIdentifier + invocationEnd, "i") };
});
// /super-graph selects only its graph workflow.
const superMode = [superCommand, ...workflows.flatMap(({ name, legacyName }) => legacyName && name !== "super-graph" ? [name] : [])].join("|");
const superInvocation = new RegExp(String.raw`${invocationStart}(?:${legacyMode}\b${notIntoIdentifier}|(?:${superMode})\b${segmentEnd}${invocationEnd})`, "i");

function canonicalSkillName(name: string): string {
  if (name === "ultrawork") return superCommand;
  return workflows.find(workflow => workflow.legacyName === name)?.name ?? name;
}

const slashSkill = /^\s*\/skill:([\w-]+)(?=\s|$)\s*/;
const skillInvocationHeader = /^\s*\[IMPORTANT: User invoked the "([^"\r\n]+)" skill; follow its instructions\. Full skill below\.\]\r?\n\r?\n/;
const skillInvocationFooter = /\r?\n\r?\n---\r?\n\r?\n\[Skill directory: ([^\r\n]+)\]\r?\nResolve relative paths in this skill[^\r\n]*(?:\r?\n(?:[ \t]*\r?\n)*User: ([\s\S]*))?$/;

function nativeSkillInvocation(text: string) {
  const header = skillInvocationHeader.exec(text);
  if (!header) return;
  const footer = skillInvocationFooter.exec(text.trimEnd());
  if (footer && footer.index >= header[0].length) {
    return { name: header[1], directory: footer[1], args: footer[2] ?? "", bodyStart: header[0].length, bodyEnd: footer.index };
  }
}

/** SUPER ignores quoted code and already-expanded directive/pointer blocks. */
export function visibleSuperText(text: string): string {
  const mask = (value: string) => value.replace(/[^\r\n]/g, "\0");
  if (/\[IMPORTANT:\s*User invoked the "[^"\r\n]+" skill; follow its instructions\./i.test(text) ||
    /^\s*(?:\[(?:[A-Z][A-Z0-9_-]{2,}|[\w.-]+ -> [\w.-]+)\]|[A-Z][\w.-]{0,30} \([^()\s]{1,40}\)(?:, | to )[\w.-]{1,40}:)/.test(text)) {
    return mask(text);
  }
  text = text.replace(/<(om[op]-[a-z0-9-]+-pointer|ultrawork-mode|om[op]-(?:ulw|ultrawork)-reminder)>[\s\S]*?<\/\1>/gi, mask);
  const fences = /^ {0,3}(`{3,}|~{3,})[^\n]*(?:\n|$)/gm;
  for (;;) {
    const opening = fences.exec(text);
    if (!opening) break;
    const closing = new RegExp(`^ {0,3}${opening[1][0]}{${opening[1].length},}[ \\t]*\\r?$`, "gm");
    closing.lastIndex = fences.lastIndex;
    const end = closing.test(text) ? closing.lastIndex : text.length;
    text = text.slice(0, opening.index) + mask(text.slice(opening.index, end)) + text.slice(end);
    fences.lastIndex = end;
  }
  return text.replace(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g, mask)
    .replace(/^ {0,3}>[^\n]*/gm, mask)
    .replace(/"[^"\n]*"|\u201C[^\u201D\n]*\u201D/g, mask)
    .replace(/(?<![a-z0-9+.-])[a-z][a-z0-9+.-]*:\/\/[^\s<>"'`]+/gi, mask)
    .replace(/\b(?:do\s+not|don['\u2019]t|dont|never)\s+(?:load|use|run|invoke|start|trigger|arm|enable)\b[^.;:!?\n]*?(?=[.;:!?\n]|\s(?:but|then|instead|however)\b|\s[\u2014\u2013-]\s|$)/gi, mask);
}

/** Preserve workflow identity while excluding expanded skill reference prose. */
export function superRequest(prompt: string): { text: string; workflow?: string; invocationLength: number } {
  let text = prompt;
  let workflow: string | undefined;
  let invocationLength = 0;
  const expanded = nativeSkillInvocation(prompt);
  const skill = /^\s*\[IMPORTANT:\s*User invoked the "([^"\r\n]+)" skill;/.exec(prompt);
  if (expanded) {
    text = expanded.args;
    workflow = canonicalSkillName(expanded.name);
  } else if (skill && !skillInvocationHeader.test(prompt)) {
    // Keep intent classification for abbreviated envelopes; they do not deduplicate pointers.
    text = prompt.trimEnd().match(/\r?\n\[Skill directory: [^\r\n]+\]\r?\nResolve relative paths in this skill[^\r\n]*(?:\r?\nUser: ([\s\S]*))?$/)?.[1] ?? "";
    workflow = canonicalSkillName(skill[1]);
  } else {
    const command = slashSkill.exec(prompt);
    if (command) {
      text = prompt.slice(command[0].length);
      workflow = canonicalSkillName(command[1]);
    } else {
      const visible = visibleSuperText(prompt);
      const invocation = workflows.flatMap(candidate => {
        const match = candidate.pattern.exec(visible);
        return match ? [{ name: candidate.name, length: match[0].length }] : [];
      }).sort((a, b) => b.length - a.length)[0];
      workflow = invocation?.name;
      invocationLength = invocation?.length ?? superInvocation.exec(visible)?.[0].length ?? 0;
    }
  }
  const remaining = visibleSuperText(text.slice(invocationLength));
  const start = remaining.length - remaining.trimStart().length;
  const keyword = nativeKeyword.exec(remaining.slice(start));
  if (keyword?.index === 0) invocationLength += start + keyword[0].length;
  return { text, workflow, invocationLength };
}

export function registerSuper(pi: SuperApi): void {
  pi.registerFlag("omo-ultrawork-disabled", { description: "Disable automatic SUPER mode activation", type: "boolean", default: false });
  pi.registerFlag("omo-ulw-workflows-disabled", { description: "Disable SUPER workflow skill pointers", type: "boolean", default: false });
  let armed = false;
  let rearmed = false;
  let inputSource: InputEvent["source"] | undefined;
  let commandPending = false;
  let initialAlias: { readonly name: string; readonly prompt: string } | undefined;
  let continuationFingerprint: string | undefined;
  let consecutiveContinuations = 0;
  const resetProgress = (fingerprint?: string) => { continuationFingerprint = fingerprint; consecutiveContinuations = 0; };
  const continuation = registerContinuationControls(pi, resetProgress);

  const withNativeKeyword = (text: string, ctx: SuperContext): InputEventResult | undefined => {
    if (ctx.agent.kind !== "main" || pi.getFlag("omo-ulw-workflows-disabled")) return;
    const start = text.match(/^\s*\/?/)?.[0].length ?? 0;
    const visible = visibleSuperText(text.slice(start));
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

  const restore = (_event: unknown, ctx: SuperContext) => {
    continuation.restore(ctx);
    armed = false;
    rearmed = false;
    inputSource = undefined;
    commandPending = false;
    initialAlias = undefined;
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
    const text = event.text.replace(/^(\s*)\/(super|ulw)(?=\s|$)/i, "$1$2");
    const visible = visibleSuperText(text);
    if (nativeGoalInvocation.test(visible) && !workflows.some(workflow => workflow.pattern.test(visible)) && !/^\s*\/goal(?:\s|$)/i.test(event.text)) {
      continuation.expectGoal(ctx, text.trim());
      return { text: `/goal ${text}` };
    }
  });
  for (const { name, legacyName } of [{ name: superCommand, legacyName: legacyCommand }, ...workflows]) {
    // OMP owns /browser for headless/visible mode; keep that builtin intact.
    const primary = name === "browser" ? "web-browser" : name;
    for (const registered of legacyName ? [primary, legacyName] : [primary]) {
      pi.registerCommand(registered, {
        description: registered !== primary ? `Legacy alias for /${primary}` : name === superCommand ? "Enable SUPER mode" : `Run the ${primary} workflow`,
        handler: async (args, ctx) => {
          commandPending = true;
          resetProgress();
          // Slash expansion is disabled by sendUserMessage(); the input hook
          // above owns the interactive native goal route.
          const invocation = name === "browser" ? name : registered;
          const text = name === superCommand ? `${invocation}${args ? ` ${args}` : ""}` : `${invocation}\n\n${args}`;
          pi.sendUserMessage(withNativeKeyword(text, ctx)?.text ?? text);
        },
      });
    }
  }

  // Native TUI and RPC skill dispatch yields a user-attributed custom message.
  // Change only its model-facing text so aliases retain native authorization,
  // model mentions, attachments and transcript identity. Initial CLI prompts
  // can bypass that dispatch; admit those only through the host's live roster.
  pi.on("context", (event, ctx) => {
    if (ctx.agent.kind !== "main") return;
    let changed = false;
    const initialIndex = initialAlias ? event.messages.findLastIndex(message => message.role === "user" && message.attribution === "user") : -1;
    const messages = event.messages.map((message, index) => {
      const details = message.details;
      const native = message.role === "custom" && message.customType === "skill-prompt" && message.attribution === "user" &&
        typeof details === "object" && details !== null && "name" in details && typeof details.name === "string" &&
        canonicalSkillName(details.name) !== details.name && "path" in details && details.path === join(skillRoot, details.name, "SKILL.md")
        ? details.name : undefined;
      const initial = index === initialIndex ? initialAlias : undefined;
      if (!native && !initial) return message;
      const expand = (text: string) => {
        if (initial && text === initial.prompt) {
          const target = canonicalSkillName(initial.name);
          const args = text.replace(slashSkill, "").trimEnd();
          return `[IMPORTANT: User invoked the "${initial.name}" skill; follow its instructions. Full skill below.]\n\n${shippedSkillBody(target)}\n\n---\n\n[Skill directory: ${join(skillRoot, target)}]\nResolve relative paths in this skill against this absolute directory.${args ? `\nUser: ${args}` : ""}`;
        }
        const envelope = nativeSkillInvocation(text);
        if (!native || envelope?.name !== native || envelope.directory !== join(skillRoot, native)) return text;
        // Transcripts predating the alias can already contain a full skill.
        // Only resolve the shipped pointer; never replace historical instructions.
        if (text.slice(envelope.bodyStart, envelope.bodyEnd).replaceAll("\r\n", "\n") !== shippedSkillBody(native).replaceAll("\r\n", "\n")) return text;
        const target = canonicalSkillName(native);
        const footer = text.slice(envelope.bodyEnd).replace(`[Skill directory: ${envelope.directory}]`, () => `[Skill directory: ${join(skillRoot, target)}]`);
        return text.slice(0, envelope.bodyStart) + shippedSkillBody(target) + footer;
      };
      const content = message.content;
      if (!Array.isArray(content)) {
        if (typeof content !== "string") return message;
        const text = expand(content);
        if (text === content) return message;
        changed = true;
        return { ...message, content: text };
      }
      let replaced = false;
      const blocks = content.map((block: unknown) => {
        if (replaced || typeof block !== "object" || block === null || !("type" in block) || block.type !== "text" ||
          !("text" in block) || typeof block.text !== "string") return block;
        const text = expand(block.text);
        if (text === block.text) return block;
        replaced = changed = true;
        return { ...block, text };
      });
      return replaced ? { ...message, content: blocks } : message;
    });
    return changed ? { messages } : undefined;
  });

  pi.on("before_agent_start", (event, ctx) => {
    continuation.expectGoal(ctx, undefined);
    initialAlias = undefined;
    if (ctx.agent.kind !== "main") {
      inputSource = undefined;
      commandPending = false;
      const blocks = event.systemPrompt.filter(block => !superPolicyBlock.test(block));
      return blocks.length === event.systemPrompt.length ? undefined : { systemPrompt: blocks };
    }
    let { text } = superRequest(event.prompt);
    text = text.replace(/^\s*\/goal\s+/i, "");
    text = visibleSuperText(text);
    // Initial CLI prompts may bypass the input event; child briefs never arm workflows.
    const eligible = commandPending || inputSource !== "extension";
    const initial = event.reason !== "revive" && inputSource === undefined &&
      (ctx.mode === "print" || ctx.mode === "json" || ctx.mode === "tui") ? slashSkill.exec(event.prompt)?.[1] : undefined;
    if (initial && canonicalSkillName(initial) !== initial && pi.getCommands().some(command =>
      command.source === "skill" && command.name === `skill:${initial}` && command.path === join(skillRoot, initial, "SKILL.md"))) {
      initialAlias = { name: initial, prompt: event.prompt };
    }
    inputSource = undefined;
    commandPending = false;
    const loadedSkill = initialAlias?.name ?? nativeSkillInvocation(event.prompt)?.name;
    const selected = eligible && !pi.getFlag("omo-ulw-workflows-disabled")
      ? workflows.filter(({ name, pattern }) => pattern.test(text) && (!loadedSkill || name !== canonicalSkillName(loadedSkill))) : [];
    if (!pi.getFlag("omo-ultrawork-disabled") && eligible && superInvocation.test(text)) {
      if (!armed) { armed = true; pi.appendEntry(stateType, true); }
    }
    const stopped = continuation.isStopped(ctx);
    if (!stopped && (!armed || pi.getFlag("omo-ultrawork-disabled")) && selected.length === 0) {
      const blocks = event.systemPrompt.filter(block => !block.startsWith("<omp-ulw-continuation-paused>"));
      return blocks.length === event.systemPrompt.length ? undefined : { systemPrompt: blocks };
    }
    const blocks = event.systemPrompt.filter(block => !superPolicyBlock.test(block));
    if (stopped) {
      blocks.push("<omp-ulw-continuation-paused>The operator stopped automatic SUPER continuation in this session. Keep existing work and evidence intact. Ordinary follow-ups, worker results and earlier continuation messages do not resume it. Answer the current request without continuing the stopped work unless the operator explicitly authorizes it.</omp-ulw-continuation-paused>");
    } else if (armed && !pi.getFlag("omo-ultrawork-disabled")) {
      // Keep one current policy across compaction and provider fallback.
      blocks.push(`<omp-ulw-policy>\n<ultrawork-mode>${superDirective}</ultrawork-mode>\n</omp-ulw-policy>`);
    }
    const pointers = selected.map(({ name, legacyName }) => {
      const tag = `omp-${legacyName ?? name}-pointer`;
      return `<${tag}>The user explicitly invoked ${name}. Read ${join(skillRoot, name, "SKILL.md")} and follow its workflow contract. This session's run id is ${ctx.sessionManager.getSessionId()}.</${tag}>`;
    });
    if (rearmed && !stopped) {
      pointers.unshift("<omp-ultrawork-reminder>SUPER mode is already active. Resume the existing OMP goal or selected workflow state; do not create a duplicate goal or repeat completed work.</omp-ultrawork-reminder>");
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
