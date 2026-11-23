import { describe, expect, test } from "bun:test";
import { rewritePresetPayload, rewriteToolGuidancePayload, syncCodeModeBlock } from "./payload";
import { adaptResearchRouting } from "./host";
import { adaptToolGuidance } from "./host-guidance";
import { renderPreset } from "./presets";

const oldPreset = "<omp-model-preset>old profile</omp-model-preset>";
const newPreset = "<omp-model-preset>new profile $& $` $' $$</omp-model-preset>";
const oldText = `Host instructions\n\n${oldPreset}\n\nProject rules`;
const newText = `Host instructions\n\n${newPreset}\n\nProject rules`;

// Pinned v18.19.0 todo.md and eval.md mechanics; helper contracts remain native-owned.
const nativeTodo = [
	"`todo` NEVER takes a turn of its own: emit it in the same response as your next real tool call (parallel tool calls), `init` beside the first read or action, `done`/`start` beside the next action or check. A response whose only call is `todo` wastes a full model round trip.",
	"Tasks identified by verbatim content, NEVER generated IDs (task-1). Unique, stable task/phase names; lost text: view, NEVER guess.",
	"`append` requires `items`; omitted `phase` uses the in-progress task's phase, else the first pending task's phase, else the last phase, else a new `Tasks` phase. Supply `phase` to target another phase; an empty name is invalid.",
	"Before work, init for 3+ steps, requested task sets, or new instructions. MUST list EVERY user item separately (phased/numbered/bulleted/N); NEVER omit or remember leftovers.",
	"After successful mutation: no active means earliest pending starts (phase order); multiple active means only earliest stays. Done out of order may rewind pointer but NEVER reopen completed. Mark done immediately; follow phase order.",
].join("\n");
const nativeShBlocks = [
	[
		"sh(command, cwd?, timeout?); JS: await sh(…) or await sh`cmd ${arg}` — embedded bash engine, runs to completion (never backgrounded)",
		"  returns stdout+stderr; non-zero exit raises ShellError (.exit_code/.exitCode, .output)",
		"  JS interpolations are shell-quoted; starts in the session cwd unless cwd is given",
	].join("\n"),
	[
		"sh(command, cwd?, timeout?) — embedded bash engine, runs to completion (never backgrounded)",
		"  returns stdout+stderr; non-zero exit raises ShellError (`.exit_code`, `.output`); starts in the session cwd unless `cwd` is given",
	].join("\n"),
	[
		"await sh(command, { cwd?, timeout? })  await sh`cmd ${arg}` — embedded bash engine, runs to completion (never backgrounded)",
		"  resolves to stdout+stderr; non-zero exit throws ShellError (`.exitCode`, `.output`)",
		"  interpolations are shell-quoted; starts in the session cwd unless `cwd` is given",
	].join("\n"),
];
const workpoolRule = "For 2+ independent items, use a named `workpool()`; results auto-deliver.";
const profile = renderPreset({ id: "gpt-6.1-terra" }, { surface: "app", toolNames: ["todo", "eval", "bash"] })!.prompt;
function nativeEval(sh: string): string {
	return [
		"One cell per call; top-level state persists, including across compaction.", workpoolRule,
		"On error, retry only the failed step; earlier steps may have taken effect.",
		"<prelude>", "`await` marks async helpers; the rest are sync.", "```",
		"print(value, ...)  log(message)  phase(title)  env(key?, value?)",
		"read(path, offset?, limit?)  write(path, content)  output(*ids, format?, query?, offset?, limit?)",
		"wait(handles, timeout?=None, raise_errors?=True)", "await tool.<name>(args)", sh,
		"```", "Session tool names: read, bash, todo.", "</prelude>",
		"<namespaces>More globals → help://eval/helpers</namespaces>",
		"<critical>NEVER repeat successful setup. Kernel-loss notice means reload setup.</critical>",
		"Long cells may auto-background and deliver later; the kernel stays busy.",
		"`timeout: 0` disables the cell deadline, not the foreground wait.",
	].join("\n");
}

test("native todo deduplication keeps every mechanism and requires complete active-profile coverage", () => {
	const parallelAdapted = nativeTodo.replace(" (parallel tool calls)", "");
	const expected = parallelAdapted
		.replace("`todo` NEVER takes a turn of its own: emit it in the same response as your next real tool call, ", "")
		.replace(" A response whose only call is `todo` wastes a full model round trip.", "");
	expect(profile).toMatch(/Never make a todo-only turn: (?:send|emit) todo in the same response as the next real tool call\./);
	for (const description of [nativeTodo, parallelAdapted]) {
		expect(adaptToolGuidance("todo", description, profile)).toBe(expected);
		for (const verb of ["send", "emit"]) {
			expect(adaptToolGuidance("todo", description, `Never make a todo-only turn: ${verb} todo in the same response as the next real tool call.`)).toBe(expected);
		}
	}
	for (const missing of ["", newPreset, "Never make a todo-only turn.", "Emit todo in the same response as the next real tool call."]) {
		expect(adaptToolGuidance("todo", nativeTodo, missing)).toBe(parallelAdapted);
	}
	for (const custom of [
		"Custom todo: " + nativeTodo,
		nativeTodo.replace("as your next real tool call", "before the next real tool call"),
		nativeTodo.replace("`init` beside the first read or action", "`init` before the first action"),
		nativeTodo.replace("A response whose only call is `todo` wastes a full model round trip.", "A todo-only response is forbidden."),
	]) {
		expect(adaptToolGuidance("todo", custom, profile)).toBe(custom.startsWith("`todo`") ? custom.replace(" (parallel tool calls)", "") : custom);
	}
	expect(adaptToolGuidance("custom_todo", nativeTodo, profile)).toBe(nativeTodo);
});

test("native eval retains helper and lifecycle contracts regardless of active profile", () => {
	const profiles = ["gpt-6.1-terra", "claude-opus-5.5", "kimi-k3", "grok-4.5"]
		.map(id => renderPreset({ id }, { surface: "app", toolNames: ["todo", "eval", "bash"] })!.prompt);
	for (const sh of nativeShBlocks) {
		const description = nativeEval(sh);
		const parallelAdapted = description.replace(workpoolRule, "`workpool()` results auto-deliver.");
		for (const activeProfile of [...profiles, "", newPreset]) {
			expect(activeProfile).not.toContain("Use `sh()`");
			expect(adaptToolGuidance("eval", description, activeProfile)).toBe(parallelAdapted);
			expect(adaptToolGuidance("eval", parallelAdapted, activeProfile)).toBe(parallelAdapted);
		}
		for (const custom of [
			description.replace("One cell per call; top-level state persists, including across compaction.", "One cell per call; custom execution."),
			description.replace("embedded bash engine", "external bash process"),
			description.replace("runs to completion (never backgrounded)", "runs to completion; never backgrounded"),
			description.replace("ShellError", "CustomError"),
		]) {
			expect(adaptToolGuidance("eval", custom, profile)).toBe(custom.replace(workpoolRule, "`workpool()` results auto-deliver."));
		}
		expect(adaptToolGuidance("eval", "Custom eval\n" + description, profile)).toBe("Custom eval\n" + description);
		expect(adaptToolGuidance("custom_eval", description, profile)).toBe(description);
	}
});

test("native duplicate rewriting preserves schemas and user text across provider tool paths", () => {
	const description = nativeEval(nativeShBlocks[0]);
	const schema = { type: "object", description: nativeTodo, properties: { command: { type: "string", description } } };
	const definitions = [
		{ name: "todo", description: nativeTodo, parameters: schema, strict: true },
		{ name: "eval", description, parameters: schema, strict: true },
		{ name: "custom_todo", description: nativeTodo, parameters: schema },
	];
	const changed = definitions.map(tool => ({ ...tool, description: adaptToolGuidance(tool.name, tool.description, profile) }));
	const messages = [{ role: "system", content: profile }, { role: "user", content: profile + nativeTodo + description }, { role: "tool", content: nativeTodo + description }];
	const shapes = [
		{ api: "openai-responses", wrap: (tools: typeof definitions) => ({ tools: tools.map(tool => ({ type: "function", ...tool })) }) },
		{ api: "openai-codex-responses", wrap: (tools: typeof definitions) => ({ tools: [{ type: "namespace", name: "functions", tools: tools.map(tool => ({ type: "function", ...tool })) }] }) },
		{ api: "openai-completions", wrap: (tools: typeof definitions) => ({ tools: tools.map(tool => ({ type: "function", function: tool })) }) },
		{ api: "anthropic-messages", wrap: (tools: typeof definitions) => ({ tools: tools.map(({ parameters, ...tool }) => ({ ...tool, input_schema: parameters, cache_control: { type: "ephemeral" } })) }) },
		{ api: "google-generative-ai", wrap: (tools: typeof definitions) => ({ config: { tools: [{ functionDeclarations: tools }] } }) },
		{ api: "google-vertex", wrap: (tools: typeof definitions) => ({ tools: [{ functionDeclarations: tools }] }) },
		{ api: "google-gemini-cli", wrap: (tools: typeof definitions) => ({ request: { tools: [{ functionDeclarations: tools }] } }) },
		{ api: "antigravity-cli", wrap: (tools: typeof definitions) => ({ request: { tools: [{ functionDeclarations: tools }] } }) },
		{ api: "bedrock-converse-stream", wrap: (tools: typeof definitions) => ({ toolConfig: { tools: tools.map(toolSpec => ({ toolSpec })) } }) },
		{ api: "bedrock-converse-stream", wrap: (tools: typeof definitions) => ({ commandInput: { toolConfig: { tools: tools.map(toolSpec => ({ toolSpec })) } } }) },
	];
	for (const { api, wrap } of shapes) {
		const payload = { ...wrap(definitions), messages, metadata: { description: nativeTodo } };
		const snapshot = structuredClone(payload);
		const result = rewriteToolGuidancePayload(payload, api, profile);
		expect(result).toEqual({ ...wrap(changed), messages, metadata: payload.metadata });
		expect(payload).toEqual(snapshot);
		expect(rewriteToolGuidancePayload(result, api, profile)).toBe(result);
		// Arbitrary system/user content is never evidence of profile coverage.
		const retained = definitions.map(tool => ({ ...tool, description: adaptToolGuidance(tool.name, tool.description, "") }));
		expect(rewriteToolGuidancePayload(payload, api, "")).toEqual({ ...wrap(retained), messages, metadata: payload.metadata });
	}
	const unknown = { tools: definitions, messages };
	expect(rewriteToolGuidancePayload(unknown, "unknown-api", profile)).toBe(unknown);
});

test("task routing adaptation preserves transport structure, schemas, unrelated tools and messages", () => {
	const description = "Read-only research MUST use `scout` only when files unknown.";
	const schema = { type: "object", properties: { tasks: { type: "array" } }, required: ["tasks"] };
	const task = { name: "task", description, parameters: schema, strict: true };
	const other = { name: "custom_task", description, parameters: schema };
	const changed = { ...task, description: adaptResearchRouting(description) };
	expect(changed.description).not.toBe(description);
	const messages = [{ role: "user", content: description }, { role: "tool", content: description }];
	const shapes = [
		{ api: "openai-responses", payload: { tools: [{ type: "function", ...task }, { type: "function", ...other }] }, expected: { tools: [{ type: "function", ...changed }, { type: "function", ...other }] } },
		{ api: "openai-codex-responses", payload: { tools: [{ type: "namespace", name: "functions", tools: [{ type: "function", ...task }] }, { type: "namespace", name: "custom", tools: [{ type: "function", ...task }] }] }, expected: { tools: [{ type: "namespace", name: "functions", tools: [{ type: "function", ...changed }] }, { type: "namespace", name: "custom", tools: [{ type: "function", ...task }] }] } },
		{ api: "openai-completions", payload: { tools: [{ type: "function", function: task }, { type: "function", function: other }] }, expected: { tools: [{ type: "function", function: changed }, { type: "function", function: other }] } },
		{ api: "anthropic-messages", payload: { tools: [{ name: task.name, description, input_schema: schema, cache_control: { type: "ephemeral" } }, other] }, expected: { tools: [{ name: task.name, description: changed.description, input_schema: schema, cache_control: { type: "ephemeral" } }, other] } },
		{ api: "google-generative-ai", payload: { config: { tools: [{ functionDeclarations: [task, other] }] } }, expected: { config: { tools: [{ functionDeclarations: [changed, other] }] } } },
		{ api: "google-vertex", payload: { tools: [{ functionDeclarations: [task] }] }, expected: { tools: [{ functionDeclarations: [changed] }] } },
		{ api: "google-gemini-cli", payload: { request: { tools: [{ functionDeclarations: [task] }] } }, expected: { request: { tools: [{ functionDeclarations: [changed] }] } } },
		{ api: "antigravity-cli", payload: { request: { tools: [{ functionDeclarations: [task] }] } }, expected: { request: { tools: [{ functionDeclarations: [changed] }] } } },
		{ api: "bedrock-converse-stream", payload: { toolConfig: { tools: [{ toolSpec: task }] } }, expected: { toolConfig: { tools: [{ toolSpec: changed }] } } },
		{ api: "bedrock-converse-stream", payload: { commandInput: { toolConfig: { tools: [{ toolSpec: task }] } } }, expected: { commandInput: { toolConfig: { tools: [{ toolSpec: changed }] } } } },
	];
	for (const { api, payload, expected } of shapes) {
		const input = { ...payload, messages, metadata: { description } };
		const snapshot = structuredClone(input);
		const result = rewriteToolGuidancePayload(input, api, newPreset);
		expect(result).toEqual({ ...expected, messages, metadata: { description } });
		expect(input).toEqual(snapshot);
		expect(rewriteToolGuidancePayload(result, api, newPreset)).toBe(result);
	}
	const custom = { tools: [{ type: "function", function: { ...task, description: "User-authored task contract" } }] };
	expect(rewriteToolGuidancePayload(custom, "openai-completions", newPreset)).toBe(custom);
	const unknown = { tools: [task], messages };
	expect(rewriteToolGuidancePayload(unknown, "unknown-api", newPreset)).toBe(unknown);
});

test("Antigravity aliases adapt task routing while preserving native bash guidance and custom content", () => {
	const taskDescription = "Read-only research MUST use `scout` only when files unknown.";
	const bashDescription = "Persistent bash 5.3.";
	const schema = { type: "object", description: taskDescription, properties: { command: { type: "string", description: bashDescription } } };
	const task = { name: "invoke_subagent", description: taskDescription, parameters: schema };
	const bash = { name: "run_command", description: bashDescription, parameters: schema };
	const enabled = [{ name: "task" }, { name: "bash" }];
	const customTask = { ...task, description: "User-authored subagent contract" };
	const customBash = { ...bash, description: "User-authored command contract" };
	const unknown = { name: "custom_tool", description: taskDescription, parameters: schema };
	const payload = {
		request: {
			tools: [{ functionDeclarations: [task, bash, customTask, customBash, unknown] }],
			contents: [{ role: "user", parts: [{ text: taskDescription + bashDescription }] }],
		},
		messages: [{ role: "user", content: taskDescription + bashDescription }],
	};
	const snapshot = structuredClone(payload);
	const changedTask = { ...task, description: adaptResearchRouting(taskDescription) };
	const changedBash = { ...bash, description: adaptToolGuidance("bash", bashDescription, profile) };
	expect(changedTask.description).not.toBe(taskDescription);
	expect(changedBash.description).toBe(bashDescription);
	const result = rewriteToolGuidancePayload(payload, "antigravity-cli", profile, enabled);
	expect(result).toEqual({
		...payload,
		request: { ...payload.request, tools: [{ functionDeclarations: [changedTask, changedBash, customTask, customBash, unknown] }] },
	});
	expect(payload).toEqual(snapshot);
	expect(rewriteToolGuidancePayload(result, "antigravity-cli", profile, enabled)).toBe(result);
	expect(rewriteToolGuidancePayload(payload, "google-gemini-cli", profile, enabled)).toBe(payload);
	expect(rewriteToolGuidancePayload(payload, "antigravity-cli", profile, [...enabled, { name: "invoke_subagent" }])).toBe(payload);
});

test("Anthropic alias metadata matches unprefixed guidance without touching wire names or schemas", () => {
	const descriptions = {
		task: "Read-only research MUST use `scout` only when files unknown.",
		todo: nativeTodo,
		eval: nativeEval(nativeShBlocks[0]),
		bash: "Persistent bash 5.3.",
	};
	const schema = { type: "object", properties: { code: { type: "string", description: descriptions.task } } };
	const tools = Object.entries(descriptions).map(([name, description]) => ({
		name, description, input_schema: schema, cache_control: { type: "ephemeral" },
	}));
	const apiKey = { tools };
	const prefixed = { tools: tools.map(tool => ({ ...tool, name: `_${tool.name}` })) };
	const adapted = tools.map(tool => ({ ...tool, description: tool.name === "task"
		? adaptResearchRouting(tool.description) : adaptToolGuidance(tool.name, tool.description, profile) }));
	expect(rewriteToolGuidancePayload(apiKey, "anthropic-messages", profile)).toEqual({ tools: adapted });
	const expected = { tools: adapted.map(tool => ({ ...tool, name: `_${tool.name}` })) };
	const result = rewriteToolGuidancePayload(prefixed, "anthropic-messages", profile, tools);
	expect(result).toEqual(expected);
	expect(rewriteToolGuidancePayload(result, "anthropic-messages", profile, tools)).toBe(result);
	expect(rewriteToolGuidancePayload(prefixed, "anthropic-messages", profile, prefixed.tools)).toBe(prefixed);
});

const devinPresetPayload = {
	$typeName: "exa.api_server_pb.GetChatMessageRequest",
	prompt: oldText,
	chatMessagePrompts: [{ $typeName: "exa.chat_pb.ChatMessagePrompt", prompt: oldPreset }],
	configuration: { maxTokens: 8192n },
	metadata: { text: oldPreset },
	tools: [{ $typeName: "exa.chat_pb.ChatToolDefinition", name: "eval", jsonSchemaString: '{"type":"object"}' }],
	toolChoice: { $typeName: "exa.chat_pb.ChatToolChoice", choice: { case: "optionName", value: "auto" } },
};

const realisticShapes: { api: string; payload: unknown; expected: unknown }[] = [
	... ["ollama", "ollama-chat"].map(api => ({
		api,
		payload: { model: "qwen3", messages: [{ role: "system", content: oldText }, { role: "user", content: oldPreset }, { role: "tool", content: oldPreset, tool_name: "shell" }], stream: true, think: true, options: { num_ctx: 32768 } },
		expected: { model: "qwen3", messages: [{ role: "system", content: newText }, { role: "user", content: oldPreset }, { role: "tool", content: oldPreset, tool_name: "shell" }], stream: true, think: true, options: { num_ctx: 32768 } },
	})),
	{
		api: "cursor-agent",
		payload: { $typeName: "agent.v1.AgentRunRequest", customSystemPrompt: oldText, conversationId: "c1", conversationState: { rootPromptMessagesJson: [new Uint8Array([1, 2, 3])] }, action: { case: "userMessage", value: { text: oldPreset } }, requestedModel: { modelId: "gpt-5.4" } },
		expected: { $typeName: "agent.v1.AgentRunRequest", customSystemPrompt: newText, conversationId: "c1", conversationState: { rootPromptMessagesJson: [new Uint8Array([1, 2, 3])] }, action: { case: "userMessage", value: { text: oldPreset } }, requestedModel: { modelId: "gpt-5.4" } },
	},
	{ api: "devin-agent", payload: devinPresetPayload, expected: { ...devinPresetPayload, prompt: newText } },
	... ["gitlab-duo-workflow", "gitlab-duo-agent"].flatMap(api => [false, true].map(wrapped => {
		const prompt = { name: "omp-inline", prompt_id: "omp-inline", unit_primitives: ["duo_agent_platform"], prompt_template: { system: oldText, user: oldPreset, placeholder: "history" } };
		const flowConfig = { version: "v1", environment: "ambient", prompts: [prompt], components: [{ name: "agent", type: "AgentComponent" }] };
		const payload = { flowConfig, flowConfigSchemaVersion: "v1", goal: oldPreset, mcpTools: [], workflowID: "w1" };
		const expected = { ...payload, flowConfig: { ...flowConfig, prompts: [{ ...prompt, prompt_template: { ...prompt.prompt_template, system: newText } }] } };
		return { api, payload: wrapped ? { startRequest: payload } : payload, expected: wrapped ? { startRequest: expected } : expected };
	})),
	... ["openai-responses", "azure-openai-responses", "openai-codex-responses"].map(api => ({
		api,
		payload: {
			model: "gpt-5.4", instructions: oldText, stream: true,
			input: [{ role: "user", content: oldPreset }],
			prompt_cache_key: "session", client_metadata: { turn: "abc" },
		},
		expected: {
			model: "gpt-5.4", instructions: newText, stream: true,
			input: [{ role: "user", content: oldPreset }],
			prompt_cache_key: "session", client_metadata: { turn: "abc" },
		},
	})),
	{
		api: "openai-codex-responses",
		payload: {
			type: "response.create", instructions: "Host prefix", previous_response_id: "resp_1",
			input: [
				{ role: "developer", content: oldText },
				{ role: "system", type: "message", content: [{ type: "input_text", text: oldPreset }] },
				{ type: "function_call_output", call_id: "call_1", output: oldPreset },
			],
		},
		expected: {
			type: "response.create", instructions: "Host prefix", previous_response_id: "resp_1",
			input: [
				{ role: "developer", content: newText },
				{ role: "system", type: "message", content: [{ type: "input_text", text: newPreset }] },
				{ type: "function_call_output", call_id: "call_1", output: oldPreset },
			],
		},
	},
	... ["openai-completions", "openrouter"].map(api => ({
		api,
		payload: {
			model: "gpt-5", messages: [
				{ role: "system", content: "Host prefix" },
				{ role: "developer", content: oldText, name: "policy" },
				{ role: "system", content: [{ type: "text", text: oldPreset, cache_control: { type: "ephemeral" } }] },
				{ role: "user", content: [{ type: "text", text: oldPreset }] },
				{ role: "tool", tool_call_id: "t1", content: oldPreset },
				{ role: "assistant", content: oldPreset },
			], tools: [{ type: "function", function: { name: "shell", description: oldPreset } }],
		},
		expected: {
			model: "gpt-5", messages: [
				{ role: "system", content: "Host prefix" },
				{ role: "developer", content: newText, name: "policy" },
				{ role: "system", content: [{ type: "text", text: newPreset, cache_control: { type: "ephemeral" } }] },
				{ role: "user", content: [{ type: "text", text: oldPreset }] },
				{ role: "tool", tool_call_id: "t1", content: oldPreset },
				{ role: "assistant", content: oldPreset },
			], tools: [{ type: "function", function: { name: "shell", description: oldPreset } }],
		},
	})),
	{
		api: "anthropic-messages",
		payload: {
			model: "claude-opus-4-6", system: [
				{ type: "text", text: "OAuth billing prefix" },
				{ type: "text", text: oldText, cache_control: { type: "ephemeral", ttl: "1h" }, extra: "keep" },
			], messages: [{ role: "user", content: [{ type: "text", text: oldPreset }] }],
			metadata: { user_id: "account-session" }, max_tokens: 8192,
		},
		expected: {
			model: "claude-opus-4-6", system: [
				{ type: "text", text: "OAuth billing prefix" },
				{ type: "text", text: newText, cache_control: { type: "ephemeral", ttl: "1h" }, extra: "keep" },
			], messages: [{ role: "user", content: [{ type: "text", text: oldPreset }] }],
			metadata: { user_id: "account-session" }, max_tokens: 8192,
		},
	},
	{ api: "anthropic-messages", payload: { system: oldText }, expected: { system: newText } },
	... ["google-generative-ai", "google-vertex"].flatMap(api => [
		{
			api,
			payload: { model: "gemini-3-pro", config: { systemInstruction: { parts: [{ text: oldText }] }, temperature: 0.5 }, contents: [{ role: "user", parts: [{ text: oldPreset }] }] },
			expected: { model: "gemini-3-pro", config: { systemInstruction: { parts: [{ text: newText }] }, temperature: 0.5 }, contents: [{ role: "user", parts: [{ text: oldPreset }] }] },
		},
		{
			api,
			payload: { systemInstruction: { role: "system", parts: [{ text: "Host prefix" }, { text: oldText }] }, generationConfig: { maxOutputTokens: 4096 } },
			expected: { systemInstruction: { role: "system", parts: [{ text: "Host prefix" }, { text: newText }] }, generationConfig: { maxOutputTokens: 4096 } },
		},
	]),
	... ["google-gemini-cli", "antigravity-cli"].map(api => ({
		api,
		payload: { project: "project-1", model: "gemini-3-pro", request: { systemInstruction: { role: "user", parts: [{ text: oldText }] }, contents: [{ role: "user", parts: [{ text: oldPreset }] }], sessionId: "s1" }, requestId: "req-1" },
		expected: { project: "project-1", model: "gemini-3-pro", request: { systemInstruction: { role: "user", parts: [{ text: newText }] }, contents: [{ role: "user", parts: [{ text: oldPreset }] }], sessionId: "s1" }, requestId: "req-1" },
	})),
	{
		api: "factory-droid-agent",
		payload: { model: "gemini", systemInstruction: { parts: [{ text: oldText }] }, contents: [{ role: "user", parts: [{ text: oldPreset }] }], generationConfig: { temperature: 0.5 } },
		expected: { model: "gemini", systemInstruction: { parts: [{ text: newText }] }, contents: [{ role: "user", parts: [{ text: oldPreset }] }], generationConfig: { temperature: 0.5 } },
	},
	{
		api: "gitlab-duo-agent",
		payload: { max_tokens: 8192, system: [{ type: "text", text: oldText }], messages: [{ role: "user", content: oldPreset }] },
		expected: { max_tokens: 8192, system: [{ type: "text", text: newText }], messages: [{ role: "user", content: oldPreset }] },
	},
	{
		api: "gitlab-duo-agent",
		payload: { model: "gpt", messages: [{ role: "developer", content: oldText }, { role: "user", content: oldPreset }] },
		expected: { model: "gpt", messages: [{ role: "developer", content: newText }, { role: "user", content: oldPreset }] },
	},
	{
		api: "gitlab-duo-agent",
		payload: { instructions: oldText, input: [{ role: "user", content: oldPreset }] },
		expected: { instructions: newText, input: [{ role: "user", content: oldPreset }] },
	},
	... [false, true].map(wrapped => {
		const payload = { system: [{ text: oldText }, { cachePoint: { type: "default", ttl: "1h" } }], messages: [{ role: "user", content: [{ text: oldPreset }] }], inferenceConfig: { maxTokens: 8192 } };
		const expected = { ...payload, system: [{ text: newText }, { cachePoint: { type: "default", ttl: "1h" } }] };
		return { api: "bedrock-converse-stream", payload: wrapped ? { commandInput: payload } : payload, expected: wrapped ? { commandInput: expected } : expected };
	}),
];

describe("rewritePresetPayload", () => {
	test("legacy OMO markers refresh only in system fields and mismatched tags stay untouched", () => {
		const previous = "<omo-model-preset>old profile</omo-model-preset>";
		const payload = { instructions: previous, input: [{ role: "user", content: previous }] };
		expect(rewritePresetPayload(payload, "openai-responses", newPreset)).toEqual({ ...payload, instructions: newPreset });
		const malformed = { instructions: "<omo-model-preset>old profile</omp-model-preset>" };
		expect(rewritePresetPayload(malformed, "openai-responses", newPreset)).toBe(malformed);
	});

	for (const [index, shape] of realisticShapes.entries()) {
		test(`${shape.api} realistic shape ${index}: scoped, immutable, idempotent`, () => {
			const snapshot = structuredClone(shape.payload);
			const rewritten = rewritePresetPayload(shape.payload, shape.api, newPreset);
			expect(rewritten).toEqual(shape.expected);
			expect(shape.payload).toEqual(snapshot);
			expect(rewritePresetPayload(rewritten, shape.api, newPreset)).toBe(rewritten);
			// A later profile switch must replace the current marked region, not append.
			expect(rewritePresetPayload(rewritten, shape.api, oldPreset)).toEqual(shape.payload);
		});
	}

	test("missing system marker and user-only marker preserve original identity", () => {
		const payload = { instructions: "Host rules", input: [{ role: "user", content: oldPreset }], metadata: { text: oldPreset } };
		expect(rewritePresetPayload(payload, "openai-responses", newPreset)).toBe(payload);
	});

	test("additional providers do not scan user content, blob IDs, or workflow goals", () => {
		for (const api of ["ollama", "ollama-chat", "cursor-agent", "gitlab-duo-workflow", "gitlab-duo-agent"]) {
			const payload = { messages: [{ role: "user", content: oldPreset }], customSystemPrompt: "Host rules", action: { text: oldPreset }, conversationState: { rootPromptMessagesJson: [new Uint8Array([1, 2, 3])] }, flowConfig: { prompts: [{ prompt_template: { system: "Host rules", user: oldPreset } }] }, goal: oldPreset };
			expect(rewritePresetPayload(payload, api, newPreset)).toBe(payload);
		}
	});

	test("unsupported APIs and malformed shapes preserve original identity", () => {
		for (const payload of [null, undefined, 42, oldPreset, [], { input: oldPreset }, { instructions: { text: oldPreset } }, { input: [{ role: "developer", content: [{ type: "image_url", text: oldPreset }] }] }]) {
			expect(rewritePresetPayload(payload, "openai-responses", newPreset)).toBe(payload);
		}
		const payload = { instructions: oldPreset, system: oldPreset };
		expect(rewritePresetPayload(payload, "unknown-api", newPreset)).toBe(payload);
	});

	test("incomplete or cross-block markers are not rewritten", () => {
		const payload = { system: [{ type: "text", text: "prefix <omp-model-preset>old" }, { type: "text", text: "profile</omp-model-preset> suffix" }] };
		expect(rewritePresetPayload(payload, "anthropic-messages", newPreset)).toBe(payload);
	});

	test("multiple complete regions preserve surrounding bytes", () => {
		const payload = { instructions: `A${oldPreset}\r\nB${oldPreset}C` };
		expect(rewritePresetPayload(payload, "openai-responses", newPreset)).toEqual({ instructions: `A${newPreset}\r\nB${newPreset}C` });
	});

	test("unchanged Anthropic blocks and cache metadata retain reference identity", () => {
		const cache = { type: "ephemeral", ttl: "1h" };
		const prefix = { type: "text", text: "Host prefix" };
		const user = { role: "user", content: oldPreset };
		const payload = { system: [prefix, { type: "text", text: oldPreset, cache_control: cache }], messages: [user] };
		const rewritten = rewritePresetPayload(payload, "anthropic-messages", newPreset);
		expect(rewritten).toEqual({ ...payload, system: [prefix, { type: "text", text: newPreset, cache_control: cache }] });
		if (typeof rewritten !== "object" || rewritten === null || !("system" in rewritten) || !Array.isArray(rewritten.system)) throw new Error("Expected rewritten system blocks");
		expect(rewritten.system[0]).toBe(prefix);
		const block: unknown = rewritten.system[1];
		if (typeof block !== "object" || block === null || !("cache_control" in block)) throw new Error("Expected cache metadata");
		expect(block.cache_control).toBe(cache);
		if (!("messages" in rewritten)) throw new Error("Expected unchanged messages");
		expect(rewritten.messages).toBe(payload.messages);
	});
});

describe("syncCodeModeBlock", () => {
	const current = "<omp-code-mode>\nnew tool route\n</omp-code-mode>";
	const stale = "<omp-code-mode>\nold tool route\n</omp-code-mode>";
	const mixed = `Custom system text mentioning ${stale} inline.`;
	const user = { role: "user", content: stale };

	test("adds, updates and removes just the standalone block in Anthropic system arrays", () => {
		const cache = { type: "ephemeral" };
		const prefix = { type: "text", text: mixed, cache_control: cache };
		const notText = { type: "image", text: stale };
		const original = { system: [prefix, notText], messages: [user] };
		const appended = syncCodeModeBlock(original, "anthropic-messages", stale);
		const updated = syncCodeModeBlock(appended, "anthropic-messages", current);
		expect(updated).toEqual({ ...original, system: [prefix, notText, { type: "text", text: current }] });
		expect(syncCodeModeBlock(updated, "anthropic-messages", current)).toBe(updated);
		expect(syncCodeModeBlock(updated, "anthropic-messages")).toEqual(original);
	});

	test("updates terminal Responses instructions without rewriting an embedded marker or history", () => {
		const historical = { role: "developer", content: stale };
		const input = [user, historical];
		const original = { instructions: `${mixed}\r\n`, input };
		const appended = syncCodeModeBlock(original, "openai-responses", stale);
		const updated = syncCodeModeBlock(appended, "openai-responses", current);
		expect(updated).toEqual({ ...original, instructions: `${original.instructions}\n\n${current}` });
		expect(syncCodeModeBlock(updated, "openai-responses", current)).toBe(updated);
		expect(syncCodeModeBlock(updated, "openai-responses")).toEqual(original);
		expect(syncCodeModeBlock({ instructions: stale, input }, "openai-responses")).toEqual({ input });
	});

	test("updates one coalesced Chat instruction string without touching history or metadata", () => {
		const assistant = { role: "assistant", tool_calls: [
			{ id: "call_1", type: "function", function: { name: "eval", arguments: JSON.stringify({ code: stale }) } },
		] };
		const output = { role: "tool", tool_call_id: "call_1", content: stale };
		const historical = { role: "developer", content: stale };
		const history = [user, assistant, output, historical];
		for (const role of ["system", "developer"]) {
			const leading = { role, content: `Provider prefix\r\n\r\n${mixed}\r\n`, name: "policy" };
			const payload = { model: "qwen-3", messages: [leading, ...history], metadata: { text: stale } };
			const appended = syncCodeModeBlock(payload, "openai-completions", stale);
			const updated = syncCodeModeBlock(appended, "openai-completions", current);
			expect(updated).toEqual({ ...payload, messages: [{ ...leading, content: `${leading.content}\n\n${current}` }, ...history] });
			expect(syncCodeModeBlock(updated, "openai-completions", current)).toBe(updated);
			expect(syncCodeModeBlock(updated, "openai-completions")).toEqual(payload);
		}
	});

	test("adds and refreshes typed blocks inside the existing Chat system message", () => {
		const content = [
			{ type: "text", text: mixed, cache_control: { type: "ephemeral" } },
			{ type: "image_url", image_url: { url: "data:image/png;base64,aaaa" }, text: stale },
		];
		const lead = { role: "system", content, name: "policy" };
		const payload = { messages: [lead, user] };
		const withBlock = (block: { type: string; text: string; cache_control?: { type: string } }) => ({
			messages: [{ ...lead, content: [...content, block] }, user],
		});
		expect(syncCodeModeBlock(payload, "openai-completions", current)).toEqual(withBlock({ type: "text", text: current }));
		const owned = { type: "text", text: stale, cache_control: { type: "ephemeral" } };
		const updated = syncCodeModeBlock(withBlock(owned), "openai-completions", current);
		expect(updated).toEqual(withBlock({ ...owned, text: current }));
		expect(syncCodeModeBlock(updated, "openai-completions", current)).toBe(updated);
		expect(syncCodeModeBlock(updated, "openai-completions")).toEqual(payload);
	});

	test("reuses a terminal Chat guidance paragraph wrapped into a typed block", () => {
		const prefix = { type: "text", text: `Provider prefix\r\n\r\n${mixed}`, cache_control: { type: "ephemeral" } };
		const chat = (text: string) => ({ messages: [{ role: "system", content: [{ ...prefix, text }] }, user] });
		const payload = chat(`${prefix.text}\n\n${stale}`);
		const refreshed = syncCodeModeBlock(payload, "openai-completions", current);
		expect(refreshed).toEqual(chat(`${prefix.text}\n\n${current}`));
		expect(syncCodeModeBlock(refreshed, "openai-completions", current)).toBe(refreshed);
		expect(syncCodeModeBlock(refreshed, "openai-completions")).toEqual(chat(prefix.text));
	});

	test("only creates a Chat system message when there is no live instruction slot", () => {
		const payload = { messages: [user, { role: "developer", content: stale }] };
		expect(syncCodeModeBlock(payload, "openai-completions")).toBe(payload);
		const updated = syncCodeModeBlock(payload, "openai-completions", current);
		expect(updated).toEqual({ messages: [{ role: "system", content: current }, ...payload.messages] });
		expect(syncCodeModeBlock(updated, "openai-completions", current)).toBe(updated);
		expect(syncCodeModeBlock(updated, "openai-completions")).toEqual(payload);
		const retained = { role: "system", content: current, name: "policy" };
		expect(syncCodeModeBlock({ messages: [retained, user] }, "openai-completions"))
			.toEqual({ messages: [{ ...retained, content: "" }, user] });
	});

	test("inserts full Responses Lite guidance beside live instructions, not history", () => {
		const control = { type: "additional_tools", role: "developer", tools: [] };
		const leading = { role: "system", content: mixed };
		const historical = { role: "developer", content: stale };
		const payload = { input: [control, leading, user, historical] };
		const guidance = { type: "message", role: "developer", content: [{ type: "input_text", text: current }] };
		const updated = syncCodeModeBlock(payload, "openai-codex-responses", current);
		expect(updated).toEqual({ input: [control, leading, guidance, user, historical] });
		expect(syncCodeModeBlock(updated, "openai-codex-responses", current)).toBe(updated);
		expect(syncCodeModeBlock(updated, "openai-codex-responses")).toEqual(payload);
	});

	test("does not insert standalone guidance into chained Responses WebSocket deltas", () => {
		const functionOutput = { type: "function_call_output", call_id: "call_1", output: stale };
		const base = {
			type: "response.create",
			model: "gpt-5.4",
			client_metadata: { turn: "turn-2" },
			tools: [{ type: "function", name: "eval", parameters: { type: "object" } }],
		};
		for (const continuation of [
			{ ...base, previous_response_id: "resp_1", input: [functionOutput] },
			{ ...base, previous_response_id: "resp_2", input: [user], instructions: mixed },
		]) {
			const next = syncCodeModeBlock(continuation, "openai-codex-responses", current);
			expect(next).toBe(continuation);
			expect(syncCodeModeBlock(next, "openai-codex-responses", current)).toBe(continuation);
			const noTools = { ...continuation, tools: [] };
			expect(syncCodeModeBlock(noTools, "openai-codex-responses")).toBe(noTools);
		}
		const fresh = { ...base, input: [functionOutput] };
		const guidance = { type: "message", role: "developer", content: [{ type: "input_text", text: current }] };
		expect(syncCodeModeBlock(fresh, "openai-codex-responses", current)).toEqual({ ...fresh, input: [guidance, functionOutput] });
		const fullInstructions = { ...fresh, previous_response_id: "resp_3", instructions: oldText };
		expect(rewritePresetPayload(fullInstructions, "openai-codex-responses", newPreset)).toEqual({ ...fullInstructions, instructions: newText });
	});

	test("syncs unmarked Devin guidance only in the protobuf prompt", () => {
		const history = [{ $typeName: "exa.chat_pb.ChatMessagePrompt", prompt: stale }];
		const payload = {
			$typeName: "exa.api_server_pb.GetChatMessageRequest",
			chatMessagePrompts: history, prompt: mixed, metadata: { text: stale },
		};
		const appended = syncCodeModeBlock(payload, "devin-agent", stale);
		const updated = syncCodeModeBlock(appended, "devin-agent", current);
		expect(updated).toEqual({ ...payload, prompt: `${mixed}\n\n${current}` });
		expect(syncCodeModeBlock(updated, "devin-agent", current)).toBe(updated);
		expect(syncCodeModeBlock(updated, "devin-agent")).toEqual(payload);
		expect(syncCodeModeBlock({ ...payload, prompt: stale }, "devin-agent")).toEqual({ ...payload, prompt: "" });
		const unknown = { prompt: mixed, chatMessagePrompts: history };
		expect(syncCodeModeBlock(unknown, "unknown-api", current)).toBe(unknown);
	});

	test("syncs Google SDK system parts without changing request contents or siblings", () => {
		const contents = [{ role: "user", parts: [{ text: stale }] }];
		const instruction = { role: "user", parts: [{ text: mixed }, { inlineData: { mimeType: "image/png", data: "bytes" } }] };
		const original = { contents, config: { systemInstruction: instruction, temperature: 0.5 } };
		const result = syncCodeModeBlock(original, "google-generative-ai", current);
		expect(result).toEqual({ contents, config: { ...original.config, systemInstruction: { ...instruction, parts: [...instruction.parts, { text: current }] } } });
		expect(syncCodeModeBlock(result, "google-generative-ai")).toEqual(original);
		const unknown = { instructions: stale, metadata: { system: stale }, contents: [user] };
		expect(syncCodeModeBlock(unknown, "unknown-api", current)).toBe(unknown);
	});
});
