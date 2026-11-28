import { buildPreset, resolvePresetName } from "./prompts/models/catalog.js";
import { buildAsyncRules, buildPendingResults, EXECUTION_ORDER as parallelRules, SHELL_STATE as shellRules } from "./prompts/models/execution-tooling.js";
import { gpt62Body } from "./prompts/models/gpt-6.2";

export interface PresetModel {
  readonly id: string;
  readonly name?: string;
  readonly provider?: string;
  readonly identity?: { readonly class?: string; readonly logicalId?: string };
}
export interface PresetOptions { surface: "terminal" | "app"; toolNames: string[]; subagent?: boolean }

export function isGeminiModel({ id, name, identity }: Partial<PresetModel>): boolean {
  return [id, name, identity?.logicalId, identity?.class].some(value => value?.toLowerCase().includes("gemini"));
}

export function renderPreset(model: PresetModel, options: PresetOptions): { name: string; prompt: string } | undefined {
  if (isGeminiModel(model)) return undefined;
  const name = resolvePresetName(model);
  if (!name) return undefined;
  // Claude profiles assemble for the live OMP role and tools at their source.
  // Legacy profiles below still adapt upstream text to the OMP contracts.
  if (name.startsWith("claude-")) {
    return buildPreset(name, { surface: options.surface, selectedTools: options.toolNames, subagent: options.subagent });
  }
  const hasAsk = options.toolNames.includes("ask");
  // The parent's orchestration duties are not part of a worker's assignment.
  // This changes preset instructions only, never the tools exposed by OMP.
  const hasTask = !options.subagent && options.toolNames.includes("task");
  const hasTodo = !options.subagent && options.toolNames.includes("todo");
  const hasBash = options.toolNames.includes("bash");
  const hasWait = options.toolNames.includes("wait");
  const routingLine = "Open a new request with one short routing line in the user's language: state your reading of the request, the intended work, and the observable stop condition. On continuation or confirmation turns, keep the settled scope and act without repeating the opening.";
  const progressReport = "Briefly connect the outcome so far to the user's requested result, include relevant evidence or blockers, and state the next action only while work remains. Use the user's language without fixed labels or a progress ledger; execute any stated next action in the same response with tool calls.";
  const delegationRule = "A subagent is for a track that runs beside yours and lands the task sooner - a wide investigation across many files, or an implementation unit beyond one coherent edit in files you are not touching; dispatch such tracks together using task's advertised async or blocking contract, each brief naming its output, allowed edit paths, stop condition, and returned evidence.";
  const todoRule = "Never make a todo-only turn: emit todo in the same response as the next real tool call.";
  const refusals = `## Refusals are final\n\nA permission or approval denial, or a refusal by the user, is not a blocker to work around: it is final for what that call was meant to do. Never reach that result with another tool, command, path or host. Continue independent work, then ${options.subagent ? "report the refused step to the parent as a blocker" : "report the refused step as final or blocked; ask only if a new material scope decision is required"}.`;
  const asyncRules = buildAsyncRules(hasBash, hasTask);
  const pendingResults = buildPendingResults(hasWait);
  const waitRules = `${pendingResults} With nothing pending and work still open, keep going. Do not poll, sleep, or repeatedly read status while waiting.`;
  if (name === "gpt-6.2") {
    const prompt = [
      options.surface === "terminal" && !options.subagent && routingLine,
      gpt62Body(options),
      !options.subagent && progressReport,
      hasTask && `Do short or tightly coupled work and checks on your own changes yourself. ${delegationRule}`,
      hasTodo && todoRule,
      parallelRules, asyncRules, waitRules, hasBash && shellRules, refusals,
    ].filter(Boolean).join("\n\n");
    return { name, prompt };
  }
  const selectedTools = options.toolNames.filter(tool => !options.subagent || (tool !== "task" && tool !== "todo"));
  const preset = buildPreset(name, { surface: options.subagent ? "app" : options.surface, subagent: options.subagent, selectedTools });
  if (!preset) return undefined;
  let prompt = preset.prompt;
  const steering = "Use the latest user message, including queued steering, to resolve conflicts. Update only the affected parts of the plan and keep earlier instructions that still apply.";
  prompt = prompt
    .replace(/Derive intent from the latest user (?:turn|message) alone[:; -]+a new direction (?:drops|cancels) (?:the )?stale plans?(?:[,;] (?:and )?queued steering messages outrank (?:earlier intent|them))?\./g, steering);
  // Common tool documentation owns execution transport, including when eval is absent.
  // Keep model-specific observation, evidence, and recovery obligations transport-neutral.
  prompt = prompt
    .replace(/Sort (?:each multi-call step first:|a multi-call step before you write it:)[^\n]+/g, "")
    .replace(/(?:Direct tool call only when:|Call a tool directly only when|Use a direct tool call when one call is enough)[^\n]+/g, "")
    .replace(/Before each response, (?:privately )?list what you need next, then request every item that does not depend on another's result in that one response; sequence only true dependencies, and never fill missing parameters with placeholders\./g, "Never fill missing parameters with placeholders.")
    .replace("Put every independent read, search, and probe in one response; sequence only true dependencies; NEVER fill a parameter with a placeholder.", "NEVER fill a parameter with a placeholder.")
    .replace(/Name expected state before running a cell; on return COMPARE evidence to it; for a mutating cell also confirm nothing changed beyond it\./g, "Name the intended state before acting; compare returned evidence with it and confirm a mutation changed nothing beyond it.")
    .replace(/Name the state a cell should produce before running it; when it returns, (?:COMPARE|compare) the returned evidence with that state, and for a cell that changed something also check that nothing changed beyond it\./g, "Name the intended state before acting; compare returned evidence with it and confirm a mutation changed nothing beyond it.")
    .replace("Independent calls (reads, searches, listings, diagnostics) -> one parallel wave; thin context ->", "Thin context ->")
    .replace("Fire independent tool calls as one parallel wave - reads, searches, listings, diagnostics - and bias toward breadth when context is thin:", "Bias toward breadth when context is thin:")
    .replace("Edits + result-dependent calls -> one at a time, each compared with intended state;", "Compare each action with intended state;")
    .replace("Edits and result-dependent calls go one at a time, each compared with the state you meant to produce;", "Compare each action with the state you meant to produce;")
    .replace("Fire independent tool calls - reads, searches, listings, diagnostics - in one parallel wave; sequence only when a call needs a value another produced.", "");
  prompt += "\n\n" + parallelRules;
  if (!hasTodo) {
    prompt = prompt.replace(/^Todo discipline:.*\n?/gm, "")
      .replace(/^On any multi-step task, write the todo list before the first edit.*\n?/gm, "");
  }
  if (hasTodo && !prompt.includes("Never make a todo-only turn")) {
    prompt = prompt
      .replace("Todo discipline: for any non-trivial task", "Todo discipline: Never make a todo-only turn: send todo in the same response as the next real tool call. For any non-trivial task");
  }
  if (hasTodo && !prompt.includes("Never make a todo-only turn")) {
    prompt += "\n\n## OMP todo updates\n\n" + todoRule;
  }
  // Keep scope visible on new requests without repeating a fixed template on steering turns.
  // Kimi K2 explicitly reinforces its per-turn routing line in model-specific tuning.
  if (!preset.name.startsWith("kimi-k2-")) {
    prompt = prompt.replace(
      /^(?:Open (?:every turn|a new request) with [^\n]+:\n\n)?I read this as \[intent\] - \[plan\]\.(?: I'll stop(?: right away)? when \[[^\]\n]+\]\.)?\n\n/m,
      routingLine + "\n\n",
    );
  }
  // Preserve the template's reporting moments and cadence, not fixed labels or ledgers.
  prompt = prompt
    .replace(
      /## Handoff\n\n((?:A handoff is|Handoff moments:|At a handoff -)[^\n]+)\n\n[\s\S]*?(?=\n\n## |$)/,
      (section, moments: string) => {
        const cadence = section.includes("after each tool wave that changes what you know")
          ? "Between handoffs, after each tool wave that changes what you know, give one short update: what you found and what happens next."
          : "Between handoffs, work without narration.";
        return `## Replies\n\n${moments.replace("one short block:", "one short update:").replace("then open with one block:", "then give one short update:")}\n\n${progressReport} ${cadence}`;
      },
    )
    .replace(
      /(At a handoff -[^\n]+)\n\n\[Outcome so far\][\s\S]*?Between handoffs, no narration\. /,
      (_section, moments: string) => `${moments.replace("then open with one block:", "then give one short update:")}\n\n${progressReport} Between handoffs, no narration. `,
    )
    .replaceAll("The final message of a change is the handoff block and stands alone: the outcome first, then in its You need slot what a reader needs to trust it", "The final message of a change stands alone: the outcome first, then the evidence a reader needs to trust it")
    .replaceAll("The final message of a change opens with the Handoff block; its For you slot is", "The final message of a change stands alone")
    .replaceAll("Final message of a change opens with Handoff block; For you = for", "The final message of a change stands alone for")
    .replaceAll("The final message of a change opens with the Handoff block, its For you slot written", "The final message of a change stands alone, written")
    .replaceAll("The final message of a change opens with the Handoff block; write its For you slot", "Write the final message of a change")
    .replaceAll("The final message of a change is the Handoff block: its outcome and You need slots carry", "The final message of a change carries")
    .replaceAll("for a change, the Handoff block, whose For you slot leads", "for a change, a concise standalone answer leading")
    .replaceAll("for a change, the Handoff block, whose outcome leads and whose You need slot carries", "for a change, a standalone answer whose outcome leads and which carries");
  if (preset.name === "gpt-6-astra") {
    // Keep presentation and calibrated reporting local; preserve evidence and review contracts.
    prompt = prompt.replace(
      /## Writing\n\n[\s\S]*?(?=\n\n## Reporting)/,
      "## Writing\n\nUse plain, concise language suited to the reader. Lead with the main point, connect actions to purposes and findings to implications, and include useful supporting detail. Prefer connected prose; use lists for parallel, sequential, or comparative content. Avoid section headings and redundant concluding summaries. State intended actions directly; omit unsolicited descriptions of what you will not do, what stays unchanged, or how you will categorize results. Avoid filler, invented labels, canned transitions, and unprompted contrasts.",
    ).replace(
      'Disagree when you have a reason and give it; no flattery, no reassurance, no hedging with "it depends" when you have enough context to judge.',
      `Disagree when you have a reason and give it; no flattery or reassurance.

Lead with the best-supported answer or recommendation; do not require absolute proof.
State observed facts directly; qualify only the uncertain claim, once.
Give opinions as judgments with reasons, not as unresolved facts.
Use “cannot conclude,” “not confirmed,” or “it depends” only for a specific gap that changes the answer; name it.
Never invent evidence or claim unperformed checks passed.`,
    );
  }
  // Native ask blocks; a resolved question is not a turn boundary.
  prompt = prompt
    .replaceAll("ask_user_question", "ask")
    .replaceAll("through ask when it is available", hasAsk ? "through `ask`" : "with a direct question")
    .replaceAll("then ask, with a direct question", "then ask a direct question");
  if (hasAsk) {
    prompt = prompt
      .replaceAll(", and end the turn rather than ending on a promise", "; continue with authorized work when the answer resolves the blocker")
      .replaceAll("then ask and end the turn", "ask through `ask`; continue with authorized work when the answer resolves the blocker")
      .replaceAll("-> ask, end turn", "-> ask through `ask`, then continue with authorized work when the answer resolves the blocker")
      .replaceAll("ask the one specific question that unblocks the work, and end the turn", "ask the one specific question through `ask`; continue when the answer resolves the blocker")
      .replaceAll("ask one focused question and stop", "ask one focused question through `ask` and continue when the answer resolves the blocker");
  }
  prompt = prompt
    .replace(
      "Information asks (explain, look into, investigate): read the code and report; no edits.",
      "Explicit answer or investigation requests (\"just explain\", \"investigate only\", or \"report findings without edits\"): read the code and report; no edits. An implementation-intended \"look into\" or \"why is this broken\" request includes the smallest complete fix.",
    )
    .replaceAll(
      "Judgment asks (what do you think, review) and open-ended changes (refactor, improve, clean up): assess and propose, then wait for confirmation.",
      "Judgment-only asks (what do you think, review): assess without edits. Requested refactoring, improvements, or cleanup: assess and make the smallest complete in-scope change; ask only for material ambiguity or required authorization.",
    )
    .replaceAll(
      '"refactor" / "improve" / "clean up": assess first, propose an approach.',
      '"refactor" / "improve" / "clean up": assess, then execute the smallest complete authorized change; ask only for material ambiguity or required authorization.',
    );
  prompt = prompt
    .replace(
      "after three different approaches fail, stop editing, return in-flight edits to the last known-good state, and ask the user one precise question that includes what you tried.",
      "after three different approaches fail for the same blocker, stop that blocked track, undo only your own failed-attempt edits while preserving all user and sibling changes, and finish independent in-scope work. Report what you tried and the missing prerequisite; ask one precise question only when the user can resolve it.",
    );
  // Host/project authorization remains binding even where the generated style rules suppress caution.
  prompt = prompt
    .replaceAll("for destructive actions, state the recommended action and stop", "for destructive actions, state the recommended action and obtain explicit approval before proceeding")
    .replaceAll("then do it the user's way.", "then follow the user's choice within authorized bounds.");
  prompt += `\n\n${asyncRules}\n\n${waitRules}`;
  if (hasBash) {
    prompt += "\n\n" + shellRules;
  }
  if (options.toolNames.some(tool => tool === "find" || tool === "lsp" || tool.startsWith("lsp_"))) {
    prompt = prompt
      .replaceAll("Prefer them for locating symbols, files, and patterns", "Use them for literal text and known filename patterns, following each tool's contract")
      .replaceAll("Use it for symbols, files, and patterns", "Use it for literal text and known filename patterns, following each tool's contract");
  }
  // OMO refusal rule: generic "try another approach" guidance never applies to a denial.
  prompt += "\n\n" + refusals;
  return { name: preset.name, prompt };
}
