// Run with: bun tests/code-mode-host-check.ts (requires the installed omp binary).
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { rewriteToolGuidancePayload } from "../payload";
import { renderPreset } from "../presets";
import { bridgeProbe, directProbeNames, geminiModel, models, mountedProbe, provider, type Observation, type WireTool } from "./fixtures/code-mode-provider";

interface Message { role: string; content?: unknown; tool_call_id?: string }
interface Payload { model: string; messages: Message[]; tools?: WireTool[] }
interface Turn {
  name: string;
  model: string;
  language: "py" | "js";
  evalCall: string;
  calls: Payload[];
  observations: Observation[];
  finalSent: boolean;
  finalObserved: boolean;
}
const sentinel = "NATIVE_CODE_MODE_READ_47A9";
const present = "native-code-mode-present.txt";
const missing = "native-code-mode-missing-47a9.txt";
const onlyKernel = process.argv.includes("--js-only") ? "js" : process.argv.includes("--py-only") ? "py" : undefined;
const scenarios = onlyKernel ? [
  { name: `${onlyKernel}-only`, model: models[0]!, language: onlyKernel } as const,
] : [
  ...models.map((model, index) => ({ name: `model-${index}`, model, language: "js" as const })),
  { name: "model-0-switch-back", model: models[0]!, language: "js" as const },
  { name: "model-0-python-library", model: models[0]!, language: "py" as const },
];
const turns: Turn[] = [];
let turn: Turn | undefined;
let failure: unknown;
let stopping = false;
const failed = Promise.withResolvers<never>();
void failed.promise.catch(() => {});
function fail(error: unknown): void {
  failure ??= error;
  failed.reject(error);
}
function stream(content: string | { name: string; id: string; args: unknown }): Response {
  const tool = typeof content !== "string";
  const delta = tool
    ? { role: "assistant", tool_calls: [{ index: 0, id: content.id, type: "function", function: { name: content.name, arguments: JSON.stringify(content.args) } }] }
    : { role: "assistant", content };
  return new Response([
    `data: ${JSON.stringify({ id: "code-mode-probe", object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: null }] })}`,
    `data: ${JSON.stringify({ id: "code-mode-probe", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: tool ? "tool_calls" : "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}`,
    "data: [DONE]", "",
  ].join("\n\n"), { headers: { "content-type": "text/event-stream" } });
}
function names(tools: WireTool[]): string[] { return tools.map(tool => tool.function.name).sort(); }
function toolSchemas(tools: WireTool[]) {
  return tools.map(({ function: { description: _description, ...definition }, ...tool }) => ({ ...tool, function: definition }));
}
function systemText(body: Payload): string {
  return body.messages.filter(message => ["system", "developer"].includes(message.role)).map(message => {
    if (typeof message.content === "string") return message.content;
    assert(Array.isArray(message.content), "system content must be text or text blocks");
    return message.content.map((block: { type: string; text?: string }) => {
      assert.equal(block.type, "text");
      return block.text ?? "";
    }).join("\n");
  }).join("\n");
}
function commandInventory(text: string): string {
  const inventory = /^# Tool Commands\n[\s\S]*?(?=^[⁂§] )/m.exec(text)?.[0].trimEnd();
  assert(inventory, "native runtime must advertise session bash commands");
  return inventory;
}
const server = Bun.serve({
  hostname: "127.0.0.1", port: 0,
  async fetch(request) {
    try {
      const url = new URL(request.url);
      assert.equal(url.hostname, "127.0.0.1");
      assert.equal(request.method, "POST");
      assert(turn, "unscripted provider traffic outside a prompt");
      assert(!turn.finalSent, "unexpected traffic after the scripted final response");
      if (url.pathname === "/observe") {
        const observation = await request.json() as Observation;
        assert(["agent", "provider"].includes(observation.stage));
        assert(["before", "after"].includes(observation.phase));
        assert.equal(observation.model, turn.model);
        turn.observations.push(observation);
        return new Response("ok");
      }
      assert.equal(url.pathname, "/v1/chat/completions", "unexpected provider endpoint");
      const body = await request.json() as Payload;
      assert.equal(body.model, turn.model);
      assert(Array.isArray(body.messages) && Array.isArray(body.tools));
      turn.calls.push(body);
      if (turn.model === geminiModel) {
        if (turn.calls.length === 1) {
          assert(body.tools.some(tool => tool.function.name === "read"), "Gemini must be offered native read directly");
          return stream({ name: "read", id: turn.evalCall, args: { path: present } });
        }
        assert.equal(turn.calls.length, 2, "Gemini must finish after one native tool round trip");
        const result = body.messages.find(message => message.role === "tool" && message.tool_call_id === turn.evalCall);
        assert(JSON.stringify(result?.content)?.includes(sentinel), "Gemini must receive the direct native read result");
        turn.finalSent = true;
        return stream(`CODE_MODE_COMPLETE:${turn.name}`);
      }
      assert(turn.calls.length <= 2 + directProbeNames.length, "unexpected retry, continuation or auxiliary request");
      if (turn.calls.length === 1) {
        assert(body.tools.some(tool => tool.function.name === "eval"), "native eval must be directly callable");
        const bridgeName = body.tools.find(tool => tool.function.name === bridgeProbe.name)?.function.name;
        assert(bridgeName, "host must advertise the hyphenated tool directly");
        const inventory = commandInventory(systemText(body));
        const mountedName = [...inventory.matchAll(/^(?:## |- `)([A-Za-z_][\w.-]*)(?:` — |$)/gm)]
          .map(([, name]) => name).find(name => name === mountedProbe.name);
        assert(mountedName, `native runtime must advertise ${mountedProbe.name} in its command inventory`);
        const bridge = `tool[${JSON.stringify(bridgeName)}]`;
        const mounted = `tool[${JSON.stringify(mountedName)}]`;
        const helpCommand = `${mountedName} --help`;
        const patchFile = `${turn.evalCall}.txt`;
        const patchValue = `NATIVE_PATCH:${turn.evalCall}`;
        const patch = `*** Begin Patch\n*** Add File: ${patchFile}\n+${patchValue}\n*** End Patch\n`;
        return stream({ name: "eval", id: turn.evalCall, args: {
          language: turn.language, title: "Reading native code-mode fixtures",
          code: (turn.language === "py" ? [
            "import asyncio, json",
            "from hashlib import sha256",
            `print(sha256(${JSON.stringify(turn.evalCall)}.encode()).hexdigest())`,
            `await tool.todo({"op": "init", "items": [${JSON.stringify(turn.name)}]})`,
            `paths = ${JSON.stringify([present, missing])}`,
            "settled = await asyncio.gather(*(tool.read({'path': path}) for path in paths), return_exceptions=True)",
            "for path, item in zip(paths, settled):",
            "    failed_read = isinstance(item, BaseException)",
            "    result = str(item) if failed_read else item if isinstance(item, str) else {key: item.get(key) for key in ('text', 'hasError', 'isError')}",
            "    print(json.dumps({'path': path, 'status': 'rejected' if failed_read else 'fulfilled', 'result': result}))",
            `bridge_result = await ${bridge}({"value": ${JSON.stringify(`${bridgeName}:${turn.evalCall}`)}})`,
            "print(bridge_result if isinstance(bridge_result, str) else bridge_result['text'])",
            `docs = await tool.bash({"command": ${JSON.stringify(helpCommand)}})`,
            "print(docs if isinstance(docs, str) else docs['text'])",
            `mounted = await asyncio.gather(${mounted}({"value": ${JSON.stringify(`${mountedName}:${turn.evalCall}`)}}), tool.read({"path": ${JSON.stringify(present)}}), return_exceptions=True)`,
            "for item in mounted:",
            "    print(str(item) if isinstance(item, BaseException) else item if isinstance(item, str) else item['text'])",
            `patch_result = await tool.edit({"input": ${JSON.stringify(patch)}})`,
            "print(patch_result if isinstance(patch_result, str) else patch_result['text'])",
            `patched = await tool.read({"path": ${JSON.stringify(patchFile)}})`,
            "print(patched if isinstance(patched, str) else patched['text'])",
            `await tool.todo({"op": "done", "task": ${JSON.stringify(turn.name)}})`,
            'checklist = await tool.todo({"op": "view"})',
            "print(checklist if isinstance(checklist, str) else checklist['text'])",
          ] : [
            `print(new Bun.CryptoHasher("sha256").update(${JSON.stringify(turn.evalCall)}).digest("hex"));`,
            `await tool.todo({ op: "init", items: [${JSON.stringify(turn.name)}] });`,
            `const paths = ${JSON.stringify([present, missing])};`,
            "const settled = await Promise.allSettled(paths.map(path => tool.read({ path })));",
            "for (const [index, item] of settled.entries()) {",
            '  const result = item.status === "fulfilled" ? typeof item.value === "string" ? item.value : { text: item.value.text, hasError: item.value.hasError, isError: item.value.isError } : String(item.reason);',
            "  print(JSON.stringify({ path: paths[index], status: item.status, result }));",
            "}",
            `const bridgeResult = await ${bridge}({ value: ${JSON.stringify(`${bridgeName}:${turn.evalCall}`)} });`,
            'print(typeof bridgeResult === "string" ? bridgeResult : bridgeResult.text);',
            `const docs = await tool.bash({ command: ${JSON.stringify(helpCommand)} });`,
            'print(typeof docs === "string" ? docs : docs.text);',
            `const mounted = await Promise.allSettled([${mounted}({ value: ${JSON.stringify(`${mountedName}:${turn.evalCall}`)} }), tool.read({ path: ${JSON.stringify(present)} })]);`,
            'for (const item of mounted) print(item.status === "fulfilled" ? item.value : String(item.reason));',
            `const patchResult = await tool.edit({ input: ${JSON.stringify(patch)} });`,
            'print(typeof patchResult === "string" ? patchResult : patchResult.text);',
            `const patched = await tool.read({ path: ${JSON.stringify(patchFile)} });`,
            'print(typeof patched === "string" ? patched : patched.text);',
            `await tool.todo({ op: "done", task: ${JSON.stringify(turn.name)} });`,
            'const checklist = await tool.todo({ op: "view" }); print(checklist);',
          ]).join("\n"),
        } });
      }
      if (turn.calls.length === 2) {
        const result = body.messages.find(message => message.role === "tool" && message.tool_call_id === turn.evalCall);
        assert(result, "native eval result must return to the actual provider");
        const text = JSON.stringify(result.content);
        assert(text.includes(createHash("sha256").update(turn.evalCall).digest("hex")), `${turn.language}: native kernel hashing API must execute`);
        assert(text.includes(sentinel), "native read must return the scratch-file sentinel");
        assert(text.includes(missing), "native missing-file error must identify the requested file");
        assert(text.includes(`${bridgeProbe.name}:${turn.evalCall}`), "bracket lookup of the advertised name must reach the actual native tool");
        assert(text.includes(`${mountedProbe.name}:${turn.evalCall}`), "the discoverable accessor must reach the actual mounted tool");
        assert(text.includes(mountedProbe.description) && text.includes("--value"), "native command help must supply the discoverable tool description and arguments");
        assert(text.includes(`NATIVE_PATCH:${turn.evalCall}`), "native edit must apply the patch and read back its contents");
        assert(text.includes(`[X] ${turn.name}`), "native todo must retain the completed checklist");
        assert(!text.includes("[Some lines truncated"), `${turn.name}: native batch evidence must remain untruncated`);
        assert(/ENOENT|no such file|not found|does not exist/i.test(text), `${turn.name}: native missing-file diagnostic must survive eval: ${text}`);
        assert(/rejected|hasError|isError/.test(text), "native eval must expose the failed read, not silently succeed");
      } else {
        const name = directProbeNames[turn.calls.length - 3]!;
        const result = body.messages.find(message => message.role === "tool" && message.tool_call_id === `${name}_${turn.evalCall}`);
        assert(result, `${name}: direct tool result must return to the provider`);
        assert(JSON.stringify(result.content).includes(`${name}:${turn.evalCall}`), `${name}: must invoke the registered tool, not the eval helper`);
      }
      const next = directProbeNames[turn.calls.length - 2];
      if (next) {
        assert(body.tools.some(tool => tool.function.name === next), `${next}: must remain directly callable`);
        return stream({ name: next, id: `${next}_${turn.evalCall}`, args: { value: `${next}:${turn.evalCall}` } });
      }
      turn.finalSent = true;
      return stream(`CODE_MODE_COMPLETE:${turn.name}`);
    } catch (error) {
      fail(error);
      return new Response(JSON.stringify({ error: { message: String(error) } }), { status: 500 });
    }
  },
});
const root = mkdtempSync(join(tmpdir(), "omp-code-mode-host-"));
let child: Bun.Subprocess<"pipe", "pipe", "pipe"> | undefined;
let output: Promise<void> | undefined;
let stderr: Promise<string> | undefined;
const pending = new Map<string, ReturnType<typeof Promise.withResolvers<void>>>();
let ended: ReturnType<typeof Promise.withResolvers<void>> | undefined;
const deadline = setTimeout(() => fail(new Error(`Code-mode host deadline: ${turn?.name ?? "startup"}; requests=${turn?.calls.length ?? 0}`)), 180_000);
function send(command: Record<string, unknown>): void {
  assert(child?.stdin && typeof child.stdin !== "number");
  child.stdin.write(`${JSON.stringify(command)}\n`);
}
async function rpc(command: Record<string, unknown> & { id: string }): Promise<void> {
  const signal = Promise.withResolvers<void>();
  pending.set(command.id, signal);
  send(command);
  await Promise.race([signal.promise, failed.promise]);
  pending.delete(command.id);
}
try {
  const home = join(root, "home");
  const cwd = join(root, "workspace");
  mkdirSync(home);
  mkdirSync(cwd);
  writeFileSync(join(cwd, present), `${sentinel}\n`);
  const config = join(root, "config.yml");
  writeFileSync(config, [
    ...(onlyKernel ? ["eval:", `  js: ${onlyKernel === "js"}`, `  py: ${onlyKernel === "py"}`] : []),
    "compaction:", "  enabled: false", "prewalk:", "  enabled: false", "  auto: off",
    "memory:", "  enabled: false",
    "task:", "  isolation:", "    enabled: false", "  completionProbe: false",
    "  speculativeLaunch: false", "  prewalk: false", "  enableLsp: false",
    "  agentPrewalk: {}", "  agentAdvisor: {}", "",
  ].join("\n"));
  // Only PATH/locale/temp are inherited: no credentials, user plugins, memory,
  // custom model configuration, rules or project files enter this host.
  child = Bun.spawn([
    "omp", "--mode", "rpc", "--no-ui", "--no-extensions",
    "-e", fileURLToPath(new URL("./fixtures/code-mode-provider.ts", import.meta.url)),
    "--model", `${provider}/${models[0]}`, "--cwd", cwd, "--config", config,
    // --tools promotes explicitly selected discoverable tools to direct schemas.
    // Use native default activation to exercise the real mounted command.
    "--no-skills", "--no-rules", "--no-title", "--no-session", "--no-lsp", "--no-prewalk",
  ], { cwd, stdin: "pipe", stdout: "pipe", stderr: "pipe", env: {
    PATH: process.env.PATH, LANG: process.env.LANG ?? "en_US.UTF-8", TMPDIR: process.env.TMPDIR ?? tmpdir(),
    HOME: home, PI_CODING_AGENT_DIR: join(home, "agent"),
    PI_EDIT_VARIANT: "apply_patch",
    OMP_CODE_MODE_PROBE_BASE: `http://127.0.0.1:${server.port}`,
  } });
  assert(child.stdout && typeof child.stdout !== "number");
  assert(child.stderr && typeof child.stderr !== "number");
  stderr = new Response(child.stderr).text();
  output = (async () => {
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const bytes of child!.stdout as ReadableStream<Uint8Array>) {
      buffer += decoder.decode(bytes, { stream: true });
      for (;;) {
        const end = buffer.indexOf("\n");
        if (end < 0) break;
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (!line.startsWith("{")) continue;
        const event = JSON.parse(line);
        if (event.type === "extension_error" ||
          event.type === "message_end" && event.message?.stopReason === "error" ||
          event.type === "tool_execution_end" && (event.isError || event.result?.isError || event.result?.hasError)) {
          throw new Error(JSON.stringify(event));
        }
        if (event.type === "response") {
          // Native get_state may exceed the RPC transport limit with tool metadata.
          if (event.success === false && !(event.id === "ready" && String(event.error).includes("transport limit"))) {
            throw new Error(JSON.stringify(event));
          }
          pending.get(event.id)?.resolve();
        }
        if (event.type === "message_end" && event.message?.role === "assistant" && turn &&
          JSON.stringify(event.message.content).includes(`CODE_MODE_COMPLETE:${turn.name}`)) turn.finalObserved = true;
        if (event.type === "agent_end" && !event.willContinue) {
          assert(turn?.finalSent && turn.finalObserved, "host must consume the scripted final response before completing");
          ended?.resolve();
        }
      }
    }
    if (!stopping) throw new Error("OMP exited before the scripted model-switch sequence completed");
  })().catch(fail);
  await rpc({ type: "get_state", id: "ready" });
  await rpc({ type: "set_auto_compaction", id: "compaction-off", enabled: false });
  for (const [index, scenario] of scenarios.entries()) {
    if (turn && turn.model !== scenario.model) await rpc({ type: "set_model", id: `model-${index}`, provider, modelId: scenario.model });
    turn = {
      name: scenario.name, model: scenario.model, language: scenario.language, evalCall: `native_eval_read_47a9_${index}`,
      calls: [], observations: [], finalSent: false, finalObserved: false,
    };
    turns.push(turn);
    ended = Promise.withResolvers<void>();
    send({ type: "prompt", id: `prompt-${index}`, message: `Code-mode deterministic host contract: ${scenario.name}.` });
    await Promise.race([ended.promise, failed.promise]);
    if (turn.model === geminiModel) {
      assert.equal(turn.calls.length, 2, "Gemini must complete the native read round trip");
    } else {
      assert.equal(readFileSync(join(cwd, `${turn.evalCall}.txt`), "utf8"), `NATIVE_PATCH:${turn.evalCall}\n`, "native patch must reach the scratch filesystem");
      assert.equal(turn.calls.length, 2 + directProbeNames.length, `${scenario.name}: every code-mode model must complete eval and direct tool round trips`);
    }
  }
  let presetRegions = 0;
  const baseline = turns[0]!.observations.find(item => item.stage === "provider" && item.phase === "before")!;
  assert(baseline?.tools, "must observe native pre-plugin schemas");
  for (const name of ["read", "grep", "bash", "edit", "write", "eval", "task", bridgeProbe.name, ...directProbeNames]) {
    assert(baseline.activeTools.includes(name), `native activation must enable ${name}`);
    assert(names(baseline.tools).includes(name), `native request must originally expose ${name}`);
  }
  assert(baseline.activeTools.includes(mountedProbe.name), "discoverable tool must be active");
  assert(!names(baseline.tools).includes(mountedProbe.name), "native host must keep the discoverable tool off the direct roster");
  for (const current of turns) {
    for (const stage of ["agent", "provider"] as const) {
      const before = current.observations.filter(item => item.stage === stage && item.phase === "before");
      const after = current.observations.filter(item => item.stage === stage && item.phase === "after");
      assert.equal(before.length, stage === "agent" ? 1 : current.calls.length);
      assert.equal(after.length, before.length);
      before.forEach((original, index) => {
        assert.deepEqual(after[index]!.activeTools, original.activeTools, `${current.name}: ${stage} must not change activation`);
        assert.deepEqual(original.activeTools, baseline.activeTools, `${current.name}: switching models must not change native activation`);
      });
    }
    const native = current.observations.find(item => item.stage === "agent" && item.phase === "before");
    const nativePrompt = native?.blocks?.[0];
    assert(native && nativePrompt, `${current.name}: must observe the original native role and runtime`);
    current.calls.forEach((body, index) => {
      const original = current.observations.filter(item => item.stage === "provider" && item.phase === "before")[index]!.tools!;
      const projected = current.observations.filter(item => item.stage === "provider" && item.phase === "after")[index]!.tools!;
      assert(body.tools, `${current.name}: provider must receive native tools`);
      assert.deepEqual(body.tools, projected, `${current.name}: observed final schemas must reach the actual provider`);
      assert.deepEqual(toolSchemas(body.tools), toolSchemas(original), `${current.name}: original wire roster, schemas and metadata must stay intact`);
      const system = systemText(body);
      assert.equal(commandInventory(system), commandInventory(nativePrompt), `${current.name}: native command discovery must reach the provider unchanged`);
      const regions = [...system.matchAll(/<omp-model-preset>\n([\s\S]*?)\n<\/omp-model-preset>/g)];
      assert.equal(regions.length, 1, `${current.name}: actual request must contain exactly one marked role`);
      const role = regions[0]![1]!;
      const guidance = [...system.matchAll(/<omp-code-mode>\n([\s\S]*?)\n<\/omp-code-mode>/g)];
      if (current.model === geminiModel) {
        assert.deepEqual(body.tools, original, "Gemini must retain every native tool schema and description");
        const nativeRole = nativePrompt.split(/\n[§⁂] Runtime\n/, 1)[0]?.split(/\n[§⁂] Role\n/).at(-1);
        assert.equal(role, nativeRole, "Gemini must receive the native role rather than a model preset");
        assert.equal(guidance.length, 0, "Gemini must not receive Superkit code-mode guidance");
        return;
      }
      presetRegions++;
      assert.equal(guidance.length, 1, `${current.name}: code-mode guidance must appear once per request`);
      const [region, instructions] = guidance[0] ?? [];
      assert(region && instructions && role.includes(region), `${current.name}: code-mode guidance belongs inside the marked role`);
      const profile = renderPreset({ id: current.model, provider }, { surface: "app", toolNames: native.activeTools });
      assert(profile, `${current.name}: the switched model must have a shipped profile`);
      assert.equal(role.replace(region, "").trimEnd(), profile.prompt.trimEnd(), `${current.name}: guidance must preserve the model-specific role`);
      const evalSchema = original.find(tool => tool.function.name === "eval")?.function.parameters;
      const properties = evalSchema?.properties;
      assert(properties && typeof properties === "object" && "language" in properties, "host must supply the native eval language schema");
      const languageSchema = JSON.stringify(properties.language);
      assert.equal(languageSchema.includes('"js"'), onlyKernel !== "py", "native JS availability");
      assert.equal(languageSchema.includes('"py"'), onlyKernel !== "js", "native Python availability");
      assert.deepEqual([...instructions.matchAll(/language="(py|js)"/g)].map(match => match[1]), onlyKernel ? [onlyKernel] : ["js", "py"]);
      assert.match(instructions, /\bawait\s+tool\.task\s*\(/, `${current.name}: task orchestration must stay inside eval`);
      assert.match(instructions, /<name> --help/, `${current.name}: guidance must point to native command help`);
      assert.match(instructions, /propose, resolve, reject\).*direct tool when offered.*outer bash.*mounted command/, `${current.name}: both decision routes must reach OMP's outer result handler`);
      assert.match(instructions, /tool\["name"\]\(args\)/, `${current.name}: guidance must show bracket lookup`);
      assert.doesNotMatch(instructions, /parallel|sequential|Promise\.all/, `${current.name}: guidance must not duplicate concurrency policy`);
      assert.doesNotMatch(instructions, /JSON Schema:|Direct custom wire format/, `${current.name}: guidance must not duplicate native tool schemas`);
      for (const name of [bridgeProbe.name, mountedProbe.name]) {
        assert(!instructions.includes(name), `${current.name}: generic guidance must not enumerate ${name}`);
      }
      // The separate model-preset guidance pass may still adapt native descriptions.
      assert.deepEqual({ tools: body.tools }, rewriteToolGuidancePayload({ tools: original }, "openai-completions", role),
        `${current.name}: code mode must not add a catalog or otherwise rewrite native tool descriptions`);
    });
  }
  if (failure) throw failure;
  const requests = turns.reduce((sum, item) => sum + item.calls.length, 0);
  console.log(JSON.stringify({
    status: "PASS", requests,
    scenarios: turns.map(item => ({
      name: item.name, model: item.model,
      mode: item.model === geminiModel ? "direct" : item.language === "js" ? "guided JS" : (onlyKernel ? "Python fallback" : "Python library"),
      requests: item.calls.length,
    })),
    assertions: ["full index installation", "unchanged native activation before/after hooks for every model",
      "Gemini receives the native role and original tools and runs native read directly",
      "unchanged native wire roster and schemas for every request", "no code-mode catalog in role guidance or eval description",
      "kernel-aware guidance for tool calls including task; JS calls use a Bun-specific API",
      "real eval tool.read sentinel and missing-file diagnostic per code-mode model",
      "real eval tool.edit applies native apply_patch input and reads back the created file",
      "bracket lookup invokes the directly advertised hyphenated tool",
      "native command inventory and real help discover the off-wire mounted tool; eval calls it alongside native read",
      "defined, undefine and result_attach invoke registered tools directly, never eval-local helpers",
      "native task and write stay available directly", "native todo completion readback",
      "model switches preserve the corresponding native or model-specific role"],
    promptIntegration: `${presetRegions} installed preset regions across ${requests} provider requests checked`,
    limitations: ["Scripted loopback responses verify transport, not model obedience"],
  }, null, 2));
} catch (error) {
  fail(error);
  throw error;
} finally {
  clearTimeout(deadline);
  stopping = true;
  if (child) {
    child.kill("SIGTERM");
    const killDeadline = setTimeout(() => child?.kill("SIGKILL"), 5_000);
    try { await child.exited; } finally { clearTimeout(killDeadline); }
  }
  await output;
  const errors = await stderr;
  if (failure && errors) console.error(errors);
  await server.stop(true);
  rmSync(root, { recursive: true, force: true });
}
