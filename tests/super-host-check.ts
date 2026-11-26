// Run with: bun tests/super-host-check.ts (requires the installed omp binary).
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { renderPreset } from "../presets";

const requests: unknown[] = [];
const messageTypes: string[] = [];
let continuationState: { kind: string; path: string } | undefined;
let scenarioRequests = 0;
const defaultProbeModel = "gpt-6.1-sol";
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
    requests.push(await request.json());
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
    return new Response([
      'data: {"id":"super-probe","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"SUPER-PROBE"},"finish_reason":null}]}',
      'data: {"id":"super-probe","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}',
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
type ControlProbe =
  | { readonly type: "prompt"; readonly message: string; readonly requests: number; readonly notice?: string; readonly local?: true }
  | { readonly type: "goal"; readonly op: "create" | "get" | "pause"; readonly objective?: string; readonly status: "active" | "paused" | null };

async function run(prompts: readonly (string | ControlProbe)[], flags: string[] = [], continuation?: "loop" | "run" | "run-blocked" | "run-mixed" | "run-native", provider?: string, model = defaultProbeModel, loadSkills: boolean | "without-reader" = false, tools?: string[], streamingBehavior?: "steer" | "followUp"): Promise<string[]> {
  const offset = requests.length;
  continuationState = undefined;
  scenarioRequests = 0;
  servingModel = provider ? "deepseek-v4-flash-omo-local-probe" : model;
  const cwd = mkdtempSync(join(root, "workspace-"));
  // An empty --tools allowlist keeps the extensions loaded; --no-tools forbids them.
  const toolSelection = tools?.join(",") ?? (loadSkills === true ? "read" : "");
  const child = Bun.spawn([
    "omp", "--mode", "rpc", ...(prompts.some(prompt => typeof prompt !== "string") ? [] : ["--no-ui"]), "--no-extensions", "-e", packageRoot,
    "-e", providerExtension, "--model", `${provider ?? "omo-super-probe"}/${servingModel}`,
    "--cwd", cwd, "--config", config, "--no-prewalk",
    "--tools", toolSelection, ...(!tools && loadSkills === false ? ["--no-skills"] : []),
    "--no-rules", "--no-title", "--no-session", "--no-lsp", ...flags,
  ], { cwd, stdin: "pipe", stdout: "pipe", stderr: "pipe", env: {
    ...hostEnv, OMO_SUPER_PROBE_CONTINUATION: continuation ?? "", OMO_SUPER_PROBE_PROVIDER: provider ?? "", OMO_SUPER_PROBE_MODEL: model,
  } });
  const stderr = new Response(child.stderr).text();
  let signal = Promise.withResolvers<void>();
  let expected = "ready";
  let expectedRequests = 0;
  let requestId = "";
  let controlProbe: ControlProbe | undefined;
  const notices: string[] = [];
  let failure: unknown;
  const abort = AbortSignal.timeout(60000);
  abort.addEventListener("abort", () => {
    failure = new Error(`OMP host deadline: provider=${provider ?? "omo-super-probe"}, mode=${continuation ?? "ordinary"}, event=${expected}, requests=${scenarioRequests}/${expectedRequests}; prompts=${JSON.stringify(prompts)}`);
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
        if (event.type === "extension_ui_request" && "method" in event && event.method === "notify" &&
          "message" in event && typeof event.message === "string") notices.push(event.message);
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
          if (controlProbe.type === "goal" && event.type === "response") {
            const data: unknown = "data" in event ? event.data : undefined;
            const goal: unknown = typeof data === "object" && data !== null && "goal" in data ? data.goal : undefined;
            if (controlProbe.status === null ? goal !== null :
              typeof goal !== "object" || goal === null || !("status" in goal) || goal.status !== controlProbe.status) {
              signal.reject(new Error(`Unexpected native goal state: ${JSON.stringify(event)}`));
            } else signal.resolve();
          } else if (controlProbe.type === "prompt" && controlProbe.local && event.type === "prompt_result") {
            if ("agentInvoked" in event && event.agentInvoked === false && "status" in event && event.status === "completed") signal.resolve();
            else signal.reject(new Error(`Unexpected local control result: ${JSON.stringify(event)}`));
          }
        }
        // A stop hook can start another run after an RPC agent_end. Count requests
        // only when the host confirms that nothing remains scheduled.
        else if (expected === "session_settled" && event.type === "session_settled") {
          if (scenarioRequests !== expectedRequests) {
            failure = new Error(`OMP settled with requests=${scenarioRequests}/${expectedRequests}; model=${model}; continuation=${continuation ?? "ordinary"}; prompts=${JSON.stringify(prompts)}`);
            signal.reject(failure);
          } else signal.resolve();
        }
      }
    }
    if (expected !== "finished") signal.reject(new Error(`OMP exited before ${expected}`));
  })();
  try {
    await signal.promise;
    for (const [index, prompt] of prompts.entries()) {
      signal = Promise.withResolvers<void>();
      requestId = `prompt-${index}`;
      controlProbe = typeof prompt === "string" ? undefined : prompt;
      const previousRequests = scenarioRequests;
      const noticeOffset = notices.length;
      expected = controlProbe?.type === "goal" || controlProbe?.local ? "local result" : "session_settled";
      expectedRequests = controlProbe?.type === "prompt" ? controlProbe.requests
        : continuation === "run" || continuation === "run-mixed" || continuation === "run-native" ? 3 : continuation === "loop" ? 2 : index + 1;
      const input = controlProbe?.type === "goal"
        ? { type: "goal", op: controlProbe.op, objective: controlProbe.objective }
        : { type: "prompt", message: typeof prompt === "string" ? prompt : prompt.type === "prompt" ? prompt.message : "", ...(streamingBehavior ? { streamingBehavior } : {}) };
      child.stdin.write(JSON.stringify({ ...input, id: requestId }) + "\n");
      await signal.promise;
      if (failure) throw new Error(JSON.stringify(failure));
      if (expected === "local result") assert.equal(scenarioRequests, previousRequests, "local control must not request a model turn");
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
    rmSync(cwd, { recursive: true, force: true });
  }
  return requests.slice(offset).map(body => {
    assert(typeof body === "object" && body !== null && "messages" in body && Array.isArray(body.messages));
    const messages: unknown[] = body.messages;
    return messages.flatMap(message => {
      if (typeof message !== "object" || message === null || !("role" in message) || !["system", "developer"].includes(String(message.role)) || !("content" in message) || typeof message.content !== "string") return [];
      return [message.content];
    }).join("\n");
  });
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

try {
  const rejected = Bun.spawn([
    "omp", "--mode", "json", "--no-tools", "--no-extensions", "-e", packageRoot, "-e", providerExtension,
    "--model", "omo-super-probe/gpt-6.1-sol", "--cwd", root, "--no-session", "Must not start a model turn",
  ], { cwd: root, env: hostEnv, stdin: "ignore", stdout: "ignore", stderr: "pipe", timeout: 10000 });
  const [rejectedExit, rejectedError] = await Promise.all([rejected.exited, new Response(rejected.stderr).text()]);
  assert.equal(rejectedExit, 2, rejectedError);
  assert.match(rejectedError, /--no-tools cannot be combined with --extension, -e/);
  assert.equal(requests.length, 0, "the CLI must reject explicit extensions before a model turn");

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
  const nativeNotices = ["ultrathink-notice", "orchestrate-notice", "workflow-notice", "jevify-notice"];
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
} finally {
  await server.stop(true);
  rmSync(root, { recursive: true, force: true });
}
console.log(JSON.stringify({ status: "PASS", requests: requests.length }));
