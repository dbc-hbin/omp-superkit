import { dirname } from "node:path";
import type { SuperApi, SuperContext } from "./super";

const name = "superstack";
const stateType = "omp-superstack:state";
const policyTag = "omp-superstack-policy";
const disabledFlag = "omo-ulw-workflows-disabled";
const nativePrefix = /^\s*\/skill:superstack(?=\s|$)\s*/;
const nativeToken = /(?:^|\s)\/skill:superstack(?=\s|$)/;
const stackPrefix = /^\s*\/?superstack(?=\s|$)\s*/i;
const nativeHeader = `[IMPORTANT: User invoked the "${name}" skill; follow its instructions. Full skill below.]`;
type Message = Record<string, unknown>;
type Skill = {
  readonly path: string;
  readonly body: () => string;
  readonly visible: (text: string) => string;
  readonly envelope: (text: string) => { readonly name: string; readonly directory: string; readonly args: string } | undefined;
};
type Preparation = {
  readonly prompt: string;
  readonly source?: "interactive" | "rpc" | "extension";
  readonly specialist: boolean;
};
type NativeTurn = { readonly text: string; readonly timestamp: unknown; readonly args: string; readonly initial: boolean };

export function superstackPrefix(text: string): string | undefined {
  return stackPrefix.exec(text)?.[0];
}

function messageText(message: Message): string {
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content.map((block: unknown) =>
    typeof block === "object" && block !== null && "type" in block && block.type === "text" &&
    "text" in block && typeof block.text === "string" ? block.text : "").join("");
}

function projectText(message: Message, text: string): Message[] {
  if (!Array.isArray(message.content)) return text ? [{ ...message, content: text }] : [];
  let replaced = false;
  const content = message.content.flatMap((block: unknown) => {
    if (typeof block !== "object" || block === null || !("type" in block) || block.type !== "text") return [block];
    if (replaced || !text) return [];
    replaced = true;
    return [{ type: "text", text }];
  });
  if (text && !replaced) content.unshift({ type: "text", text });
  return content.length ? [{ ...message, content }] : [];
}

const isUser = (message: Message) => message.role === "user"
  ? message.attribution !== "agent" && message.synthetic !== true
  : message.role === "custom" && message.customType === "skill-prompt" && message.attribution === "user";

export function createSuperstack(pi: SuperApi, skill: Skill) {
  const directory = dirname(skill.path);
  const disabled = () => Boolean(pi.getFlag(disabledFlag));
  const admitted = () => pi.getCommands().some(command =>
    command.source === "skill" && command.name === `skill:${name}` && command.path === skill.path);
  let sessionId: string | undefined;
  let enabled = false;
  let pending: Preparation | undefined;
  let specialist = false;
  let nativeTurn: NativeTurn | undefined;
  let controlTurn = false;
  let initialCli = true;

  const restore = (ctx: SuperContext) => {
    sessionId = ctx.sessionManager.getSessionId();
    enabled = ctx.agent.kind === "main" && ctx.sessionManager.getBranch().findLast(entry =>
      entry.type === "custom" && entry.customType === stateType && typeof entry.data === "boolean")?.data === true;
    pending = undefined;
    specialist = false;
    nativeTurn = undefined;
    controlTurn = false;
    initialCli = true;
  };
  const sync = (ctx: SuperContext) => {
    if (sessionId !== ctx.sessionManager.getSessionId()) restore(ctx);
  };
  const setEnabled = (next: boolean) => {
    if (next === enabled) return false;
    pi.appendEntry(stateType, next);
    enabled = next;
    return true;
  };
  const control = async (args: string, ctx: SuperContext) => {
    const next = args !== "off";
    if (next && disabled()) {
      ctx.ui.notify(`Superstack routing is disabled by --${disabledFlag}.`, "info");
    } else {
      if (!next) {
        nativeTurn = undefined;
        controlTurn = false;
      }
      if (setEnabled(next)) await ctx.sessionManager.ensureOnDisk?.();
      ctx.ui.notify(next ? "Superstack enabled for this branch." : "Superstack disabled for this branch.", "info");
    }
    return { handled: true };
  };

  pi.registerCommand(name, {
    description: "Enable branch-local skill routing for an optional task, or use off to disable it",
    handler: async (raw, ctx) => {
      if (ctx.agent.kind !== "main") return;
      sync(ctx);
      const args = raw.trim();
      if (!args || args === "off") {
        await control(args, ctx);
      } else {
        if (!disabled()) setEnabled(true);
        await pi.sendUserMessage(`superstack ${args}`);
      }
    },
  });

  function nativeDetails(message: Message) {
    if (message.role !== "custom" || message.customType !== "skill-prompt" || !isUser(message)) return;
    const { details } = message;
    if (typeof details !== "object" || details === null || !("name" in details) || details.name !== name ||
      !("path" in details) || details.path !== skill.path) return;
    return details;
  }

  function nativeMessage(details: ReturnType<typeof nativeDetails>, text: string) {
    if (!details) return;
    const envelope = skill.envelope(text);
    if (envelope?.name !== name || envelope.directory !== directory) return;
    const request = "prompt" in details && typeof details.prompt === "string" ? details.prompt : undefined;
    return { args: envelope.args, explicit: request === undefined || nativeToken.test(skill.visible(request)) };
  }

  const instruction = (modeControl: boolean, user: Message | undefined): Message => {
    const text = modeControl
      ? "This request changes only the Superstack setting. Acknowledge it without beginning, inventing, or resuming work."
      : `<${policyTag}>\nSuperstack is active on this branch. Apply the routing below to the current identifiable user request; do not guess an objective after resume. Resolve relative references from ${directory}.\n\n${skill.body()}\n</${policyTag}>`;
    return { role: "developer", attribution: "agent", timestamp: user?.timestamp ?? 0, content: [{ type: "text", text }] };
  };

  return {
    restore,
    input(text: string, ctx: SuperContext) {
      if (ctx.agent.kind !== "main") return;
      const prefix = superstackPrefix(text);
      const native = nativePrefix.exec(text)?.[0];
      if (!prefix && !native) return;
      sync(ctx);
      if (native) {
        const args = text.slice(native.length).trim();
        // Keep host native dispatch (including its exact body) when routing is disabled.
        if (!disabled() && admitted() && (!args || args === "off")) return control(args, ctx);
        return;
      }
      const args = text.slice(prefix?.length ?? 0).trim();
      if (!args || args === "off") return control(args, ctx);
      if (!disabled()) setEnabled(true);
      // Keep the original arguments, attribution, and attachments in the host's ordinary input path.
      return { text: text.replace(/^(\s*)\//, "$1") };
    },
    prepare(next: Preparation, ctx: SuperContext) {
      if (ctx.agent.kind !== "main") return;
      sync(ctx);
      // The host can repeat preparation when its base policy changes. Keep the input provenance.
      if (pending?.prompt === next.prompt && next.source === undefined) return;
      pending = next.prompt.includes(nativeHeader) ||
        (initialCli && next.source === undefined && (nativePrefix.test(next.prompt) || stackPrefix.test(next.prompt))) ? next : undefined;
      specialist = next.specialist;
      nativeTurn = undefined;
      controlTurn = false;
    },
    project(messages: Message[], ctx: SuperContext): Message[] | undefined {
      if (ctx.agent.kind !== "main") return;
      sync(ctx);
      const routingDisabled = disabled();
      const latest = messages.findLastIndex(isUser);
      const user = messages[latest];
      const current = pending;
      // before_agent_start sees text only. Match that preparation to the
      // delivered user messages, not a formatted envelope found in history.
      const text = user && (current || nativeTurn) ? messageText(user) : "";
      if (current && user) {
        let remaining = current.prompt;
        const delivered: { readonly message: Message; readonly text: string }[] = [];
        for (let index = latest; index >= 0; index--) {
          const message = messages[index];
          if (!isUser(message)) continue;
          const part = index === latest ? text : messageText(message);
          if (remaining === part) {
            delivered.push({ message, text: part });
            remaining = "";
            break;
          }
          if (!remaining.endsWith(`\n\n${part}`)) break;
          delivered.push({ message, text: part });
          remaining = remaining.slice(0, -(part.length + 2));
        }
        if (!remaining) pending = undefined;
        if (!remaining && current.source !== "extension") {
          for (const delivery of delivered.reverse()) {
            const expanded = nativeMessage(nativeDetails(delivery.message), delivery.text);
            if (!expanded?.explicit || !admitted()) continue;
            if (!routingDisabled) setEnabled(expanded.args.trim() !== "off");
            if (delivery.message === user) {
              nativeTurn = { text, timestamp: user.timestamp, args: expanded.args, initial: false };
            }
          }
          if (!nativeTurn && delivered.length === 1 && initialCli &&
            current.source === undefined && user.role === "user" && user.attribution === "user" &&
            (ctx.mode === "print" || ctx.mode === "json" || ctx.mode === "tui") &&
            process.argv.slice(2).some(argument => argument.trim() === text.trim())) {
            // These frontends can pass positional text straight to the session.
            // sendUserMessage also bypasses input, so attribution alone isn't proof.
            initialCli = false;
            const rawNative = nativePrefix.exec(text)?.[0];
            const prefix = superstackPrefix(text);
            if (rawNative && admitted()) {
              const args = text.slice(rawNative.length).trim();
              if (!routingDisabled) setEnabled(args !== "off");
              nativeTurn = { text, timestamp: user.timestamp, args, initial: true };
            } else if (prefix) {
              const args = text.slice(prefix.length).trim();
              controlTurn = !args || args === "off";
              if (args === "off" || !routingDisabled) setEnabled(args !== "off");
            }
          }
        }
      }

      const native = nativeTurn?.text === text && nativeTurn.timestamp === user?.timestamp ? nativeTurn : undefined;
      const nativeOff = native?.args.trim() === "off" && !routingDisabled;
      const route = enabled && !routingDisabled && !specialist && !native;
      const ownControl = controlTurn || nativeOff;
      if (!route && !ownControl && !native?.initial && !messages.some(nativeDetails)) return;

      const projected: Message[] = [];
      let changed = false;
      for (const [index, message] of messages.entries()) {
        if (index === latest && (route || ownControl)) {
          projected.push(instruction(ownControl, user));
          changed = true;
        }
        if (index === latest && native?.initial && !nativeOff) {
          const args = native.args ? `\nUser: ${native.args}` : "";
          const body = `${nativeHeader}\n\n${skill.body()}\n\n---\n\n[Skill directory: ${directory}]\nResolve relative paths in this skill against this absolute directory.${args}`;
          projected.push(...projectText(message, body));
          changed = true;
          continue;
        }
        const details = nativeDetails(message);
        if (!details || (index === latest && native && !nativeOff)) {
          projected.push(message);
          continue;
        }
        const invocation = nativeMessage(details, messageText(message));
        if (!invocation) {
          projected.push(message);
          continue;
        }
        const args = invocation.args.trim() === "off" ? "" : invocation.args;
        projected.push(...projectText(message, args));
        changed = true;
      }
      if (route && latest === -1 && messages.length) {
        // Compaction/retry can resume from a summary with no retained user row.
        // Keep the mode available but never infer a new task from the summary.
        projected.push(instruction(false, undefined));
        changed = true;
      }
      return changed ? projected : undefined;
    },
  };
}
