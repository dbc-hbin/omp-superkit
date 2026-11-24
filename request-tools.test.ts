import { describe, expect, test } from "bun:test";
import { adaptResearchRouting } from "./host";
import { requestToolView, rewriteToolGuidancePayload } from "./payload";

const wireSchema = { type: "object", properties: { language: { const: "js" } } };
const evalInfo = { name: "eval", parameters: { type: "object", properties: { language: { enum: ["py", "js"] } } } };
const [task, bash, read, todo] = ["task", "bash", "read", "todo"].map(name => ({ name }));
const enabled = [evalInfo, task, bash, read, todo];
const cell = { name: "eval", parameters: wireSchema };
const chat = <T extends { readonly name: string }>(tool: T) => ({ type: "function", function: tool });
const response = <T extends { readonly name: string }>(tool: T) => ({ type: "function", ...tool });
const taskDescription = "Read-only research MUST use `scout` only when files unknown.";

describe("requestToolView", () => {
	test("uses the effective native eval schema across concrete tool transports", () => {
		const anthTool = { name: "_eval", input_schema: wireSchema };
		const googleTools = [{ functionDeclarations: [{ name: "eval", parametersJsonSchema: wireSchema }] }];
		const bedrockTools = { toolConfig: { tools: [{ toolSpec: { name: "eval", inputSchema: { json: wireSchema } } }] } };
		for (const [api, payload] of [
			["openai-completions", { tools: [chat(cell)] }],
			["openai-responses", { tools: [response(cell)] }],
			["openai-codex-responses", { tools: [{ type: "namespace", name: "functions", tools: [response(cell)] }] }],
			["openai-codex-responses", { input: [{ type: "additional_tools", role: "developer", tools: [response(cell)] }] }],
			["anthropic-messages", { tools: [anthTool] }],
			["google-generative-ai", { config: { tools: googleTools } }],
			["factory-droid-agent", { contents: [], tools: googleTools }],
			["google-gemini-cli", { request: { tools: googleTools } }],
			["bedrock-converse-stream", bedrockTools],
			["bedrock-converse-stream", { commandInput: bedrockTools }],
		] as const) {
			const view = requestToolView(payload, api, enabled);
			expect(view).toEqual([{ name: "eval", parameters: wireSchema }]);
			expect(view[0]?.parameters).toBe(wireSchema);
		}
	});

	test("does not advertise session eval on tool-less, malformed or forced-away requests", () => {
		const chatTools = [chat(cell), chat(task)];
		const responseTools = [response(cell), response(task)];
		const googleTools = [{ functionDeclarations: [cell, task] }];
		for (const [api, payload, expected] of [
			["openai-completions", { messages: [{}] }, []],
			["openai-completions", { tools: [chat({ name: "eval" })] }, []],
			["openai-completions", { tools: chatTools, tool_choice: "none" }, []],
			["openai-completions", { tools: chatTools, tool_choice: { type: "function", function: { name: "task" } } }, [task]],
			["openai-completions", { tools: chatTools, function_call: { name: "task" } }, [task]],
			["openai-responses", { tools: responseTools, tool_choice: { type: "web_search" } }, []],
			["openai-responses", { tools: responseTools, tool_choice: { type: "allowed_tools", mode: "auto", tools: [response(task)] } }, [task]],
			["openai-codex-responses", { tools: [], input: [{ type: "additional_tools", role: "developer", tools: responseTools }] }, []],
			["openai-codex-responses", { input: [{ role: "user", content: "request" }, { type: "additional_tools", role: "developer", tools: responseTools }] }, []],
			["openai-codex-responses", { tools: [{ type: "namespace", name: "custom", tools: [response(cell)] }] }, []],
			["anthropic-messages", { tools: [{ name: "_eval", input_schema: wireSchema }], tool_choice: { type: "none" } }, []],
			["google-vertex", { tools: googleTools, toolConfig: { functionCallingConfig: { mode: "NONE" } } }, []],
			["google-vertex", { tools: googleTools, toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["task"] } } }, [task]],
			["unknown-api", { tools: responseTools }, []],
		] as const) {
			expect(requestToolView(payload, api, enabled)).toEqual([...expected]);
		}
	});

	test("uses layout-specific Chat and Responses allowed-tool selectors", () => {
		const description = "One cell per call; top-level state persists.\nSession tool names: read, bash.";
		const evalChoice = { name: "eval" };
		const chatTools = [chat({ ...cell, description }), chat(task)];
		const responseTools = [{ type: "namespace", name: "functions", tools: [response(cell), response(task)] }];
		const chatList = { allowed_tools: { mode: "required", tools: [chat(evalChoice), { type: "custom", custom: task }] } };
		const responseList = { mode: "auto", tools: [response({ ...evalChoice, namespace: "functions" })] };
		const native = [{ ...evalInfo, parameters: wireSchema }];
		for (const [api, tools, list, expected] of [
			["openai-completions", chatTools, chatList, native],
			["openai-completions", chatTools, responseList, []],
			["openai-completions", chatTools, { allowed_tools: { mode: "auto", tools: [response(evalChoice)] } }, []],
			["openai-completions", chatTools, { allowed_tools: { mode: "auto", tools: [] } }, []],
			["openai-completions", [], chatList, []],
			["openai-codex-responses", responseTools, responseList, native],
			["openai-codex-responses", responseTools, chatList, []],
			["openai-codex-responses", responseTools, { mode: "auto", tools: [chat(evalChoice)] }, []],
			["openai-codex-responses", responseTools, { mode: "required", tools: [response({ ...evalChoice, namespace: "other" })] }, []],
		] as const) {
			const payload = { tools, tool_choice: { type: "allowed_tools", ...list } };
			expect(requestToolView(payload, api, enabled)).toEqual([...expected]);
			expect(rewriteToolGuidancePayload(payload, api, "", enabled)).toBe(payload);
		}
	});

	test("projects the Devin protobuf schema and oneof choice without rewriting native declarations", () => {
		const devinTool = (name: string, description: string) => ({
			$typeName: "exa.chat_pb.ChatToolDefinition", name, description,
			jsonSchemaString: JSON.stringify(wireSchema), strict: true, attributionFieldNames: [],
		});
		const devinChoice = (choice: { readonly case: string; readonly value: unknown }) => ({
			$typeName: "exa.chat_pb.ChatToolChoice", choice,
		});
		const evalTool = devinTool("eval", "One cell per call; top-level state persists.\nSession tool names: read.");
		const payload = {
			$typeName: "exa.api_server_pb.GetChatMessageRequest",
			prompt: "Host system instructions", chatMessagePrompts: [],
			tools: [evalTool, devinTool("task", taskDescription)],
		};
		const native = { ...evalInfo, parameters: wireSchema };
		const bridgeRead = { ...read, bridgeOnly: true } as const;
		for (const [choice, expected] of [
			[devinChoice({ case: "optionName", value: "auto" }), [native, task, bridgeRead]],
			[undefined, [native, task, bridgeRead]],
			[devinChoice({ case: "toolName", value: "task" }), [task]],
			[devinChoice({ case: "toolName", value: "eval" }), [native]],
			[devinChoice({ case: "toolName", value: "notDeclared" }), []],
			[devinChoice({ case: "optionName", value: "none" }), []],
			[devinChoice({ case: "optionName", value: "required" }), []],
			[devinChoice({ case: "toolName", value: 1 }), []],
			[devinChoice({ case: "futureChoice", value: "auto" }), []],
			[{ choice: { case: undefined } }, []],
		] as const) {
			const request = { ...payload, toolChoice: choice };
			expect(requestToolView(request, "devin-agent", enabled)).toEqual([...expected]);
			expect(rewriteToolGuidancePayload(request, "devin-agent", "", enabled)).toBe(request);
		}
		expect(requestToolView({ ...payload, tools: [] }, "devin-agent", enabled)).toEqual([]);
		for (const jsonSchemaString of ["{", "null", "[]", "false", ""]) {
			const malformed = { ...payload, tools: [{ ...evalTool, jsonSchemaString, parameters: wireSchema }] };
			expect(requestToolView(malformed, "devin-agent", enabled)).toEqual([]);
		}
		const custom = { ...payload, tools: [{ ...evalTool, isCustomTool: true }] };
		expect(requestToolView(custom, "devin-agent", enabled)).toEqual([]);
	});

	test("keeps enabled off-wire tools only on the native eval bridge catalog and an unrestricted turn", () => {
		const description = "One cell per call; top-level state persists.\n<prelude>\nSession tool names: read, task, bash, disabled.\n</prelude>";
		const tools = [chat({ ...cell, description }), chat(todo)];
		const payload = { tools };
		const nativeCell = { name: "eval", parameters: wireSchema };
		expect(requestToolView(payload, "openai-completions", enabled)).toEqual([
			nativeCell, { ...task, bridgeOnly: true }, { ...bash, bridgeOnly: true }, { ...read, bridgeOnly: true }, todo,
		]);
		expect(requestToolView(payload, "openai-completions", [task, bash, read, todo])).toEqual([todo]);
		const forcedEval = { ...payload, tool_choice: { type: "function", function: { name: "eval" } } };
		expect(requestToolView(forcedEval, "openai-completions", enabled)).toEqual([nativeCell]);
	});

	test("does not treat Anthropic history declarations as current active tools", () => {
		const definition = { name: "_eval", input_schema: wireSchema, defer_loading: true };
		const control = (type: string) => ({ role: "system", content: [{ type, tool: { type: "tool_reference", name: "_eval" } }] });
		const addition = control("tool_addition");
		const removal = control("tool_removal");
		expect(requestToolView({ tools: [definition], messages: [addition] }, "anthropic-messages", enabled)).toEqual([{ name: "eval", parameters: wireSchema }]);
		expect(requestToolView({ tools: [definition], messages: [addition, removal] }, "anthropic-messages", enabled)).toEqual([]);
		expect(requestToolView({ tools: [definition], messages: [{ ...addition, role: "user" }] }, "anthropic-messages", enabled)).toEqual([]);
	});

	test("shares collision-safe Anthropic identity between availability and description rewriting", () => {
		const customTask = { name: "_task" };
		const tools = [{ ...customTask, description: taskDescription, input_schema: wireSchema }];
		const apiKey = { tools };
		const oauth = {
			system: [
				{ type: "text", text: "x-anthropic-billing-header: cc_version=2.1.0; cc_entrypoint=cli; cch=00000;" },
				{ type: "text", text: "You are Claude Code, Anthropic's official CLI for Claude." },
			],
			tools: [...tools, { ...tools[0], name: "__task" }, { name: "_read", input_schema: wireSchema }],
		};
		const active = [task, customTask, read];
		expect(requestToolView(apiKey, "anthropic-messages", active)).toEqual([customTask]);
		expect(rewriteToolGuidancePayload(apiKey, "anthropic-messages", "", active)).toBe(apiKey);
		expect(requestToolView({ ...oauth, tools }, "anthropic-messages", active)).toEqual([task]);
		expect(requestToolView(oauth, "anthropic-messages", active)).toEqual(active);
		const result = rewriteToolGuidancePayload(oauth, "anthropic-messages", "", active);
		expect(result).toEqual({
			...oauth,
			tools: [{ ...tools[0], description: adaptResearchRouting(taskDescription) }, oauth.tools[1], oauth.tools[2]],
		});
	});
});
