import type { ToolInfo } from "./code-mode";
import { adaptResearchRouting } from "./host";
import { adaptToolGuidance } from "./host-guidance";

type PayloadObject = Record<string, unknown>;
type Layout = "responses" | "chat" | "anthropic" | "google" | "bedrock" | "gitlab" | "cursor" | "devin" | "kiro";
type RequestLayout = { readonly kind: Layout; readonly body: PayloadObject; readonly path?: string };

export function payloadObject(value: unknown): PayloadObject | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? value as PayloadObject : undefined;
}

export function rewriteField(object: PayloadObject, key: string, rewrite: (value: unknown) => unknown): PayloadObject {
	const next = rewrite(object[key]);
	return next === object[key] ? object : { ...object, [key]: next };
}

export function rewriteArray(value: unknown, rewrite: (item: unknown) => unknown): unknown {
	if (!Array.isArray(value)) return value;
	const mapped = value.map(rewrite);
	return mapped.some((item, index) => item !== value[index]) ? mapped : value;
}

export function rewriteKiroCurrentInput(state: PayloadObject, rewrite: (input: PayloadObject) => PayloadObject): PayloadObject {
	const current = payloadObject(state.currentMessage);
	const input = payloadObject(current?.userInputMessage);
	if (!current || !input) return state;
	return rewriteField(state, "currentMessage", () => rewriteField(current, "userInputMessage", () => rewrite(input)));
}

const layouts = new Map<string, Layout>([
	["openai-responses", "responses"], ["openai-codex-responses", "responses"], ["azure-openai-responses", "responses"],
	["openai-completions", "chat"], ["openrouter", "chat"], ["ollama", "chat"], ["ollama-chat", "chat"],
	["anthropic-messages", "anthropic"], ["google-generative-ai", "google"], ["google-vertex", "google"],
	["google-gemini-cli", "google"], ["antigravity-cli", "google"], ["bedrock-converse-stream", "bedrock"],
	["gitlab-duo-workflow", "gitlab"], ["gitlab-duo-agent", "gitlab"], ["cursor-agent", "cursor"],
]);

function googleContents(body: PayloadObject): boolean {
	const instruction = payloadObject(body.systemInstruction);
	const config = payloadObject(body.config);
	const tools: readonly unknown[] = Array.isArray(body.tools) ? body.tools : [];
	return Array.isArray(body.contents) && (
		Array.isArray(instruction?.parts) || typeof body.systemInstruction === "string" ||
		payloadObject(body.generationConfig) !== undefined ||
		(config !== undefined && ("systemInstruction" in config || "tools" in config)) ||
		tools.some(tool => Array.isArray(payloadObject(tool)?.functionDeclarations))
	);
}

/** Providers may forward a different native envelope to the hook. Prefer its structural evidence. */
export function requestLayout(root: PayloadObject, api: string): RequestLayout | undefined {
	const kiro = api === "kiro-api" ? payloadObject(root.conversationState) : undefined;
	if (kiro && payloadObject(payloadObject(kiro.currentMessage)?.userInputMessage)) {
		return { kind: "kiro", body: kiro, path: "conversationState" };
	}
	const hint = layouts.get(api);
	if ((api === "devin-agent" || root.$typeName === "exa.api_server_pb.GetChatMessageRequest") &&
		typeof root.prompt === "string" && Array.isArray(root.chatMessagePrompts)) {
		return { kind: "devin", body: root };
	}
	const google = payloadObject(root.request);
	const config = payloadObject(root.config);
	const gitlab = payloadObject(root.startRequest);
	const bedrock = payloadObject(root.commandInput);
	if (gitlab && Array.isArray(payloadObject(gitlab.flowConfig)?.prompts)) return { kind: "gitlab", body: gitlab, path: "startRequest" };
	if (Array.isArray(payloadObject(root.flowConfig)?.prompts)) return { kind: "gitlab", body: root };
	if (google && (googleContents(google) || (hint === "google" && ("systemInstruction" in google || "tools" in google || "contents" in google)))) {
		return { kind: "google", body: google, path: "request" };
	}
	if (hint === "google" || googleContents(root)) {
		if (config && ("systemInstruction" in config || "tools" in config || (Array.isArray(root.contents) && !("systemInstruction" in root) && !("tools" in root)))) {
			return { kind: "google", body: config, path: "config" };
		}
		return { kind: "google", body: root };
	}
	if (bedrock && (hint === "bedrock" || ("inferenceConfig" in bedrock && Array.isArray(bedrock.messages)))) {
		return { kind: "bedrock", body: bedrock, path: "commandInput" };
	}
	if (root.type === "response.create" || ((Array.isArray(root.input) || typeof root.input === "string") && typeof root.instructions === "string")) {
		return { kind: "responses", body: root };
	}
	if (Array.isArray(root.messages)) {
		if ("inferenceConfig" in root || "toolConfig" in root) return { kind: "bedrock", body: root };
		const tools: readonly unknown[] = Array.isArray(root.tools) ? root.tools : [];
		if (tools.some(tool => "input_schema" in (payloadObject(tool) ?? {})) || ("system" in root && typeof root.max_tokens === "number")) {
			return { kind: "anthropic", body: root };
		}
		if (tools.some(tool => payloadObject(tool)?.type === "function" && payloadObject(payloadObject(tool)?.function)) ||
			(typeof root.model === "string" && root.messages.some(value => {
				const entry = payloadObject(value);
				return (entry?.role === "system" || entry?.role === "developer") && "content" in entry;
			}))) {
			return { kind: "chat", body: root };
		}
	}
	return hint ? { kind: hint, body: root } : undefined;
}

type WireDefinition = PayloadObject & { readonly name: string };

/** Read the concrete model selected by the transport, not an ID in user input. */
export function requestModelId(payload: unknown, api: string): string | undefined {
	const root = payloadObject(payload);
	const layout = root && requestLayout(root, api);
	if (!layout) return undefined;
	const id = layout.kind === "devin" ? layout.body.chatModelUid : layout.body.model;
	return typeof id === "string" && id.length > 0 ? id : undefined;
}
type ToolVisitor = (definition: WireDefinition, namespace?: string) => WireDefinition;

function isWireDefinition(entry: PayloadObject | undefined): entry is WireDefinition {
	return typeof entry?.name === "string";
}

function visitTools(layout: RequestLayout, visit: ToolVisitor): PayloadObject {
	const { kind, body } = layout;
	const definition = (value: unknown, namespace?: string): unknown => {
		const entry = payloadObject(value);
		return isWireDefinition(entry) ? visit(entry, namespace) : value;
	};
	const mapDefinitions = (namespace?: string) => (tools: unknown): unknown => rewriteArray(tools, tool => {
		const entry = payloadObject(tool);
		if (!entry) return tool;
		switch (kind) {
			case "responses":
				if (entry.type === "namespace" && entry.name === "functions" && namespace === undefined) {
					return rewriteField(entry, "tools", mapDefinitions(entry.name));
				}
				return entry.type === "function" || (namespace === "functions" && entry.type === undefined)
					? definition(entry, namespace) : tool;
			case "chat": return entry.type === "function" ? rewriteField(entry, "function", definition) : tool;
			case "anthropic": return "input_schema" in entry ? definition(entry) : tool;
			case "google": return rewriteField(entry, "functionDeclarations", items => rewriteArray(items, item => definition(item)));
			case "bedrock": return rewriteField(entry, "toolSpec", definition);
			case "kiro": return rewriteField(entry, "toolSpecification", definition);
			case "devin": return typeof entry.jsonSchemaString === "string" && entry.isCustomTool !== true ? definition(entry) : tool;
			case "gitlab":
			case "cursor": return tool;
		}
	});
	if (kind === "kiro") return rewriteKiroCurrentInput(body, input => {
		const context = payloadObject(input.userInputMessageContext);
		return context ? rewriteField(input, "userInputMessageContext", () => rewriteField(context, "tools", mapDefinitions())) : input;
	});
	if (kind === "bedrock") return rewriteField(body, "toolConfig", value => {
		const config = payloadObject(value);
		return config ? rewriteField(config, "tools", mapDefinitions()) : value;
	});
	if (kind === "responses" && body.tools === undefined && Array.isArray(body.input)) {
		let first = true;
		return rewriteField(body, "input", input => rewriteArray(input, item => {
			const leading = first;
			first = false;
			const entry = payloadObject(item);
			return leading && entry?.type === "additional_tools" && entry.role === "developer"
				? rewriteField(entry, "tools", mapDefinitions()) : item;
		}));
	}
	return rewriteField(body, "tools", mapDefinitions());
}

type WireTool = { readonly definition: WireDefinition; readonly namespace?: string };

function wireTools(layout: RequestLayout): WireTool[] {
	const tools: WireTool[] = [];
	visitTools(layout, (definition, namespace) => {
		tools.push({ definition, namespace });
		return definition;
	});
	return tools;
}

const guidanceNames = new Set(["task", "todo", "eval", "bash", "goal"]);
const googleAliases = new Map([["invoke_subagent", "task"], ["run_command", "bash"]]);

function wireNames(layout: RequestLayout, api: string, tools: readonly WireTool[], enabled: readonly ToolInfo[]) {
	const active = new Set(enabled.map(tool => tool.name));
	const declared = new Set(tools.map(({ definition }) => definition.name));
	// OAuth shifts every non-host name, including a real `_task` (which becomes
	// `__task`). An observed second underscore can also prove escaping on a
	// gateway that doesn't inject the OAuth prompt.
	const system: readonly unknown[] = Array.isArray(layout.body.system) ? layout.body.system : [];
	const billing = payloadObject(system[0]);
	const identity = payloadObject(system[1]);
	const prefixed = layout.kind === "anthropic" && (
		(billing?.type === "text" && typeof billing.text === "string" && billing.text.startsWith("x-anthropic-billing-header:") &&
			identity?.type === "text" && identity.text === "You are Claude Code, Anthropic's official CLI for Claude.") ||
		[...declared].some(name => name.startsWith("__") && active.has(name.slice(1)) && !active.has(name)));
	return (name: string): string => {
		if (layout.kind === "anthropic" && name.startsWith("_")) {
			const canonical = name.slice(1);
			if (prefixed) return canonical;
			if (active.has(canonical) && !active.has(name) && !declared.has(canonical)) return canonical;
		}
		if (layout.kind === "google" && api === "antigravity-cli") {
			const canonical = googleAliases.get(name);
			if (canonical && active.has(canonical) && !active.has(name) && !declared.has(canonical)) return canonical;
		}
		return name;
	};
}

type Choice = { readonly name: string; readonly namespace?: unknown };

function namedChoice(value: unknown): Choice[] {
	const choice = payloadObject(value);
	const fn = payloadObject(choice?.function) ?? choice;
	return typeof fn?.name === "string" ? [{ name: fn.name, namespace: fn.namespace }] : [];
}

/** Undefined means unrestricted. An empty list means none or an unsupported selector. */
function allowedTools(layout: RequestLayout): readonly Choice[] | undefined {
	const { kind, body } = layout;
	if (kind === "devin") {
		const toolChoice = body.toolChoice;
		if (toolChoice === undefined) return undefined;
		const choice = payloadObject(payloadObject(toolChoice)?.choice);
		if (choice?.case === "optionName" && choice.value === "auto") return undefined;
		if (choice?.case === "toolName" && typeof choice.value === "string") return [{ name: choice.value }];
		return [];
	}
	const config = payloadObject(body.toolConfig);
	if (kind === "google") {
		const calling = payloadObject(config?.functionCallingConfig);
		if (!calling || calling.mode === "AUTO") return undefined;
		if (calling.mode !== "ANY" && calling.mode !== "VALIDATED") return [];
		const names = calling.allowedFunctionNames;
		return Array.isArray(names) && names.length > 0
			? names.flatMap(name => typeof name === "string" ? [{ name }] : []) : undefined;
	}
	if (kind === "bedrock") {
		const choice = payloadObject(config?.toolChoice);
		return choice === undefined || "auto" in choice || "any" in choice ? undefined : namedChoice(choice.tool);
	}
	const choice = body.tool_choice ?? body.function_call;
	if (choice === undefined || choice === "auto" || choice === "any" || choice === "required") return undefined;
	const object = payloadObject(choice);
	const type = object?.type;
	if (type === "auto" || type === "any" || type === "required") return undefined;
	if (type === "allowed_tools") {
		const allowlist = kind === "chat" ? payloadObject(object?.allowed_tools) : kind === "responses" ? object : undefined;
		if (!Array.isArray(allowlist?.tools)) return [];
		return allowlist.tools.flatMap(tool => {
			const entry = payloadObject(tool);
			if (entry?.type !== "function") return [];
			const fn = kind === "chat" ? payloadObject(entry.function) : entry;
			return typeof fn?.name === "string" ? [{ name: fn.name, namespace: fn.namespace }] : [];
		});
	}
	if (type === "tool" || type === "function" || (choice === body.function_call && type === undefined)) return namedChoice(object);
	return [];
}

/** Apply Anthropic's structural replay controls, not text or assistant history. */
function anthropicAvailability(body: PayloadObject, tools: readonly WireTool[]): Set<string> {
	const active = new Set(tools.flatMap(({ definition }) => definition.defer_loading === true ? [] : [definition.name]));
	const messages: readonly unknown[] = Array.isArray(body.messages) ? body.messages : [];
	for (const value of messages) {
		const message = payloadObject(value);
		if (message?.role !== "system" || !Array.isArray(message.content)) continue;
		for (const value of message.content) {
			const block = payloadObject(value);
			const target = payloadObject(block?.tool);
			if (target?.type !== "tool_reference" || typeof target.name !== "string") continue;
			if (block?.type === "tool_addition") active.add(target.name);
			if (block?.type === "tool_removal") active.delete(target.name);
		}
	}
	return active;
}

function devinToolSchema(value: unknown): PayloadObject | undefined {
	if (typeof value !== "string") return undefined;
	try {
		return payloadObject(JSON.parse(value));
	} catch (error) {
		if (error instanceof SyntaxError) return undefined;
		throw error;
	}
}

/** Intersect the live roster with the current request, taking eval's runtime schema from the wire. */
export function requestToolView(payload: unknown, api: string, enabled: readonly ToolInfo[]): ToolInfo[] {
	const root = payloadObject(payload);
	const layout = root && requestLayout(root, api);
	if (!layout) return [];
	const tools = wireTools(layout);
	const resolve = wireNames(layout, api, tools, enabled);
	const allowed = allowedTools(layout);
	const active = layout.kind === "anthropic" ? anthropicAvailability(layout.body, tools) : undefined;
	const direct = new Map<string, WireDefinition>();
	for (const { definition, namespace } of tools) {
		const name = definition.name;
		if (active && !active.has(name)) continue;
		if (allowed && !allowed.some(choice => choice.name === name && (choice.namespace === undefined || choice.namespace === namespace))) continue;
		direct.set(resolve(name), definition);
	}
	const cell = enabled.some(tool => tool.name === "eval") ? direct.get("eval") : undefined;
	const parameters = layout.kind === "devin" ? devinToolSchema(cell?.jsonSchemaString)
		: payloadObject(cell?.parametersJsonSchema ?? cell?.parameters ?? cell?.input_schema ?? payloadObject(cell?.inputSchema)?.json);
	const catalog = allowed === undefined && typeof cell?.description === "string" && cell.description.startsWith("One cell per call;")
		? /^Session tool names: ([^\r\n]+)\.$/m.exec(cell.description)?.[1]?.split(", ") : undefined;
	return enabled.flatMap(tool => {
		if (tool.name === "eval") return parameters ? [{ ...tool, parameters }] : [];
		if (direct.has(tool.name) || (parameters && catalog?.includes(tool.name))) return [tool];
		return [];
	});
}

/** Change known native guidance only; schemas, execution and custom tools stay intact. */
export function rewriteToolGuidancePayload(payload: unknown, api: string, profile: string, enabled: readonly ToolInfo[] = []): unknown {
	const root = payloadObject(payload);
	const layout = root && requestLayout(root, api);
	// Leave Devin's protobuf declarations and Kiro's native tool declarations intact.
	if (!root || !layout || layout.kind === "devin" || layout.kind === "kiro") return payload;
	const resolve = wireNames(layout, api, wireTools(layout), enabled);
	const next = visitTools(layout, definition => {
		const name = resolve(definition.name);
		if (!guidanceNames.has(name) || typeof definition.description !== "string") return definition;
		const description = name === "task" ? adaptResearchRouting(definition.description)
			: adaptToolGuidance(name, definition.description, profile);
		return description === definition.description ? definition : { ...definition, description };
	});
	return layout.path ? rewriteField(root, layout.path, () => next) : next;
}
