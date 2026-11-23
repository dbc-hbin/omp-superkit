import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import install from "../index";

const native = readFileSync(new URL("./fixtures/omp-system-prompt.md", import.meta.url), "utf8");
const model = { api: "openai-codex-responses", provider: "openai-codex", id: "gpt-5.6-luna", baseUrl: "https://first.example" };
const tools = [
  { type: "function", name: "read", parameters: { type: "object" } },
  { type: "function", name: "eval", parameters: { type: "object", properties: { language: { enum: ["js", "py"] } } } },
];
const read = { type: "function", name: "read" };
const user = { type: "message", role: "user", content: "Inspect the files." };
const output = { type: "function_call_output", call_id: "read_1", output: "<omp-code-mode>literal file bytes</omp-code-mode>" };
const codexDeveloper = (text: string) => ({
  id: "msg_base", type: "message", role: "developer", content: [{ type: "input_text", text }],
  internal_chat_message_metadata_passthrough: { content_item_kinds: ["model.base_instructions"] },
});

function input(payload: unknown): readonly unknown[] {
  if (typeof payload === "object" && payload !== null && "input" in payload && Array.isArray(payload.input)) return payload.input;
  throw new Error("Expected a Codex input array");
}

function guidanceCount(items: readonly unknown[]): number {
  return items.filter(item => typeof item === "object" && item !== null && "role" in item &&
    item.role === "developer" && JSON.stringify(item).includes("<omp-code-mode>")).length;
}

function session(mode: "Full" | "Lite") {
  type Handler = (event: never, ctx: never) => unknown;
  const handlers = new Map<string, Handler[]>();
  install({
    setLabel() {}, getCommands: () => [], registerCommand() {}, registerFlag() {}, sendUserMessage() {}, appendEntry() {},
    getFlag: () => false, getActiveTools: () => tools.map(tool => tool.name), getAllTools: () => tools,
    on: (key: string, handler: Handler) => { handlers.set(key, [...(handlers.get(key) ?? []), handler]); },
  });
  const sessionId = "chain-session";
  const ctx = {
    cwd: ".", mode: "rpc", model, agent: { kind: "sub" },
    ui: { notify() {} }, sessionManager: { getSessionId: () => sessionId, getBranch: () => [] },
  };
  function emit(name: string, event: object, baseUrl = model.baseUrl): unknown {
    const hooks = handlers.get(name);
    if (!hooks) throw new Error(`Missing extension hook: ${name}`);
    let result: unknown;
    for (const hook of hooks) result = Reflect.apply(hook, undefined, [event, { ...ctx, model: { ...model, baseUrl } }]) ?? result;
    return result;
  }
  const start = emit("before_agent_start", { prompt: "Inspect the files.", systemPrompt: [native] });
  if (typeof start !== "object" || start === null || !("systemPrompt" in start) || !Array.isArray(start.systemPrompt) ||
    typeof start.systemPrompt[0] !== "string") throw new Error("Expected a marked native system prompt");
  const base = codexDeveloper(start.systemPrompt[0]);
  const control = { type: "additional_tools", role: "developer", tools };
  return {
    base,
    frame(items: readonly unknown[], toolChoice: "auto" | typeof read, previous?: string) {
      return {
        type: "response.create", stream: true, model: model.id, tool_choice: toolChoice, prompt_cache_key: sessionId,
        client_metadata: {
          session_id: sessionId, thread_id: "thread_1", "x-codex-window-id": "window_1",
          ...(mode === "Lite" ? { ws_request_header_x_openai_internal_codex_responses_lite: "true" } : {}),
        },
        ...(mode === "Full" ? { tools } : { parallel_tool_calls: false }),
        ...(previous ? { previous_response_id: previous } : {}),
        input: mode === "Lite" && !previous ? [control, ...items] : items,
      };
    },
    request(payload: object, baseUrl?: string): unknown {
      return emit("before_provider_request", { payload }, baseUrl) ?? payload;
    },
    complete(responseId: string, stopReason: "stop" | "toolUse" | "error" | "aborted" = "toolUse") {
      emit("assistant_message", {
        message: { role: "assistant", api: model.api, provider: model.provider, model: model.id, responseId, stopReason },
      });
    },
  };
}

test.each(["Full", "Lite"] as const)("%s refreshes guidance when a confirmed Codex chain changes capabilities", mode => {
  const s = session(mode);
  const raw = s.frame([s.base, user], read);
  expect(guidanceCount(input(raw))).toBe(0); // This is the prefix OMP reattaches, not what the hook sent.
  expect(guidanceCount(input(s.request(raw)))).toBe(0);
  s.complete("resp_read");

  const enable = s.frame([output], "auto", "resp_read");
  const replay = s.request(enable);
  expect(replay).not.toHaveProperty("previous_response_id");
  expect(replay).not.toHaveProperty("instructions");
  expect(replay).toHaveProperty("tool_choice", "auto");
  expect(input(replay)[0]).toBe(output); // Preserve the native call/result boundary on replay.
  expect(input(replay)).toHaveLength(2);
  expect(guidanceCount([...input(raw), ...input(replay)])).toBe(1);
  s.complete("resp_enabled");

  const same = s.frame([output], "auto", "resp_enabled");
  expect(s.request(same)).toBe(same);
  s.complete("resp_unchanged");

  const disable = s.frame([output], read, "resp_unchanged");
  const disabled = s.request(disable);
  expect(disabled).not.toHaveProperty("previous_response_id");
  expect(disabled).toHaveProperty("tool_choice", read);
  expect(input(disabled)).toBe(disable.input);
  expect(guidanceCount([...input(raw), ...input(disabled)])).toBe(0);
  s.complete("resp_disabled");

  const stillDisabled = s.frame([output], read, "resp_disabled");
  expect(s.request(stillDisabled)).toBe(stillDisabled);
});

test.each(["error", "aborted"] as const)("a %s attempt does not advance the accepted Codex guidance", stopReason => {
  const s = session("Full");
  expect(guidanceCount(input(s.request(s.frame([s.base, user], "auto"))))).toBe(1);
  s.complete("resp_eval");
  const restrict = s.frame([output], read, "resp_eval");
  expect(s.request(restrict)).not.toHaveProperty("previous_response_id");
  // The transport may retry before any assistant event has been emitted.
  expect(s.request(restrict)).not.toHaveProperty("previous_response_id");
  s.complete("resp_failed", stopReason);

  // An ID on a failed response proves neither a new anchor nor a changed capability baseline.
  const rejected = s.frame([output], "auto", "resp_failed");
  expect(s.request(rejected)).toBe(rejected);
  expect(s.request(restrict)).not.toHaveProperty("previous_response_id");
});

test("a Codex response ID is scoped to its server even when model and session match", () => {
  const s = session("Full");
  const otherServer = "https://second.example";
  s.request(s.frame([s.base, user], read));
  s.complete("resp_same");

  const enable = s.frame([output], "auto", "resp_same");
  expect(s.request(enable, otherServer)).toBe(enable);

  s.request(s.frame([s.base, user], "auto"), otherServer);
  s.complete("resp_same");
  expect(s.request(enable, otherServer)).toBe(enable);
  expect(s.request(enable)).not.toHaveProperty("previous_response_id");
});

test("an isolated Codex side request does not steal the main response ID", () => {
  const s = session("Full");
  const initial = s.frame([s.base, user], read);
  s.request(initial);
  const side = {
    ...initial, tool_choice: "auto",
    client_metadata: { ...initial.client_metadata, session_id: "chain-session:side:1", thread_id: "side_thread" },
  };
  s.request(side);
  s.complete("resp_main");

  const main = s.frame([output], "auto", "resp_main");
  expect(s.request(main)).not.toHaveProperty("previous_response_id");
});

test("a successful Codex SSE fallback does not confirm a failed WebSocket attempt", () => {
  const s = session("Full");
  s.request(s.frame([s.base, user], "auto"));
  s.complete("resp_enabled");
  s.request(s.frame([output], read, "resp_enabled"));
  const { type: wsFrameType, ...sse } = s.frame([s.base, user], read);
  s.request(sse);
  s.complete("resp_sse", "stop");

  const allegedContinuation = s.frame([output], "auto", "resp_sse");
  expect(s.request(allegedContinuation)).toBe(allegedContinuation);
});
