// Run with: bun tests/super-host-check.ts [--superstack-only | --goal-only] (requires installed omp).
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { renderPreset } from "../presets";

const requests: unknown[] = [];
const messageTypes: string[] = [];
let continuationState: { kind: string; path: string } | undefined;
let scenarioRequests = 0;
const defaultProbeModel = "gpt-6.1-sol";
const nativeNotices: readonly string[] = ["ultrathink-notice", "orchestrate-notice", "workflow-notice", "jevify-notice"];
const compactFocus = "SUPERSTACK-COMPACTION-FOCUS";
const compactHistory = "SUPERSTACK-COMPACTED-HISTORY";
const childTrigger = "SUPERSTACK-NATIVE-CHILD-PROBE";
const childAssignment = "SUPERSTACK-CHILD-ASSIGNMENT";
const childDone = "SUPERSTACK-CHILD-COMPLETE";
const goalBlockerQuote = "Only the owner has the decryption key. It cannot be obtained this session, and no independent work remains.";
const goalStopQuote = "Pause this entire goal now. Leave the remaining decryption work paused until I resume it.";
const goalScenarios = {
  sameEvidence: {
    userText: "Use SHA-256, not MD5.\nSUPER-GOAL-SAME-EVIDENCE",
    verdict: { decision: "continue" },
    calls: [
      { id: "super_goal_model_pause", name: "goal", args: { op: "pause" }, refused: true },
      {
        id: "super_goal_rephrased_ask", name: "ask",
        args: { html: '<form><label>What hash function should I use to verify the fixture? <input name="algorithm" required></label></form>' },
        refused: true,
      },
      { id: "super_goal_retry_pause", name: "goal", args: { op: "pause" }, refused: true },
    ],
  },
  branchAsk: {
    userText: "The fixture manifest confirms SHA-256 and supplies the expected digest.\nSUPER-GOAL-BRANCH-ASK",
    verdict: { decision: "continue" },
    calls: [{
      id: "super_goal_branch_ask", name: "ask",
      args: { html: '<form><label>What color should the other project use for its logo? <input name="color" required></label></form>' },
      refused: true,
    }],
  },
  nativeStop: {
    userText: goalStopQuote,
    command: "/skill:superstack",
    // This answers what the operator requested, even when the proposed action is ask.
    verdict: { decision: "user_requested", action: "pause", quote: goalStopQuote },
    calls: [
      {
        id: "super_goal_stop_ask", name: "ask",
        args: { html: '<form><label>When should the other project schedule its demo? <input name="time" required></label></form>' },
        refused: true,
      },
      { id: "super_goal_stop_pause", name: "goal", args: { op: "pause" }, refused: false },
    ],
  },
  blocker: {
    userText: goalBlockerQuote,
    verdict: {
      decision: "blocked", quote: goalBlockerQuote,
      unblock: "The owner supplies the decryption key.", answersBlocker: false,
    },
    calls: [{ id: "super_goal_whole_blocker", name: "goal", args: { op: "pause" }, refused: false }],
  },
} as const;
type GoalScenario = typeof goalScenarios[keyof typeof goalScenarios];
const dialogMethods = new Set(["ask", "confirm", "editor", "form", "input", "select"]);
let servingModel = defaultProbeModel;
const server = Bun.serve({
  hostname: "127.0.0.1", port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/v1/models") {
      return Response.json({ object: "list", data: [{ id: servingModel, object: "model" }] });
    }
    assert.equal(request.method, "POST");
    assert.equal(path, "/v1/chat/completions");
    const body: unknown = await request.json();
    requests.push(body);
    scenarioRequests++;
    if (continuationState?.kind === "run-native" && (scenarioRequests === 2 || scenarioRequests === 3)) {
      const boulder: unknown = JSON.parse(readFileSync(continuationState.path, "utf8"));
      assert(typeof boulder === "object" && boulder !== null && "works" in boulder && typeof boulder.works === "object" && boulder.works !== null && "probe" in boulder.works);
      const work = boulder.works.probe;
      assert(typeof work === "object" && work !== null && "execution_tasks" in work && Array.isArray(work.execution_tasks));
      for (const task of work.execution_tasks) {
        assert(typeof task === "object" && task !== null && "status" in task);
        task.status = "complete";
      }
      if (scenarioRequests === 3) Object.assign(work, { status: "complete" });
      writeFileSync(continuationState.path, JSON.stringify(boulder));
    }
    if (continuationState && ["loop", "run"].includes(continuationState.kind) && scenarioRequests === 2) writeFileSync(continuationState.path, continuationState.kind === "loop"
      ? JSON.stringify({ status: "complete", goals: [{ status: "complete" }] }) : "- [x] 1. Local hook probe\n");
    if (continuationState?.kind === "run" && scenarioRequests === 3) {
      const path = resolve(continuationState.path, "../../boulder.json");
      const boulder: unknown = JSON.parse(readFileSync(path, "utf8"));
      assert(typeof boulder === "object" && boulder !== null && "works" in boulder && typeof boulder.works === "object" && boulder.works !== null && "probe" in boulder.works);
      const work = boulder.works.probe;
      assert(typeof work === "object" && work !== null && "status" in work && work.status === "active");
      work.status = "complete";
      writeFileSync(path, JSON.stringify(boulder));
    }
    if (continuationState?.kind === "run-mixed" && (scenarioRequests === 2 || scenarioRequests === 3)) {
      const plan = readFileSync(continuationState.path, "utf8");
      writeFileSync(continuationState.path, scenarioRequests === 2
        ? plan.replace("- [ ] 3.", "- [x] 3.") : plan.replace("- [ ] F1.", "- [x] F1."));
    }
    const users = textByRole(body, "user");
    const user = users.at(-1);
    const trigger = user?.trimEnd();
    const spawn = trigger?.endsWith(childTrigger) && !textByRole(body, "tool").length;
    const goalReview = goalReviewScenario(body, users);
    const goalScenario = goalReview ? undefined : goalScenarioFor(user);
    // Advance only after the real host sends back the preceding tool result.
    const goalCall = goalScenario?.calls.find(call => !hasProviderToolResult(body, call.id));
    const historySummary = compactionConversation(body)?.includes(compactFocus);
    const content = goalReview ? JSON.stringify(goalReview.verdict)
      : historySummary ? compactHistory
      : isChildTitleRequest(body) ? "<title>Superstack Child Probe</title>"
      : user?.includes(childAssignment) ? childDone : "SUPER-PROBE";
    const delta = spawn ? { role: "assistant", tool_calls: [{ index: 0, id: "superstack-child-probe", type: "function", function: {
      name: "task", arguments: JSON.stringify({
        context: "Isolated loopback transport probe; no edits or other side effects.",
        tasks: [{
          agent: "scout", name: "ModeProbe", task: `superstack ${childAssignment}`,
          solutionSpace: "Reply once, without using tools or making changes.",
        }],
      }),
    } }] } : goalCall ? { role: "assistant", tool_calls: [{ index: 0, id: goalCall.id, type: "function", function: {
      name: goalCall.name, arguments: JSON.stringify(goalCall.args),
    } }] } : { role: "assistant", content };
    return new Response([
      `data: ${JSON.stringify({ id: "super-probe", object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: null }] })}`,
      `data: ${JSON.stringify({ id: "super-probe", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: spawn || goalCall ? "tool_calls" : "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}`,
      'data: [DONE]', "",
    ].join("\n\n"), { headers: { "content-type": "text/event-stream" } });
  },
});
const root = mkdtempSync(join(tmpdir(), "omp-super-host-"));
const packageRoot = resolve(process.env.OMO_SUPER_PROBE_PACKAGE ?? ".");
const providerExtension = resolve("tests/fixtures/super-provider.ts");
const home = join(root, "home");
const configDirName = ".omp";
const agentDir = join(home, configDirName, "agent");
const config = join(root, "config.yml");
mkdirSync(agentDir, { recursive: true });
writeFileSync(config, "goal:\n  enabled: true\n  continuationModes: [interactive]\ncompaction:\n  enabled: false\nmemory:\n  backend: off\n");
const hostEnv = {
  PATH: process.env.PATH, LANG: process.env.LANG ?? "en_US.UTF-8", TMPDIR: process.env.TMPDIR ?? tmpdir(),
  HOME: home, USERPROFILE: home, PI_CONFIG_DIR: configDirName, PI_CODING_AGENT_DIR: agentDir,
  OMO_SUPER_PROBE_BASE_URL: `http://127.0.0.1:${server.port}/v1`,
};
type ToolReceipt = {
  readonly toolName: string;
  readonly toolCallId: string;
  readonly isError: boolean;
  readonly result: unknown;
};
type ControlProbe =
  | { readonly type: "prompt"; readonly message: string; readonly requests?: number | null; readonly notice?: string; readonly local?: true; readonly inspect?: (bodies: readonly unknown[], toolReceipts: readonly ToolReceipt[]) => void }
  | { readonly type: "goal"; readonly op: "create" | "get" | "pause" | "resume"; readonly objective?: string; readonly status: "active" | "paused" | null; readonly inspect?: (goal: unknown) => void }
  | { readonly type: "rpc"; readonly command: () => RpcControl; readonly inspect?: (data: unknown, bodies: readonly unknown[]) => void };

type RpcControl =
  | { readonly type: "get_available_commands" | "get_state" | "get_entries" | "new_session" }
  | { readonly type: "compact"; readonly customInstructions: string }
  | { readonly type: "switch_session"; readonly sessionPath: string }
  | { readonly type: "navigate_tree"; readonly entryId: string };

interface SavedProfile {
  readonly cwd: string;
  readonly configPath: string;
  readonly sessionPath?: string;
}
interface RunOptions {
  readonly flags?: readonly string[];
  readonly continuation?: "loop" | "run" | "run-blocked" | "run-mixed" | "run-native";
  readonly provider?: string;
  readonly model?: string;
  readonly loadSkills?: boolean | "without-reader";
  readonly tools?: readonly string[];
  readonly streamingBehavior?: "steer" | "followUp";
  readonly saved?: SavedProfile;
  readonly forbidDialogs?: true;
}

function run(prompts: readonly (string | ControlProbe)[], flags?: string[], continuation?: RunOptions["continuation"], provider?: string, model?: string, loadSkills?: RunOptions["loadSkills"], tools?: string[], streamingBehavior?: RunOptions["streamingBehavior"]): Promise<string[]> {
  return runRpc(prompts, { flags, continuation, provider, model, loadSkills, tools, streamingBehavior });
}

async function runRpc(prompts: readonly (string | ControlProbe)[], options: RunOptions = {}): Promise<string[]> {
  const { flags = [], continuation, provider, model = defaultProbeModel, loadSkills = false, tools, streamingBehavior, saved, forbidDialogs } = options;
  const offset = requests.length;
  continuationState = undefined;
  scenarioRequests = 0;
  servingModel = provider ? "deepseek-v4-flash-omo-local-probe" : model;
  const cwd = saved?.cwd ?? mkdtempSync(join(root, "workspace-"));
  // An empty --tools allowlist keeps the extensions loaded; --no-tools forbids them.
  const toolSelection = tools?.join(",") ?? (loadSkills === true ? "read" : "");
  const child = Bun.spawn([
    // rpc-ui binds native tool dialogs. A headless run could hide an unintended ask.
    "omp", "--mode", forbidDialogs ? "rpc-ui" : "rpc", ...(forbidDialogs || prompts.some(prompt => typeof prompt !== "string") ? [] : ["--no-ui"]), "--no-extensions", "-e", packageRoot,
    "-e", providerExtension, "--model", `${provider ?? "omo-super-probe"}/${servingModel}`,
    "--cwd", cwd, "--config", saved?.configPath ?? config, "--no-prewalk",
    "--tools", toolSelection, ...(!tools && loadSkills === false ? ["--no-skills"] : []),
    "--no-rules", "--no-title", "--no-lsp",
    ...(saved ? saved.sessionPath ? ["--session", saved.sessionPath] : [] : ["--no-session"]), ...flags,
  ], { cwd, stdin: "pipe", stdout: "pipe", stderr: "pipe", env: {
    ...hostEnv, OMO_SUPER_PROBE_CONTINUATION: continuation ?? "", OMO_SUPER_PROBE_PROVIDER: provider ?? "", OMO_SUPER_PROBE_MODEL: model,
  } });
  const stderr = new Response(child.stderr).text();
  let signal = Promise.withResolvers<void>();
  let expected = "ready";
  let expectedRequests: number | null = 0;
  let requestId = "";
  let controlProbe: ControlProbe | undefined;
  let controlData: unknown;
  const notices: string[] = [];
  const toolReceipts: ToolReceipt[] = [];
  let failure: unknown;
  const abort = AbortSignal.timeout(60000);
  abort.addEventListener("abort", () => {
    failure = new Error(`OMP host deadline: provider=${provider ?? "omo-super-probe"}, mode=${continuation ?? "ordinary"}, event=${expected}, requests=${scenarioRequests}/${expectedRequests ?? "unchecked"}; prompts=${JSON.stringify(prompts)}`);
    signal.reject(failure);
  }, { once: true });
  const output = (async () => {
    let buffer = "";
    for await (const bytes of child.stdout) {
      buffer += new TextDecoder().decode(bytes);
      for (;;) {
        const end = buffer.indexOf("\n");
        if (end < 0) break;
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (!line.startsWith("{")) continue;
        const event: unknown = JSON.parse(line);
        if (typeof event !== "object" || event === null || !("type" in event)) continue;
        if (forbidDialogs && event.type === "extension_ui_request" && "method" in event &&
          typeof event.method === "string" && dialogMethods.has(event.method)) {
          throw new Error(`Goal interruption unexpectedly requested human input: ${JSON.stringify(event)}`);
        }
        if (event.type === "extension_ui_request" && "method" in event && event.method === "notify" &&
          "message" in event && typeof event.message === "string") notices.push(event.message);
        if (event.type === "tool_execution_end" && "toolName" in event && typeof event.toolName === "string" &&
          "toolCallId" in event && typeof event.toolCallId === "string") {
          toolReceipts.push({
            toolName: event.toolName, toolCallId: event.toolCallId, isError: "isError" in event && event.isError === true,
            result: "result" in event ? event.result : undefined,
          });
        }
        if (event.type === "message_end" && "message" in event && typeof event.message === "object" && event.message !== null && "customType" in event.message && typeof event.message.customType === "string") messageTypes.push(event.message.customType);
        if (event.type === "extension_error") {
          failure = event;
          signal.reject(new Error(JSON.stringify(event)));
        }
        if (event.type === "message_end" && "message" in event && typeof event.message === "object" && event.message !== null && "stopReason" in event.message && event.message.stopReason === "error") {
          failure = event.message;
          signal.reject(new Error(JSON.stringify(event.message)));
        }
        if (event.type === "super_probe_state" && "kind" in event && typeof event.kind === "string" && "path" in event && typeof event.path === "string") continuationState = { kind: event.kind, path: event.path };
        if (expected === "ready" && event.type === "ready") signal.resolve();
        if (event.type === "response" && "success" in event && event.success === false) {
          failure = event;
          signal.reject(new Error(JSON.stringify(event)));
        } else if (controlProbe && "id" in event && event.id === requestId) {
          if (controlProbe.type === "rpc" && event.type === "response") {
            controlData = "data" in event ? event.data : undefined;
            signal.resolve();
          } else if (controlProbe.type === "goal" && event.type === "response") {
            const data: unknown = "data" in event ? event.data : undefined;
            const goal: unknown = typeof data === "object" && data !== null && "goal" in data ? data.goal : undefined;
            if (controlProbe.status === null ? goal !== null :
              typeof goal !== "object" || goal === null || !("status" in goal) || goal.status !== controlProbe.status) {
              signal.reject(new Error(`Unexpected native goal state: ${JSON.stringify(event)}`));
            } else {
              controlData = goal;
              signal.resolve();
            }
          } else if (controlProbe.type === "prompt" && controlProbe.local) {
            // The host can acknowledge locally consumed input in the RPC
            // response, or after a registered extension command finishes.
            if (event.type === "response" && "data" in event && typeof event.data === "object" &&
              event.data !== null && "agentInvoked" in event.data && event.data.agentInvoked === false) signal.resolve();
            if (event.type === "prompt_result") {
              if ("agentInvoked" in event && event.agentInvoked === false && "status" in event && event.status === "completed") signal.resolve();
              else signal.reject(new Error(`Unexpected local control result: ${JSON.stringify(event)}`));
            }
          }
        }
        // A stop hook can start another run after an RPC agent_end. Check any
        // specified request count only when the host confirms it has settled.
        else if (expected === "session_settled" && event.type === "session_settled") {
          if (expectedRequests !== null && scenarioRequests !== expectedRequests) {
            failure = new Error(`OMP settled with requests=${scenarioRequests}/${expectedRequests}; model=${model}; continuation=${continuation ?? "ordinary"}; prompts=${JSON.stringify(prompts)}`);
            signal.reject(failure);
          } else signal.resolve();
        }
      }
    }
    if (expected !== "finished") signal.reject(new Error(`OMP exited before ${expected}`));
  })().catch(error => {
    failure = error;
    signal.reject(error);
  });
  try {
    await signal.promise;
    for (const [index, prompt] of prompts.entries()) {
      signal = Promise.withResolvers<void>();
      requestId = `prompt-${index}`;
      controlProbe = typeof prompt === "string" ? undefined : prompt;
      controlData = undefined;
      const previousRequests = scenarioRequests;
      const noticeOffset = notices.length;
      const toolOffset = toolReceipts.length;
      expected = controlProbe && (controlProbe.type !== "prompt" || controlProbe.local) ? "local result" : "session_settled";
      expectedRequests = controlProbe?.type === "rpc" || controlProbe?.type === "goal" ? previousRequests
        : controlProbe?.type === "prompt" && controlProbe.local ? controlProbe.requests ?? previousRequests
        : controlProbe?.type === "prompt" && controlProbe.requests !== undefined ? controlProbe.requests
        : continuation === "run" || continuation === "run-mixed" || continuation === "run-native" ? 3 : continuation === "loop" ? 2 : previousRequests + 1;
      const input = controlProbe?.type === "rpc" ? controlProbe.command()
        : controlProbe?.type === "goal"
        ? { type: "goal", op: controlProbe.op, objective: controlProbe.objective }
        : { type: "prompt", message: typeof prompt === "string" ? prompt : prompt.type === "prompt" ? prompt.message : "", ...(streamingBehavior ? { streamingBehavior } : {}) };
      child.stdin.write(JSON.stringify({ ...input, id: requestId }) + "\n");
      await signal.promise;
      if (failure) throw new Error(JSON.stringify(failure));
      const bodies = requests.slice(offset + previousRequests);
      if (expected === "local result") {
        // Compact is a side request that can summarize history, split-turn
        // context and the display preview separately; every other control is local.
        if (input.type !== "compact") assert.equal(scenarioRequests, expectedRequests, `unexpected model request count for ${JSON.stringify(input)}`);
        if (controlProbe?.type === "rpc") controlProbe.inspect?.(controlData, bodies);
        if (controlProbe?.type === "goal") controlProbe.inspect?.(controlData);
      }
      if (controlProbe?.type === "prompt") controlProbe.inspect?.(bodies, toolReceipts.slice(toolOffset));
      const notice = controlProbe?.type === "prompt" ? controlProbe.notice : undefined;
      if (notice) assert(notices.slice(noticeOffset).some(message => message.includes(notice)), JSON.stringify(notices));
    }
    if (continuation === "run-blocked" || continuation === "run-mixed") {
      const plan = readFileSync(join(cwd, "doc/plans/probe.md"), "utf8");
      assert.equal([...plan.matchAll(/^- \[~\] /gm)].length, continuation === "run-blocked" ? 1 : 2);
      if (continuation === "run-mixed") {
        assert(!/^- \[ \] (?:3|F1)\. /m.test(plan));
        assert(plan.includes("- [ ] 1. Example only"));
      } else assert(!/^- \[ \] /m.test(plan));
      const boulder = JSON.parse(readFileSync(join(cwd, "doc/boulder.json"), "utf8"));
      assert.equal(boulder.works.probe.status, "active", "the hook must not label unmet work complete or mutate durable state");
    }
    expected = "finished";
  } finally {
    child.kill();
    await child.exited;
    await output;
    const errors = await stderr;
    if (expected !== "finished" && errors) console.error(errors);
    if (!saved) rmSync(cwd, { recursive: true, force: true });
  }
  return requests.slice(offset).map(body => textByRole(body, "system", "developer").join("\n"));
}

function providerMessages(body: unknown): readonly unknown[] {
  assert(typeof body === "object" && body !== null && "messages" in body && Array.isArray(body.messages));
  return body.messages;
}

function wireContentText(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  return content.flatMap((block: unknown) =>
    typeof block === "object" && block !== null && "text" in block && typeof block.text === "string" ? [block.text] : []).join("\n");
}

function textByRole(body: unknown, ...roles: string[]): string[] {
  return providerMessages(body).flatMap(message => {
    if (typeof message !== "object" || message === null || !("role" in message) || !("content" in message) ||
      (roles.length && !roles.includes(String(message.role)))) return [];
    const text = wireContentText(message.content);
    return text === undefined ? [] : [text];
  });
}

function goalScenarioFor(userMessage: string | undefined): GoalScenario | undefined {
  return Object.values(goalScenarios).find(scenario => userMessage?.trimEnd().endsWith(scenario.userText));
}

function goalReviewScenario(body: unknown, users = textByRole(body, "user")): GoalScenario | undefined {
  // A side request adds its own user message and drops the main tool catalog.
  // Bind it to the latest fixture turn in history, not to the assessment prose.
  for (const user of users.slice(0, -1).reverse()) {
    const scenario = goalScenarioFor(user);
    if (scenario) return offeredTools(body).length === 0 ? scenario : undefined;
  }
}

function hasProviderToolResult(body: unknown, id: string): boolean {
  return providerMessages(body).some(message =>
    typeof message === "object" && message !== null && "role" in message && message.role === "tool" &&
    "tool_call_id" in message && message.tool_call_id === id);
}

function compactionConversation(body: unknown): string | undefined {
  // Local soft compaction sends each summary as one user message containing
  // serialized history, not as a continuation with the live message roles.
  const users = textByRole(body, "user");
  return users.length === 1 && !textByRole(body, "assistant", "tool").length &&
    users[0]?.trimStart().startsWith("<conversation>") ? users[0] : undefined;
}

function isChildTitleRequest(body: unknown): boolean {
  return textByRole(body, "user").some(text => text.includes(childAssignment)) &&
    textByRole(body, "system", "developer").some(text =>
      text.startsWith("# Task\n") && text.includes("<title>") && text.includes("</title>"));
}

function offeredTools(request: unknown): string[] {
  assert(request && typeof request === "object");
  if (!("tools" in request) || request.tools === undefined) return [];
  assert(Array.isArray(request.tools));
  return request.tools.map((tool: unknown) => {
    assert(typeof tool === "object" && tool !== null && "function" in tool);
    const definition = tool.function;
    assert(typeof definition === "object" && definition !== null && "name" in definition && typeof definition.name === "string");
    return definition.name;
  }).sort();
}

function assertReaderlessAlias(request: unknown, canonical: string, args: string, baseline: string[]) {
  assert(request && typeof request === "object" && "messages" in request && Array.isArray(request.messages));
  assert.deepEqual(offeredTools(request), baseline, "invoking a legacy skill must not grant tools");
  const directory = join(packageRoot, "skills", canonical);
  const canonBody = readFileSync(join(directory, "SKILL.md"), "utf8").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
  const user = request.messages.filter(message => message.role === "user").map(message =>
    typeof message.content === "string" ? message.content : message.content.filter((block: { type: string }) => block.type === "text").map((block: { text: string }) => block.text).join("\n")
  ).join("\n");
  assert(user.includes(canonBody), `${canonical} body must arrive in the user message without a reader`);
  assert(user.includes(`[Skill directory: ${directory}]`), `${canonical} must resolve relative scripts and docs from the canonical directory`);
  assert(user.includes(`User: ${args}`), "preserve the original skill arguments");
  assert(!JSON.stringify(request).includes("<omp-ulw-policy>"), "a native skill alias must not arm the SUPER session");
}

const stackMarker = "<omp-superstack-policy>";
const nativeStackDirectory = `[Skill directory: ${join(packageRoot, "skills", "superstack")}]`;
const stackBody = readFileSync(join(packageRoot, "skills", "superstack", "SKILL.md"), "utf8").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();

function assertStackPolicy(body: unknown, active: boolean, label: string): void {
  const delivered = textByRole(body).join("\n");
  assert.equal(delivered.split(stackMarker).length - 1, active ? 1 : 0, `Superstack policy: ${label}`);
  if (active) {
    const policy = delivered.split(stackMarker)[1].split("</omp-superstack-policy>")[0];
    assert(policy.includes(stackBody), `routing must be available without a skill read: ${label}`);
  }
}

function stackTurn(message: string, active: boolean, inspect?: (body: unknown) => void): ControlProbe {
  return { type: "prompt", message, inspect: bodies => {
    assert.equal(bodies.length, 1, `expected one provider turn for ${message.slice(0, 100)}`);
    assertStackPolicy(bodies[0], active, message.slice(0, 100));
    inspect?.(bodies[0]);
  } };
}

function localTurn(message: string): ControlProbe {
  return { type: "prompt", message, local: true };
}

async function checkStackTransport(): Promise<void> {
  const flags = ["--offline", "--skills", "superstack"];
  const options = { flags: [...flags, "--omo-ultrawork-disabled"], loadSkills: "without-reader" } as const;
  const nativeArgs = "SUPERSTACK-NATIVE-ARGUMENT";
  const nativeBody = (body: unknown) => {
    const delivered = textByRole(body, "user").join("\n");
    assert.equal(delivered.split(nativeStackDirectory).length - 1, 1, "native skill must resolve the installed directory exactly once");
    assert(delivered.includes(`User: ${nativeArgs}`), "native skill must carry its argument through OMP");
  };
  const offset = messageTypes.length;
  let tools: string[] = [];
  await runRpc([
    { type: "rpc", command: () => ({ type: "get_available_commands" }), inspect: data => {
      assert(typeof data === "object" && data !== null && "commands" in data && Array.isArray(data.commands));
      const commands: unknown[] = data.commands;
      const stackCommands = commands.flatMap(entry =>
        typeof entry === "object" && entry !== null && "source" in entry && entry.source === "extension" &&
        "name" in entry && typeof entry.name === "string" && /^superstack(?:$|-)/.test(entry.name) ? [{ name: entry.name,
          subcommands: "subcommands" in entry && Array.isArray(entry.subcommands) ? entry.subcommands : [] }] : []);
      assert.deepEqual(stackCommands.map(entry => entry.name), ["superstack"], "exactly one extension command must be discoverable");
      assert(!stackCommands[0]?.subcommands?.length, "Superstack must not register subcommands");
    } },
    stackTurn('What does "/superstack" mean?', false, body => { tools = offeredTools(body); }),
    localTurn("/superstack"),
    stackTurn("SUPERSTACK-REGISTERED-FOLLOWUP", true, body => {
      assert.deepEqual(offeredTools(body), tools, "mode activation must not grant tools");
      assert(!textByRole(body).join("\n").includes("<omp-ulw-policy>"), "stack must not arm SUPER");
    }),
    localTurn("/superstack off"),
    stackTurn("SUPERSTACK-OFF-FOLLOWUP", false),
    stackTurn("/superstack SUPERSTACK-SLASH-ARGUMENT mentions /eval-integrity", true, body => {
      assert(textByRole(body, "user").some(text => text.includes("SUPERSTACK-SLASH-ARGUMENT")), "slash command must forward its argument");
      assert(!textByRole(body).join("\n").includes("<omp-eval-integrity-pointer>"), "a task mentioning a skill must not run its command");
    }),
    localTurn("/superstack off"),
    localTurn("superstack"),
    stackTurn("SUPERSTACK-BARE-FOLLOWUP", true),
    localTurn("superstack off"),
    stackTurn("superstack off by one SUPERSTACK-EXACT-OFF", true, body => {
      assert(textByRole(body, "user").some(text => text.includes("off by one SUPERSTACK-EXACT-OFF")), "non-control arguments must reach the provider");
    }),
    localTurn("/superstack off"),
    stackTurn(`/skill:superstack ${nativeArgs}`, false, body => {
      nativeBody(body);
      assert.deepEqual(offeredTools(body), tools, "native skill must not grant tools");
    }),
    stackTurn("SUPERSTACK-NATIVE-FOLLOWUP", true, body => {
      const delivered = textByRole(body, "user").join("\n");
      assert(!delivered.includes(nativeStackDirectory), "the earlier native skill envelope must not survive as a stale pointer");
      assert(delivered.includes(nativeArgs), "stripping the old skill envelope must preserve the earlier user argument");
    }),
    localTurn("/skill:superstack off"),
    stackTurn("SUPERSTACK-NATIVE-OFF-FOLLOWUP", false),
    localTurn("/skill:superstack"),
    stackTurn("SUPERSTACK-NATIVE-ON-FOLLOWUP", true),
    { type: "goal", op: "get", status: null },
  ], options);
  assert.equal(messageTypes.slice(offset).filter(type => type === "skill-prompt").length, 1, "only native dispatch should submit a native skill message");
  assert(!messageTypes.slice(offset).some(type => nativeNotices.includes(type)),
    "stack must not inject OMP magic keywords");

  await runRpc([
    stackTurn("superstack SUPERSTACK-DISABLED-BARE", false),
    stackTurn(`/skill:superstack ${nativeArgs}`, false, nativeBody),
    stackTurn("SUPERSTACK-DISABLED-FOLLOWUP", false),
  ], { flags: [...flags, "--omo-ulw-workflows-disabled"], loadSkills: "without-reader" });
}

function sessionLeaf(data: unknown): string {
  assert(typeof data === "object" && data !== null && "leafId" in data && typeof data.leafId === "string", "saved RPC session must expose a real leaf");
  return data.leafId;
}

async function checkSavedStack(): Promise<void> {
  const cwd = mkdtempSync(join(root, "superstack-saved-"));
  const configPath = join(cwd, "saved.yml");
  writeFileSync(configPath, [
    "goal:", "  enabled: true", "  continuationModes: [interactive]",
    "compaction:", "  enabled: true", "  methodOrder: [soft]", "  keepRecentTokens: 32",
    "memory:", "  backend: off", "",
  ].join("\n"));
  const objective = "SUPERSTACK-INDEPENDENT-PAUSED-GOAL";
  let pausedId = "";
  const sameGoal = (goal: unknown) => {
    assert(typeof goal === "object" && goal !== null && "id" in goal && typeof goal.id === "string" &&
      "objective" in goal && goal.objective === objective, "Superstack must leave the independent goal intact");
    if (pausedId) assert.equal(goal.id, pausedId, "Superstack must not replace the paused goal");
    else pausedId = goal.id;
  };
  let sessionPath = "";
  let beforeOn = "";
  let whileOn = "";
  let afterOff = "";
  let persistedSummary = "";
  const flags = ["--offline", "--skills", "superstack"];
  const filler = "History for a real local compaction. ".repeat(80);
  await runRpc([
    stackTurn(`SUPERSTACK-SAVE-BEFORE-ON\n${filler}`, false),
    { type: "rpc", command: () => ({ type: "get_entries" }), inspect: data => { beforeOn = sessionLeaf(data); } },
    localTurn("/superstack"),
    stackTurn(`SUPERSTACK-SAVE-ON\n${filler}`, true),
    stackTurn("SUPERSTACK-SAVE-ON-FOLLOWUP", true),
    { type: "goal", op: "get", status: null },
    { type: "goal", op: "create", objective, status: "active", inspect: sameGoal },
    { type: "goal", op: "pause", status: "paused", inspect: sameGoal },
    { type: "rpc", command: () => ({ type: "compact", customInstructions: compactFocus }), inspect: (data, bodies) => {
      const summaries = bodies.map(compactionConversation);
      assert(summaries.every(text => text !== undefined), "compaction must not dispatch an ordinary model turn");
      assert(summaries.some(text => text?.includes(compactFocus) && text.includes("SUPERSTACK-SAVE-BEFORE-ON")),
        "compaction must send the older fixture conversation to the summarizer with the requested focus");
      assert(typeof data === "object" && data !== null && "summary" in data && typeof data.summary === "string" &&
        data.summary.includes(compactHistory), "the compact response must incorporate the focused history summary, not an ordinary reply");
      persistedSummary = data.summary;
    } },
    { type: "rpc", command: () => ({ type: "get_state" }), inspect: data => {
      assert(typeof data === "object" && data !== null && "autoCompactionEnabled" in data && data.autoCompactionEnabled === true,
        "restoration must be exercised in a profile with compaction enabled");
      assert("sessionFile" in data && typeof data.sessionFile === "string" && data.sessionFile, "profile must save its session");
      const location = relative(root, data.sessionFile);
      assert(location && !location.startsWith(".."), "session file must stay inside the isolated home/workspace");
      sessionPath = data.sessionFile;
      const rows = readFileSync(sessionPath, "utf8").trimEnd().split("\n").map(line => JSON.parse(line));
      assert.deepEqual(rows.filter(row => row.type === "compaction").map(row => row.summary), [persistedSummary],
        "require exactly one compaction record on disk with the successful summary before reopening OMP");
    } },
  ], { saved: { cwd, configPath }, flags, loadSkills: true });

  // A fresh OMP process must restore the on state from the compacted file.
  const saved = { cwd, configPath, sessionPath };
  await runRpc([
    { type: "goal", op: "get", status: "paused", inspect: sameGoal },
    stackTurn("SUPERSTACK-RESUME-AFTER-COMPACTION", true, body => {
      const delivered = textByRole(body).join("\n");
      assert(delivered.includes(compactHistory), "reopening OMP must replay the persisted compaction summary");
      assert(offeredTools(body).includes("read"), "exercise restored routing with a reader available");
    }),
    { type: "rpc", command: () => ({ type: "get_entries" }), inspect: data => { whileOn = sessionLeaf(data); } },
    stackTurn("/eval-integrity SUPERSTACK-SPECIALIST-ARGUMENT", false, body => {
      const delivered = textByRole(body).join("\n");
      assert.equal(delivered.split("<omp-eval-integrity-pointer>").length - 1, 1, "explicit specialist must retain its existing pointer once");
      assert(delivered.includes(join(packageRoot, "skills", "eval-integrity", "SKILL.md")));
      assert(textByRole(body, "user").some(text => text.includes("SUPERSTACK-SPECIALIST-ARGUMENT")));
    }),
    stackTurn("SUPERSTACK-AFTER-SPECIALIST", true),
    localTurn("/superstack off"),
    stackTurn("SUPERSTACK-SAVE-OFF", false),
    { type: "goal", op: "get", status: "paused", inspect: sameGoal },
    { type: "rpc", command: () => ({ type: "get_entries" }), inspect: data => { afterOff = sessionLeaf(data); } },
    { type: "rpc", command: () => ({ type: "navigate_tree", entryId: beforeOn }) },
    stackTurn("SUPERSTACK-BRANCH-BEFORE-ON", false),
    { type: "rpc", command: () => ({ type: "navigate_tree", entryId: whileOn }) },
    stackTurn("SUPERSTACK-BRANCH-WHILE-ON", true),
    { type: "rpc", command: () => ({ type: "navigate_tree", entryId: afterOff }) },
    stackTurn("SUPERSTACK-BRANCH-AFTER-OFF", false),
    { type: "rpc", command: () => ({ type: "navigate_tree", entryId: whileOn }) },
    stackTurn("SUPERSTACK-BEFORE-NEW-SESSION", true),
    { type: "rpc", command: () => ({ type: "new_session" }), inspect: data => {
      assert.deepEqual(data, { cancelled: false }, "OMP must open a distinct new session");
    } },
    stackTurn("SUPERSTACK-IN-NEW-SESSION", false),
    { type: "goal", op: "get", status: null },
    { type: "rpc", command: () => ({ type: "switch_session", sessionPath }) },
    { type: "rpc", command: () => ({ type: "navigate_tree", entryId: afterOff }) },
    stackTurn("SUPERSTACK-RESTORED-OFF", false),
    { type: "goal", op: "get", status: "paused", inspect: sameGoal },
  ], { saved, flags, loadSkills: true });

  await runRpc([
    { type: "rpc", command: () => ({ type: "navigate_tree", entryId: whileOn }) },
    stackTurn("SUPERSTACK-SAVED-ON-BUT-DISABLED", false),
    { type: "goal", op: "get", status: "paused", inspect: sameGoal },
  ], { saved, flags: [...flags, "--omo-ulw-workflows-disabled"], loadSkills: true });
}

async function checkStackChild(): Promise<void> {
  const configPath = join(root, "superstack-child.yml");
  writeFileSync(configPath, [
    "async:", "  enabled: false",
    "task:", "  batch: true", "  isolation:", "    enabled: false", "  completionProbe: false",
    "  speculativeLaunch: false", "  prewalk: false", "  enableLsp: false", "  maxRecursionDepth: 1",
    "  agentPrewalk: {}", "  agentAdvisor: {}", "  agentModelOverrides:", `    scout: omo-super-probe/${defaultProbeModel}`,
    "compaction:", "  enabled: false", "memory:", "  backend: off", "",
  ].join("\n"));
  await runRpc([
    localTurn("/superstack"),
    { type: "prompt", message: childTrigger, requests: 4, inspect: bodies => {
      const [title] = bodies.filter(isChildTitleRequest);
      const turns = bodies.filter(body => !isChildTitleRequest(body));
      assert.equal(turns.length, 3, "the native delegation-title request is not a child or parent turn");
      assertStackPolicy(title, false, "delegation title");
      const [parent, child, result] = turns;
      assertStackPolicy(parent, true, "parent before child");
      assert(offeredTools(parent).includes("task"), "native task tool must actually be available for the child probe");
      assert(textByRole(child, "user").some(text => text.includes(childAssignment)), "a real child must receive the assignment");
      assertStackPolicy(child, false, "native child");
      assert(textByRole(result, "tool").some(text => text.includes(childDone)), "native task must return the child's result to the parent");
      assertStackPolicy(result, true, "parent after child");
    } },
  ], { flags: ["--offline", "--no-ui", "--config", configPath], tools: ["task", "read"] });
}

async function checkSuperstack(): Promise<void> {
  await checkStackTransport();
  await checkSavedStack();
  await checkStackChild();
}

async function checkModelGoalInterruptions(): Promise<void> {
  const objective = "Decrypt the isolated fixture and verify its checksum";
  const beforeGoal = "SUPER-GOAL-TREE-BEFORE-CREATE";
  let beforeGoalLeaf = "";
  let sessionId: string | undefined;
  const sameSession = (state: unknown) => {
    assert(typeof state === "object" && state !== null && "sessionId" in state && typeof state.sessionId === "string");
    if (sessionId === undefined) sessionId = state.sessionId;
    else assert.equal(state.sessionId, sessionId, "tree navigation must stay inside the original session");
  };
  let goalId: string | undefined;
  const sameGoal = (goal: unknown) => {
    assert(typeof goal === "object" && goal !== null && "id" in goal && typeof goal.id === "string" &&
      "objective" in goal && goal.objective === objective, "RPC must read back the test goal");
    if (goalId === undefined) goalId = goal.id;
    else assert.equal(goal.id, goalId, "model and operator actions must preserve goal identity");
  };
  const attempt = (fixture: GoalScenario): ControlProbe => ({
    type: "prompt",
    message: "command" in fixture ? `${fixture.command} ${fixture.userText}` : fixture.userText,
    requests: null,
    inspect: (bodies, receipts) => {
      const isReview = (body: unknown) => goalReviewScenario(body) === fixture;
      const expectedReviews = fixture === goalScenarios.nativeStop ? 2 : 1;
      assert.equal(bodies.filter(isReview).length, expectedReviews,
        `expected ${expectedReviews} tool-free assessment(s) with current-turn history for ${fixture.userText}`);
      const turns = bodies.filter(body => !isReview(body));
      assert(turns.length && turns.every(body => goalScenarioFor(textByRole(body, "user").at(-1)) === fixture),
        `unexpected request outside the main turn and its assessment for ${fixture.userText}`);
      const [main] = turns;
      const tools = offeredTools(main);
      for (const { name } of fixture.calls) {
        assert(tools.includes(name), `the main turn must be offered the native ${name} tool`);
      }
      if (fixture === goalScenarios.branchAsk) {
        const history = textByRole(main, "user");
        const hasPrompt = (text: string) => history.some(user => user.includes(text));
        assert(hasPrompt(beforeGoal) && !hasPrompt(goalScenarios.sameEvidence.userText),
          `wrong branch for ask: before-create=${hasPrompt(beforeGoal)}, earlier-attempt=${hasPrompt(goalScenarios.sameEvidence.userText)}, user messages=${JSON.stringify(history.map(text => text.slice(-180)))}`);
      }
      assert.deepEqual(receipts.map(receipt => [receipt.toolCallId, receipt.toolName, receipt.isError]),
        fixture.calls.map(call => [call.id, call.name, call.refused]), JSON.stringify(receipts));
      // The judge must see the stop when reviewing the ask, but that review
      // must not itself authorize the subsequent pause.
      if (fixture === goalScenarios.nativeStop) {
        const ask = fixture.calls[0];
        const firstResult = bodies.findIndex(body => !isReview(body) && hasProviderToolResult(body, ask.id));
        assert(firstResult > 0, "the model must receive the irrelevant ask's refusal");
        assert.equal(bodies.slice(0, firstResult).filter(isReview).length, 1,
          "the judge must assess evidence of the whole-goal stop when reviewing the ask");
      }
      for (const { id, refused } of fixture.calls) {
        if (refused) assert(hasProviderToolResult(turns.at(-1), id), `the main turn must receive the native refusal for ${id}`);
      }
    },
  });
  const { sameEvidence, branchAsk, nativeStop, blocker } = goalScenarios;
  const messageOffset = messageTypes.length;
  // Bypass the general tool approval gate so only the goal policy can refuse.
  await runRpc([
    beforeGoal,
    { type: "rpc", command: () => ({ type: "get_state" }), inspect: sameSession },
    { type: "rpc", command: () => ({ type: "get_entries" }), inspect: data => { beforeGoalLeaf = sessionLeaf(data); } },
    { type: "goal", op: "create", objective, status: "active", inspect: sameGoal },
    attempt(sameEvidence),
    { type: "goal", op: "get", status: "active", inspect: sameGoal },
    { type: "rpc", command: () => ({ type: "navigate_tree", entryId: beforeGoalLeaf }) },
    { type: "rpc", command: () => ({ type: "get_entries" }), inspect: data => {
      assert.equal(sessionLeaf(data), beforeGoalLeaf, "navigate to the leaf before the native goal record");
    } },
    { type: "rpc", command: () => ({ type: "get_state" }), inspect: sameSession },
    { type: "goal", op: "get", status: "active", inspect: sameGoal },
    attempt(branchAsk),
    { type: "goal", op: "get", status: "active", inspect: sameGoal },
    attempt(nativeStop),
    { type: "goal", op: "get", status: "paused", inspect: sameGoal },
    { type: "goal", op: "resume", status: "active", inspect: sameGoal },
    attempt(blocker),
    { type: "goal", op: "get", status: "paused", inspect: sameGoal },
    { type: "goal", op: "resume", status: "active", inspect: sameGoal },
    { type: "goal", op: "pause", status: "paused", inspect: sameGoal },
    { type: "goal", op: "resume", status: "active", inspect: sameGoal },
  ], { flags: ["--offline", "--skills", "superstack", "--approval-mode", "yolo"], tools: ["goal", "ask"], forbidDialogs: true });
  assert.equal(messageTypes.slice(messageOffset).filter(type => type === "skill-prompt").length, 1,
    "the whole-goal stop must be delivered through OMP's native skill dispatch");
}

async function checkExistingSuper(): Promise<void> {
  const rejectionOffset = requests.length;
  const rejected = Bun.spawn([
    "omp", "--mode", "json", "--no-tools", "--no-extensions", "-e", packageRoot, "-e", providerExtension,
    "--model", "omo-super-probe/gpt-6.1-sol", "--cwd", root, "--no-session", "Must not start a model turn",
  ], { cwd: root, env: hostEnv, stdin: "ignore", stdout: "ignore", stderr: "pipe", timeout: 10000 });
  const [rejectedExit, rejectedError] = await Promise.all([rejected.exited, new Response(rejected.stderr).text()]);
  assert.equal(rejectedExit, 2, rejectedError);
  assert.match(rejectedError, /--no-tools cannot be combined with --extension, -e/);
  assert.equal(requests.length, rejectionOffset, "the CLI must reject explicit extensions before a model turn");

  const directive = readFileSync(new URL("../skills/super/SKILL.md", import.meta.url), "utf8").split("<ultrawork-mode>")[1].split("</ultrawork-mode>")[0];
  for (const model of ["gpt-6-astra", "gpt-6-astra-fast", "gpt-6.1-sol", "gpt-6-sol", "gpt-6-luna-fast", "claude-haiku-5.5", "gemini-4-argon"]) {
    const [prompt] = await run(["/super validate the shared directive"], [], undefined, undefined, model);
    assert(prompt.includes(`<ultrawork-mode>${directive}</ultrawork-mode>`));
  }
  for (const model of ["claude-haiku-5.5", "claude-fable-5.2", "gpt-6.1-terra", "gpt-6.2-astra", "gpt-6.2-sol", "swe-2-1"]) {
    const [prompt] = await run(["verify the selected model profile"], [], undefined, undefined, model);
    const request = requests.at(-1);
    const profile = renderPreset({ provider: "omo-super-probe", id: model, name: model }, { surface: "app", toolNames: offeredTools(request) });
    assert(profile);
    if (model === "swe-2-1") assert.equal(profile.name, "kimi-k3");
    assert(prompt.includes(`<omp-model-preset>\n${profile.prompt}\n</omp-model-preset>`), `actual provider request must contain the shipped ${model} profile`);
    assert(typeof request === "object" && request !== null && "model" in request);
    assert.equal(request.model, model, "prompt routing must not change the requested model");
  }
  const [catalog] = await run(["inspect installed skill metadata"], [], undefined, undefined, "gpt-6.1-sol", true);
  for (const entry of readdirSync(join(packageRoot, "skills"), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    assert(new RegExp(`^\\s*- ${entry.name}(?: \\(|:)`, "m").test(catalog), `package skill must be advertised: ${entry.name}`);
  }
  for (const name of ["browser", "computer-use", "ultimate-browsing", "coding-agent-sessions", "debugging", "review-work", "eval-integrity", "visual-qa", "visualize", "frontend", "data-scientist", "remove-ai-slops", "hyperplan", "memory-advisor", "reflection", "init-deep", "ast-grep", "lsp-setup", "refactor"]) {
    const command = name === "browser" ? "web-browser" : name;
    const [prompt] = await run([`/${command} exercise installed routing`]);
    const body = JSON.stringify(requests.at(-1));
    assert(body.includes(`<omp-${name}-pointer>`), `real command must resolve its skill pointer: ${name}`);
    assert(body.includes(join(packageRoot, "skills", name, "SKILL.md")));
    assert(!prompt.includes("<omp-ulw-policy>"));
  }
  for (const name of ["review-work", "hyperplan"]) {
    const body = readFileSync(join(packageRoot, "skills", name, "SKILL.md"), "utf8").replace(/^---\n[\s\S]*?\n---\n/, "").trim();
    for (const args of ["", "ulw verify this local probe", "ulw-plan plan this local probe"]) {
      // Exercise the expanded input delivered by native /skill invocation, not the literal CLI command.
      const expanded = `[IMPORTANT: User invoked the "${name}" skill; follow its instructions. Full skill below.]\n\n${body}\n\n---\n\n[Skill directory: ${join(packageRoot, "skills", name)}]\nResolve relative paths in this skill (e.g. \`scripts/foo.js\`, \`templates/config.yaml\`) against this absolute directory; read referenced assets and templates; run scripts with the terminal tool when skill instructions call for it.${args ? `\nUser: ${args}` : ""}`;
      const offset = requests.length;
      const prompts = await run([expanded, "continue"]);
      assert.equal(prompts.length, 2);
      for (const prompt of prompts) assert.equal(prompt.includes("<omp-ulw-policy>"), args !== "", `native skill body must not activate SUPER: ${name}`);
      assert.equal(JSON.stringify(requests[offset]).includes("<omp-ulw-plan-pointer>"), args.startsWith("ulw-plan"), `only explicit arguments select planning: ${name}`);
      assert(!JSON.stringify(requests[offset]).includes(`<omp-${name}-pointer>`), "already-expanded native skill must not receive a duplicate pointer");
    }
  }
  const aliasArgs = "Explain the local example.";
  await run([aliasArgs], ["--skills", "ultrawork"], undefined, undefined, "gpt-6.1-sol", "without-reader");
  // OMP may add native schemas to an empty allowlist. Compare to the real
  // baseline and require that no reader or bridge could expand links.
  const baseline = offeredTools(requests.at(-1));
  assert(!baseline.some(name => ["read", "bash", "eval"].includes(name)));
  for (const [legacy, canonical] of [
    ["ultrawork", "super"], ["ulw-plan", "super-plan"], ["ulw-loop", "super-loop"],
    ["ulw-execute", "super-run"], ["ulw-research", "super-research"], ["mass-ulw", "super-graph"],
  ]) {
    const offset = requests.length;
    const customOffset = messageTypes.length;
    const prompts = await run([`/skill:${legacy} ${aliasArgs}`, "Continue explaining.", { type: "goal", op: "get", status: null }],
      ["--skills", legacy], undefined, undefined, "gpt-6.1-sol", "without-reader");
    assert(messageTypes.slice(customOffset).includes("skill-prompt"), `${legacy} must use the native skill dispatch`);
    assertReaderlessAlias(requests[offset], canonical, aliasArgs, baseline);
    assert(prompts.every(prompt => !prompt.includes("<omp-ulw-policy>")), `${legacy} must not persist arming`);
  }
  const cliOffset = requests.length;
  const cliCwd = mkdtempSync(join(root, "cli-workspace-"));
  servingModel = defaultProbeModel;
  const initial = Bun.spawn([
    "omp", "--mode", "json", "--no-extensions", "-e", packageRoot, "-e", providerExtension,
    "--model", `omo-super-probe/${servingModel}`, "--cwd", cliCwd, "--config", config, "--no-prewalk",
    "--tools", "", "--skills", "ulw-plan", "--no-rules", "--no-title", "--no-session", "--no-lsp", `/skill:ulw-plan ${aliasArgs}`,
  ], {
    cwd: cliCwd, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 30000,
    env: hostEnv,
  });
  const [exit, stdout, stderr] = await Promise.all([initial.exited, new Response(initial.stdout).text(), new Response(initial.stderr).text()]);
  assert.equal(exit, 0, stderr);
  assert(stdout.includes("SUPER-PROBE"), stderr);
  assert.equal(requests.length, cliOffset + 1, "initial CLI alias must issue one model request");
  assertReaderlessAlias(requests[cliOffset], "super-plan", aliasArgs, baseline);

  const armed = await run(["/super verify this local probe", "continue"]);
  assert.equal(armed.length, 2);
  for (const prompt of armed) {
    assert(prompt.includes(`<ultrawork-mode>${directive}</ultrawork-mode>`), "actual provider request must contain the shared shipped directive");
    assert.equal(prompt.split("<omp-ulw-policy>").length - 1, 1, "policy must not duplicate on follow-up");
    assert.equal(prompt.split("<omp-model-preset>").length - 1, 1, "model preset must coexist with SUPER");
  }
  const quoted = await run(["Explain the quoted token `ulw`."]);
  assert.equal(quoted.length, 1);
  assert(!quoted[0].includes("<omp-ulw-policy>"));
  for (const text of ["Explain ulw", "Explain /ulw", "What does /ulw-plan do?", "What does ultrawork mean?", "Explain ulw-plan", "Please use ulw loop for this task", "Please use /ulw loop for this task", "Do not use tmux, but ulw verify this local probe", "Read doc/ulw/notes.md", "Do not use ulw; fix this normally", "> ulw plan the old task", "[REPORT] worker mentioned ulw-loop", "see https://example.com/search?q=ulw"]) {
    const [prompt] = await run([text]);
    assert(!prompt.includes("<omp-ulw-policy>"), `reference must not arm: ${text}`);
    assert(!JSON.stringify(requests.at(-1)).includes("-pointer>"), `reference must not inject a skill pointer: ${text}`);
  }
  const [mass] = await run(["/mass-ulw verify this local probe"]);
  assert(!mass.includes("<omp-ulw-policy>"));
  assert(JSON.stringify(requests.at(-1)).includes("<omp-mass-ulw-pointer>"));
  await run(['/super-graph plan the migration of `<skill name="super-graph">`']);
  assert(JSON.stringify(requests.at(-1)).includes("<omp-mass-ulw-pointer>"), "a quoted tag must not suppress a real graph invocation");
  const [contrast] = await run(["/ulw Do not use tmux, but verify this local probe"]);
  assert(contrast.includes("<omp-ulw-policy>"));
  const disabled = await run(["ulw verify this probe"], ["--omo-ultrawork-disabled"]);
  assert.equal(disabled.length, 1);
  assert(!disabled[0].includes("<omp-ulw-policy>"));
  for (const [canonical, legacy, notice] of [
    ["super-plan", "ulw-plan", "ultrathink-notice"], ["super-loop", "ulw-loop", "orchestrate-notice"],
    ["super-run", "ulw-execute", "orchestrate-notice"], ["super-research", "ulw-research", "workflow-notice"], ["super-graph", "mass-ulw", "workflow-notice"],
  ]) {
    for (const command of [canonical, legacy]) {
      const noticeOffset = messageTypes.length;
      const specialised = await run([`/${command} exercise this local probe`], [], undefined, undefined, "gpt-6-astra", false, ["task", "eval"]);
      assert.equal(specialised.length, 1);
      assert.equal(specialised[0].includes("<omp-ulw-policy>"), canonical !== "super-graph");
      const request = JSON.stringify(requests.at(-1));
      assert(request.includes(`<omp-${legacy}-pointer>`), `${command} must retain its workflow marker`);
      assert(request.includes(join(packageRoot, "skills", canonical, "SKILL.md")), `${command} must route to the canonical workflow`);
      assert.deepEqual(messageTypes.slice(noticeOffset).filter(type => nativeNotices.includes(type)), [notice], `${command} must activate its native execution mode exactly once`);
    }
  }
  for (const [input, expected] of [
    ["super-plan exercise bare command", ["ultrathink-notice"]],
    ["super-run workflowz exercise override", ["workflow-notice"]],
    ["Explain `/super-plan`", []],
    ["ulw plan exercise alias", ["ultrathink-notice"]],
    ["mass ulw research exercise combined alias", ["workflow-notice"]],
    ["/ulw-execute workflowz exercise override", ["workflow-notice"]],
    ["/ulw-execute use workflowz.", ["workflow-notice"]],
    ["/ulw-execute read workflowz.ts", ["orchestrate-notice"]],
    ["/ulw-plan jevify exercise override", ["jevify-notice"]],
    ["/ulw-research workflowz exercise explicit default", ["workflow-notice"]],
    ["/ulw-plan", ["ultrathink-notice"]],
    ["Explain `ulw-plan`", []],
  ] as const) {
    const noticeOffset = messageTypes.length;
    await run([input], [], undefined, undefined, "gpt-6-astra", false, ["task", "eval"]);
    assert.deepEqual(messageTypes.slice(noticeOffset).filter(type => nativeNotices.includes(type)), [...expected], input);
  }
  for (const streamingBehavior of ["steer", "followUp"] as const) {
    const noticeOffset = messageTypes.length;
    await run(["super-loop exercise RPC prompt delivery"], [], undefined, undefined, "gpt-6-astra", false, ["task", "eval"], streamingBehavior);
    assert.deepEqual(messageTypes.slice(noticeOffset).filter(type => nativeNotices.includes(type)), ["orchestrate-notice"]);
  }
  const disabledConfigRoot = mkdtempSync(join(tmpdir(), "omo-native-keywords-"));
  try {
    const configPath = join(disabledConfigRoot, "config.yml");
    for (const config of ["magicKeywords:\n  enabled: false\n", "magicKeywords:\n  workflow: false\n"]) {
      writeFileSync(configPath, config);
      const noticeOffset = messageTypes.length;
      await run(["/super-research exercise disabled native setting"], ["--config", configPath], undefined, undefined, "gpt-6-astra", false, ["task", "eval"]);
      assert.deepEqual(messageTypes.slice(noticeOffset).filter(type => nativeNotices.includes(type)), []);
    }
  } finally { rmSync(disabledConfigRoot, { recursive: true, force: true }); }
  for (const [flags, tools] of [[["--omo-ulw-workflows-disabled"], ["task", "eval"]], [[], ["read"]]]) {
    const noticeOffset = messageTypes.length;
    await run(["/super-research exercise unavailable native workflow"], flags, undefined, undefined, "gpt-6-astra", false, tools);
    assert.deepEqual(messageTypes.slice(noticeOffset).filter(type => nativeNotices.includes(type)), []);
  }
  const plainOffset = messageTypes.length;
  await run(["/super exercise native ownership"], [], undefined, undefined, "gpt-6-astra", false, ["task", "eval"]);
  assert.deepEqual(messageTypes.slice(plainOffset).filter(type => nativeNotices.includes(type)), [], "plain SUPER must not implicitly select a specialised native mode");
  const explicitOffset = messageTypes.length;
  const [combined] = await run(["/super ultrathink orchestrate workflowz jevify exercise native ownership"], [], undefined, undefined, "gpt-6-astra", false, ["task", "eval"]);
  assert.deepEqual(messageTypes.slice(explicitOffset).filter(type => nativeNotices.includes(type)).sort(), nativeNotices.toSorted(), "explicit native modes must retain their own notices exactly once");
  assert.equal(combined.split("<omp-ulw-policy>").length - 1, 1);
  for (const mode of ["loop", "run"] as const) {
    const continued = await run([`/super-${mode} exercise owned local state`], [], mode);
    assert.equal(continued.length, mode === "run" ? 3 : 2, `${mode} must continue through its final gate and stop at completed state`);
  }
  const research = await run(["/super-research exercise session-owned research goals"], [], "loop");
  assert.equal(research.length, 2, "standalone research must resume through its shared goal ledger and stop at completed state");
  const blocked = await run(["/super-run exercise blocked-only state"], [], "run-blocked");
  assert.equal(blocked.length, 1, "blocked-only plans must not automatically reopen");
  const mixed = await run(["/super-run exercise independent work and final verification"], [], "run-mixed");
  assert.equal(mixed.length, 3, "mixed plans must finish pending work and verification without reopening blocked rows");
  const nativePlan = await run(["/super-run local://approved-plan.md"], [], "run-native");
  assert.equal(nativePlan.length, 3, "native plans must continue through approved task progress and settle after completion");
  const offset = requests.length;
  const [held] = await run([
    { type: "prompt", message: "/stop-continuation", requests: 0, local: true, notice: "continuation stopped for this session" },
    { type: "prompt", message: "Ordinary follow-up while held", requests: 1 },
    { type: "prompt", message: "/resume-continuation", requests: 2, notice: "Requested resumption" },
  ], [], "loop");
  assert(held.includes("<omp-ulw-continuation-paused>"));
  assert(!JSON.stringify(requests[offset]).includes("Resume the owning workflow from"));
  assert(JSON.stringify(requests[offset + 1]).includes("Resume the owning workflow from"));
  const rpcGoal = await run([
    { type: "goal", op: "create", objective: "Independent RPC-native goal", status: "active" },
    { type: "prompt", message: "/stop-continuation", requests: 0, local: true, notice: "op=pause" },
    { type: "goal", op: "get", status: "active" },
    { type: "goal", op: "pause", status: "paused" },
    { type: "prompt", message: "/resume-continuation", requests: 0, local: true, notice: "op=resume" },
    { type: "goal", op: "get", status: "paused" },
  ], ["--no-skills"], undefined, undefined, "gpt-6.1-sol", false, ["goal"]);
  assert.equal(rpcGoal.length, 0);
  for (const provider of ["deepseek", "omo-third-party-probe"]) {
    const [prompt] = await run(["verify the selected model profile"], [], undefined, provider);
    const profile = renderPreset({ provider, id: "deepseek-v4-flash-omo-local-probe", name: "DeepSeek V4 Flash" }, { surface: "app", toolNames: offeredTools(requests.at(-1)) });
    assert(profile);
    assert(prompt.includes(`<omp-model-preset>\n${profile.prompt}\n</omp-model-preset>`), "actual provider request must contain the provider-specific shipped profile");
  }
  const definition = (request: unknown, name: string) => {
    assert(typeof request === "object" && request !== null && "tools" in request && Array.isArray(request.tools));
    const tool: unknown = request.tools.find((entry: unknown) =>
      typeof entry === "object" && entry !== null && "function" in entry && typeof entry.function === "object"
      && entry.function !== null && "name" in entry.function && entry.function.name === name,
    );
    assert(typeof tool === "object" && tool !== null && "function" in tool && typeof tool.function === "object" && tool.function !== null,
      `provider request must expose ${name} directly`);
    const spec = tool.function;
    assert("description" in spec && typeof spec.description === "string", `${name} must have a native description`);
    return { description: spec.description, parameters: "parameters" in spec ? spec.parameters : undefined };
  };
  // Activating eval moves task and todo into its catalog, so check the direct
  // wire contract in a request that does not have eval.
  const [toolPrompt] = await run(["inspect the direct task and todo contracts"], [], undefined, undefined, "gpt-6.1-sol", false, ["task", "wait", "todo", "bash"]);
  const directRequest = requests.at(-1);
  const { description: todoDescription } = definition(directRequest, "todo");
  assert(toolPrompt.includes("Never make a todo-only turn: emit todo in the same response as the next real tool call."));
  assert(!todoDescription.includes("`todo` NEVER takes a turn of its own:"));
  assert(todoDescription.includes("`init` beside the first read or action"));
  assert(todoDescription.includes("`done`/`start` beside the next action or check"));
  assert(todoDescription.includes("Tasks identified by verbatim content"));
  assert(todoDescription.includes("Before work, init for 3+ steps"));
  const { description: taskDescription, parameters: taskParameters } = definition(directRequest, "task");
  assert(taskDescription.includes("Supply authoritative inputs, numbered must-do steps, allowed write scope, forbidden deviations and concrete success criteria."));
  assert(taskDescription.includes("Supply the diff, affected contracts and existing QA evidence."));
  assert(taskDescription.includes("Supply the scope and trust boundaries."));
  assert(typeof taskParameters === "object" && taskParameters !== null && "properties" in taskParameters && typeof taskParameters.properties === "object" && taskParameters.properties !== null);
  assert("context" in taskParameters.properties && "tasks" in taskParameters.properties);
  assert("required" in taskParameters && Array.isArray(taskParameters.required) && taskParameters.required.includes("context") && taskParameters.required.includes("tasks"));
  const taskArray = taskParameters.properties.tasks;
  assert(typeof taskArray === "object" && taskArray !== null && "items" in taskArray);
  const taskItems = taskArray.items;
  assert(typeof taskItems === "object" && taskItems !== null && "properties" in taskItems && typeof taskItems.properties === "object" && taskItems.properties !== null);
  assert("task" in taskItems.properties && "solutionSpace" in taskItems.properties);
  for (const forbidden of ["category", "subagent_type", "prompt", "load_skills", "run_in_background"]) {
    assert(!(forbidden in taskParameters.properties), `native task schema must not expose legacy field: ${forbidden}`);
  }
  const [evalPrompt] = await run(["inspect the native eval shell-helper contract"], [], undefined, undefined, "gpt-6.1-sol", false, ["task", "wait", "todo", "eval", "bash"]);
  const { description: evalDescription } = definition(requests.at(-1), "eval");
  assert(!evalPrompt.includes("Use `sh()`"), "model presets must leave shell-helper contracts to native eval documentation");
  const shSignature = evalDescription.split("\n").find(line => line.includes("sh(command,") && line.includes("embedded bash engine"));
  assert(shSignature?.includes("runs to completion (never backgrounded)"), "native eval must retain the shell helper's completion contract");
  assert(evalDescription.includes("stdout+stderr") && evalDescription.includes("ShellError"));
}

try {
  if (process.argv.includes("--goal-only")) {
    await checkModelGoalInterruptions();
  } else {
    if (!process.argv.includes("--superstack-only")) {
      await checkModelGoalInterruptions();
      await checkExistingSuper();
    }
    await checkSuperstack();
  }
} finally {
  await server.stop(true);
  rmSync(root, { recursive: true, force: true });
}
console.log(JSON.stringify({ status: "PASS", requests: requests.length }));
