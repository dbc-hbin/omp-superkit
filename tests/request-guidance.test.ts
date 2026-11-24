import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import install from "../index";

const native = readFileSync(new URL("./fixtures/omp-system-prompt.md", import.meta.url), "utf8");
const schema = { type: "object", properties: { language: { enum: ["js", "py"] } } };
const defs = ["eval", "task", "bash"].map(name => ({ name, description: name, parameters: schema }));
const tools = defs.map(tool => ({ name: `_${tool.name}`, input_schema: tool.parameters, description: tool.description }));
const claude = { id: "claude-sonnet-5-5", api: "anthropic-messages" };
const gemini = { id: "gemini-preview", api: "factory-droid-agent" };
const codeMarker = "<omp-code-mode>";

function session(base: string, subagent = false) {
  type Handler = (event: never, ctx: never) => unknown;
  const handlers = new Map<string, Handler[]>();
  install({
    setLabel() {}, getCommands: () => [], registerCommand() {}, registerFlag() {}, sendUserMessage() {}, appendEntry() {}, getFlag: () => false,
    getActiveTools: () => defs.map(tool => tool.name), getAllTools: () => defs,
    on: (key: string, handler: Handler) => { handlers.set(key, [...handlers.get(key) ?? [], handler]); },
  });
  const ctx = { cwd: ".", mode: "rpc", model: claude, agent: { kind: subagent ? "sub" : "main" },
    ui: { notify() {} }, sessionManager: { getSessionId: () => "request-test", getBranch: () => [] } };
  let blocks = [base];
  for (const hook of handlers.get("before_agent_start") ?? []) {
    const next: unknown = Reflect.apply(hook, undefined, [{ prompt: "inspect", systemPrompt: blocks }, ctx]);
    if (next && typeof next === "object" && "systemPrompt" in next && Array.isArray(next.systemPrompt)) blocks = next.systemPrompt;
  }
  return {
    blocks,
    request(payload: unknown, model = claude): unknown {
      for (const hook of handlers.get("before_provider_request") ?? []) {
        payload = Reflect.apply(hook, undefined, [{ payload }, { ...ctx, model }]) ?? payload;
      }
      return payload;
    },
  };
}

test("a tool-free side turn drops eval guidance without changing the next ordinary turn", () => {
  const s = session(native);
  const system = s.blocks.map(text => ({ type: "text", text }));
  expect(system[0]?.text).not.toContain(codeMarker);
  const input = { system, tools, messages: [] };
  const previous = s.request(input);
  expect(previous).toHaveProperty("system.0.text", expect.stringContaining(codeMarker));
  for (const restriction of [{ tools: [] }, { tool_choice: { type: "none" } }, { tool_choice: { type: "tool", name: "_bash" } }]) {
    const restricted = { ...input, system: (previous as typeof input).system, ...restriction };
    const result = s.request(restricted);
    expect(JSON.stringify(result)).not.toContain(codeMarker);
    expect(result).toHaveProperty("tools", restricted.tools);
  }
  expect(JSON.stringify(s.request(input))).toContain(codeMarker);
});

test("removing direct task on a retry drops its accounting route but keeps bridge dispatch", () => {
  const s = session(native);
  const catalog = { name: "_eval", input_schema: schema, description: "One cell per call;\nSession tool names: task." };
  const request = { system: s.blocks[0], messages: [], tools: [catalog, ...tools.filter(tool => tool.name !== catalog.name)] };
  const first = s.request(request);
  expect(first).toHaveProperty("system", expect.stringContaining("top-level task"));
  const retry = s.request({ ...request, tools: [catalog] });
  expect(retry).toHaveProperty("system", expect.not.stringContaining("top-level task"));
  expect(retry).toHaveProperty("system", expect.stringContaining("await tool.task("));
  expect(retry).toHaveProperty("tools", [catalog]);
});

test.each([["custom", "custom role, keep verbatim"], ["revived", native]])("an unmarked %s role gets a separate request-local guidance block", (_kind, base) => {
  const s = session(base, true);
  // On revive OMP replays the start hook but sends the original base, not its return.
  const role = { type: "text", text: base };
  const assignment = { type: "text", text: "Read-only child assignment. Document <omp-model-preset>verbatim</omp-model-preset>." };
  const input = { system: [role, assignment], tools, messages: [{ role: "user", content: "inspect" }] };
  const result = s.request(input);
  expect(result).toHaveProperty("system.0", role);
  expect(result).toHaveProperty("system.1", assignment);
  expect(result).toHaveProperty("messages", input.messages);
  expect(result).toHaveProperty("tools", tools);
  expect(JSON.stringify(result).split(codeMarker)).toHaveLength(2);
  expect(s.request(result)).toEqual(result);
});

test("a same-turn retry on a wrapped Gemini transport restores native role and removes Claude guidance", () => {
  const s = session(native);
  const first = s.request({ system: s.blocks[0], messages: [], tools }) as { system: string };
  expect(first.system).toContain(codeMarker);
  const user = { role: "user", parts: [{ text: first.system }] };
  const body = { systemInstruction: { parts: [{ text: first.system }] }, contents: [user] };
  const retry = s.request(body, gemini);
  expect(retry).toHaveProperty("contents", [user]);
  expect(retry).toHaveProperty("systemInstruction.parts.0.text", expect.stringContaining("You are omp's trusted coding assistant."));
  expect(retry).toHaveProperty("systemInstruction.parts.0.text", expect.not.stringContaining(codeMarker));
  expect(JSON.stringify(s.request({ system: s.blocks[0], messages: [], tools }))).toContain(codeMarker);
});

test("a provider prefix survives the role refresh in coalesced Responses instructions", () => {
  const s = session(native);
  const model = { id: "grok-4.7", api: "factory-droid-agent" };
  const prefix = "Provider identity. A quoted <omp-model-preset>example</omp-model-preset> is not the host role.\n\n";
  const input = [{ role: "user", content: s.blocks[0] }];
  const functions = defs.map(({ name, description, parameters }) => ({ type: "function", name, description, parameters }));
  const request = { instructions: s.blocks[0], input, tools: functions };
  const plain = s.request(request, model) as typeof request;
  expect(plain.instructions).toContain("Grok 4.7");
  expect(plain.instructions).toContain("await tool.task(");
  const prefixed = s.request({ ...request, instructions: prefix + request.instructions }, model) as typeof request;
  expect(prefixed.instructions).toBe(prefix + plain.instructions);
  expect(prefixed.input).toBe(input);
  expect(s.request(prefixed, model)).toEqual(prefixed);
});

test("Devin's assigned backend controls Gemini exclusion, not the adaptive router name", () => {
  const s = session(native);
  const router = { id: "adaptive", api: "devin-agent" };
  const input = {
    prompt: s.blocks[0], chatModelUid: "MODEL_GOOGLE_GEMINI_PRO",
    chatMessagePrompts: [{ prompt: "inspect" }],
    tools: defs.map(tool => ({ name: tool.name, jsonSchemaString: JSON.stringify(tool.parameters) })),
  };
  const retry = s.request(input, router) as typeof input;
  expect(retry.prompt).not.toContain(codeMarker);
  expect(retry.prompt).toContain("You are omp's trusted coding assistant.");
  expect(retry.tools).toBe(input.tools);
  expect(retry.chatMessagePrompts).toBe(input.chatMessagePrompts);
  expect(s.request({ ...input, chatModelUid: "MODEL_OPENAI_GPT" }, router)).toHaveProperty("prompt", expect.stringContaining(codeMarker));
});
