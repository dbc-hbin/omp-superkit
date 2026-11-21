import { isGeminiModel } from "./presets";
import type { PresetModel } from "./presets";

type ObjectValue = Record<string, unknown>;
type ToolInfo = {
	name: string;
	description?: string;
	parameters?: unknown;
	promptGuidelines?: string[];
};
type RequestContext = {
	model?: Partial<PresetModel> & { api?: string };
	getSystemPrompt(): string[];
	ui?: { notify(message: string, type?: "info" | "warning" | "error"): void };
};
type Lifecycle = "session_start" | "session_switch" | "session_branch" | "session_tree" | "session_shutdown";

/** Only public extension APIs; projection never changes the session's enabled tools. */
export interface CodeModeApi {
	getAllTools(): ToolInfo[];
	getActiveTools(): string[];
	on(event: Lifecycle, handler: (event: unknown, ctx: RequestContext) => void): void;
	on(
		event: "before_provider_request",
		handler: (event: { payload: unknown }, ctx: RequestContext) => unknown,
	): void;
}

// Native edit can expose the freeform apply_patch wire tool, while public tool
// metadata still names it edit. Keep the freeform transport direct; the native
// edit accessor uses its own JSON schema, not an invented apply_patch alias.
const BRIDGE_EXCLUDED = new Set([
	// eval is the entry point; ask/wait retain human-wait and interrupt handling.
	"eval", "ask", "wait",
	// Completion/rollover consume direct result events; checkpoint/rewind also
	// have native bridge guards. think's private rendering is a direct surface.
	"yield", "think", "checkpoint", "rewind", "new_context",
	// Superagent verifies result-file delivery against the outer native execution.
	"result_attach",
	// Native plan approval and staged-preview decisions are commands when mounted,
	// direct tools otherwise. Do not replace their advertised decision route.
	"propose", "resolve", "reject",
	"apply_patch",
	// Native JS tool.defined/undefine manage local definitions, not session tools.
	"defined", "undefine",
]);
// OMP identifies mounted plan/preview decisions from the outer bash tool event.
// A decision inside an eval cell is not that event. Both carriers also support ordinary I/O.
const DIRECT = new Set([...BRIDGE_EXCLUDED, "write", "bash"]);
const REGION = /<omp-code-mode>[\s\S]*?<\/omp-code-mode>/g;
// Attribute access rejects Python keywords; bracket access works in both kernels.
const PYTHON_KEYWORDS = new Set([
	"False", "None", "True", "and", "as", "assert", "async", "await", "break", "class",
	"continue", "def", "del", "elif", "else", "except", "finally", "for", "from",
	"global", "if", "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass",
	"raise", "return", "try", "while", "with", "yield",
]);

function object(value: unknown): ObjectValue | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? value as ObjectValue : undefined;
}

function acceptsLanguage(schema: unknown, token: "py" | "js"): boolean {
	const root = object(schema);
	const language = object(object(root?.properties)?.language);
	if (!language) return false;
	const accepts = (value: unknown): boolean => {
		const entry = object(value);
		if (!entry) return false;
		if (entry.const === token) return true;
		if (Array.isArray(entry.enum)) return entry.enum.includes(token);
		return ["anyOf", "oneOf"].some(key => Array.isArray(entry[key]) && entry[key].some(accepts));
	};
	return accepts(language);
}

type WireTool = {
	name: string;
	description: unknown;
	schema: unknown;
	/** A custom tool has a freeform wire format, not a JSON argument schema. */
	format?: unknown;
	definition: ObjectValue;
	descriptionKey: string;
};
type ToolList = {
	tools: unknown[];
	replace(tools: unknown[]): unknown;
	kind: "responses" | "chat" | "bedrock" | "anthropic" | "google" | "devin";
};

function toolList(payload: unknown, api: string): ToolList | undefined {
	const root = object(payload);
	if (!root) return undefined;
	const list = (container: ObjectValue, kind: ToolList["kind"], replace: (value: ObjectValue) => unknown): ToolList | undefined =>
		Array.isArray(container.tools)
			? { tools: container.tools, kind, replace: tools => replace({ ...container, tools }) }
			: undefined;
	if (["openai-responses", "openai-codex-responses", "azure-openai-responses"].includes(api)) {
		return list(root, "responses", value => value);
	}
	if (["openai-completions", "openrouter", "ollama", "ollama-chat", "anthropic-messages"].includes(api)) {
		return list(root, api === "anthropic-messages" ? "anthropic" : "chat", value => value);
	}
	if (["google-generative-ai", "google-vertex", "factory-droid-agent"].includes(api)) {
		// Google SDK params carry tools in config; the serialized wire body uses root tools.
		const config = object(root.config);
		return config
			? list(config, "google", value => ({ ...root, config: value }))
			: list(root, "google", value => value);
	}
	if (["google-gemini-cli", "antigravity-cli"].includes(api)) {
		const request = object(root.request);
		return request ? list(request, "google", value => ({ ...root, request: value })) : undefined;
	}
	if (api === "devin-agent") {
		return list(root, "devin", value => value);
	}
	if (api === "bedrock-converse-stream") {
		// Match payload.ts: current direct commandInput and an explicit wrapper.
		const wrapped = object(root.commandInput);
		const body = wrapped ?? root;
		const config = object(body.toolConfig);
		if (!config) return undefined;
		return list(config, "bedrock", value => {
			const next = { ...body, toolConfig: value };
			return wrapped ? { ...root, commandInput: next } : next;
		});
	}
	return undefined;
}

function wireTool(value: unknown, kind: ToolList["kind"]): WireTool | undefined {
	const entry = object(value);
	if (!entry) return undefined;
	const definition = kind === "chat" ? object(entry.function)
		: kind === "bedrock" ? object(entry.toolSpec) : entry;
	if (!definition || typeof definition.name !== "string") return undefined;
	if (kind === "responses" && definition.type !== "function" && definition.type !== "custom") return undefined;
	let schema = kind === "bedrock" ? object(definition.inputSchema)?.json
		: kind === "anthropic" ? definition.input_schema
		: kind === "google" ? definition.parametersJsonSchema ?? definition.parameters
		: kind === "devin" ? undefined : definition.parameters;
	if (kind === "devin" && typeof definition.jsonSchemaString === "string") {
		try {
			schema = JSON.parse(definition.jsonSchemaString);
		} catch {
			return undefined;
		}
	}
	return {
		name: definition.name, description: definition.description, schema,
		format: definition.type === "custom" ? definition.format : undefined,
		definition, descriptionKey: "description",
	};
}

function toolGroup(value: unknown, kind: ToolList["kind"]): {
	entry: ObjectValue; key: string; tools: unknown[];
} | undefined {
	const entry = object(value);
	const key = kind === "google" ? "functionDeclarations"
		: kind === "responses" && entry?.type === "namespace" && entry.name === "functions" ? "tools" : undefined;
	const tools = key ? entry?.[key] : undefined;
	return entry && key && Array.isArray(tools) ? { entry, key, tools } : undefined;
}

function collect(tools: unknown[], kind: ToolList["kind"], result: WireTool[]): void {
	for (const entry of tools) {
		const group = toolGroup(entry, kind);
		if (group) collect(group.tools, kind, result);
		else {
			const tool = wireTool(entry, kind);
			if (tool) result.push(tool);
		}
	}
}

function replaceDescription(entry: unknown, kind: ToolList["kind"], tool: WireTool, description: string): unknown {
	const definition = { ...tool.definition, [tool.descriptionKey]: description };
	if (kind === "chat") return { ...object(entry), function: definition };
	if (kind === "bedrock") return { ...object(entry), toolSpec: definition };
	return definition;
}

function project(
	tools: unknown[], kind: ToolList["kind"], hidden: Set<string>, evaluation: { name: string; description: string },
): unknown[] {
	const result: unknown[] = [];
	for (const entry of tools) {
		const group = toolGroup(entry, kind);
		if (group) {
			const nested = project(group.tools, kind, hidden, evaluation);
			if (nested.length) result.push({ ...group.entry, [group.key]: nested });
			continue;
		}
		const tool = wireTool(entry, kind);
		if (tool && hidden.has(tool.name)) continue;
		result.push(tool?.name === evaluation.name ? replaceDescription(entry, kind, tool, evaluation.description) : entry);
	}
	// Match native head caching: one tools-prefix anchor on a non-deferred tool.
	// Keep existing anchors in place; restore only a native anchor lost to filtering.
	if (kind === "anthropic" && !result.some(entry => object(entry)?.cache_control != null)) {
		const anchor = tools.map(object).findLast(entry => entry?.cache_control != null)?.cache_control;
		const index = result.findLastIndex(entry => {
			const tool = object(entry);
			return tool !== undefined && !tool.defer_loading;
		});
		if (anchor != null && index >= 0) result[index] = { ...object(result[index]), cache_control: anchor };
	}
	return result;
}

function choiceNames(payload: unknown): Set<string> {
	const names = new Set<string>();
	const root = object(payload);
	const body = object(root?.commandInput) ?? object(root?.config) ?? object(root?.request) ?? root;
	const config = object(body?.toolConfig);
	const choice = config?.toolChoice ?? config?.functionCallingConfig ?? body?.tool_choice ?? body?.toolChoice;
	const visit = (value: unknown): void => {
		if (Array.isArray(value)) {
			for (const item of value) visit(item);
		} else {
			const entry = object(value);
			if (!entry) return;
			if (typeof entry.name === "string") names.add(entry.name);
			if (entry.case === "toolName" && typeof entry.value === "string") names.add(entry.value);
			for (const [key, nested] of Object.entries(entry)) {
				if (key === "allowedFunctionNames" && Array.isArray(nested)) {
					for (const name of nested) if (typeof name === "string") names.add(name);
				} else if (key !== "name") visit(nested);
			}
		}
	};
	visit(choice);
	return names;
}

// ToolInfo does not identify mounted commands. Use only the names OMP actually
// advertises, never turn an off-wire name (e.g. a custom wire alias) into a shell command.
function advertisedToolCommands(blocks: string[]): Set<string> {
	const commands = new Set<string>();
	// Only block zero's native Runtime, after its Internal URLs and inventory.
	// Project rules precede those sections; context files and child assignments
	// may follow the base block and can contain identical Markdown headings.
	const runtime = /\n([⁂§]) Runtime\n[\s\S]*?(?=\n\1 (?:Scratchpad|Tool Policy)\n)/.exec(blocks[0] ?? "")?.[0];
	if (!runtime) return commands;
	const urls = runtime.lastIndexOf("\n# Internal URLs\n");
	const start = runtime.lastIndexOf("\n# Tool Commands\nEach listed tool is also a command in `bash`:");
	if (urls < 0 || start < urls) return commands;
	const section = runtime.slice(start);
	for (const match of section.matchAll(/^## ([A-Za-z_][\w.-]*)\n\n\1 — /gm)) commands.add(match[1]);
	const catalog = section.split("\n## More commands (help on demand)\n").at(1);
	if (catalog) {
		for (const row of catalog.trimStart().split("\n")) {
			const name = /^- `([A-Za-z_][\w.-]*)` — /.exec(row)?.[1];
			if (!name) break;
			commands.add(name);
		}
	}
	return commands;
}

/** Register LAST, after preset/native-description rewriting. Hidden direct calls are
 * not blocked: this is an outgoing-schema projection, not an execution boundary.
 */
export function registerCodeMode(pi: CodeModeApi): void {
	const notices = new Set<string>();
	let catalog: { key: string; text: string } | undefined;
	const reset = (): void => {
		notices.clear();
		catalog = undefined;
	};
	for (const event of ["session_start", "session_switch", "session_branch", "session_tree", "session_shutdown"] as const) {
		pi.on(event, reset);
	}
	pi.on("before_provider_request", (event, ctx) => {
		const model = ctx.model;
		if (!model || isGeminiModel(model)) return;
		const warn = (reason: string): void => {
			if (notices.has(reason)) return;
			notices.add(reason);
			ctx.ui?.notify(`OMP code mode inactive: ${reason}; request left unchanged.`, "warning");
		};
		const list = toolList(event.payload, model.api ?? "");
		if (!list) {
			warn(`unsupported API/tool shape (${model.api ?? "unknown"})`);
			return;
		}
		const actual: WireTool[] = [];
		collect(list.tools, list.kind, actual);
		const active = new Set(pi.getActiveTools());
		const all = pi.getAllTools();
		const native = new Map(all.filter(tool => active.has(tool.name)).map(tool => [tool.name, tool]));
		// Anthropic can prefix client tools on the wire. Detect it from this
		// request, without treating a separately registered _eval as native eval.
		const prefixed = list.kind === "anthropic" && !all.some(tool => tool.name === "_eval")
			&& !actual.some(tool => tool.name === "eval");
		const nativeName = (tool: WireTool): string =>
			prefixed && tool.name.startsWith("_") && object(tool.schema) ? tool.name.slice(1) : tool.name;
		const evals = actual.filter(tool => nativeName(tool) === "eval");
		const evaluation = evals[0];
		const python = acceptsLanguage(evaluation?.schema, "py");
		const javascript = acceptsLanguage(evaluation?.schema, "js");
		if (!evaluation || evals.length !== 1 || !native.has("eval") || (!python && !javascript)) {
			warn("an active, actually exposed eval tool with py or js schema support is required");
			return;
		}
		const forced = choiceNames(event.payload);
		const entries: { name: string; description: string; nativeDescription: string; guidelines: string[]; schema: unknown; format?: unknown; deferred?: boolean }[] = [];
		const hidden = new Set<string>();
		const unprojected = new Set<string>();
		const inspectUnknown = (tools: unknown[], kind: ToolList["kind"]): void => {
			for (const entry of tools) {
				const group = toolGroup(entry, kind);
				if (group) inspectUnknown(group.tools, kind);
				else if (!wireTool(entry, kind)) {
					const value = object(entry);
					unprojected.add(String(value?.name ?? value?.type ?? "unrecognized entry"));
				}
			}
		};
		inspectUnknown(list.tools, list.kind);
		for (const tool of actual) {
			const name = nativeName(tool);
			if (BRIDGE_EXCLUDED.has(name)) continue;
			const info = native.get(name);
			// Unmapped aliases and unknown/provider-hosted tools stay direct. ToolInfo
			// has no customWireName; guessing an alias would advertise a false bridge.
			const schema = tool.schema ?? (tool.format !== undefined ? info?.parameters : undefined);
			if (!info || !object(schema) || typeof info.description !== "string") {
				if (!DIRECT.has(name)) unprojected.add(tool.name);
				continue;
			}
			entries.push({
				name,
				description: typeof tool.description === "string" ? tool.description : info.description,
				nativeDescription: info.description,
				guidelines: info.promptGuidelines ?? [], schema, format: tool.format,
			});
			if (!DIRECT.has(name) && !forced.has(tool.name)) hidden.add(tool.name);
		}
		// Use native command help for advertised commands; otherwise the bridge
		// needs its registered schema here, including with no bash or a wire alias.
		const onWire = new Set(actual.map(nativeName));
		const commands = native.has("bash") && onWire.has("bash")
			? advertisedToolCommands(ctx.getSystemPrompt()) : new Set<string>();
		for (const info of native.values()) {
			if (BRIDGE_EXCLUDED.has(info.name) || onWire.has(info.name) || unprojected.has(info.name)) continue;
			if (!object(info.parameters) || typeof info.description !== "string") continue;
			entries.push({
				name: info.name, description: info.description, nativeDescription: info.description,
				guidelines: info.promptGuidelines ?? [], schema: info.parameters, deferred: commands.has(info.name),
			});
		}
		if (unprojected.size) {
			const reason = `unprojected tools: ${Array.from(unprojected).sort().join(", ")}`;
			if (!notices.has(reason)) {
				notices.add(reason);
				ctx.ui?.notify(`OMP code mode preserves ${reason} (unknown wire entry, missing native metadata or schema); no aliases or permissions were invented.`, "warning");
			}
		}
		if (!entries.length) {
			warn("no bridge catalog with active native metadata and schemas is available");
			return;
		}
		// Catalog cache is a single replaceable render, never a cache of requests,
		// grants, approvals, or tool_choice. Mutable schemas/descriptions are read now.
		const key = JSON.stringify([python, javascript, Array.from(active).sort(), entries]);
		if (catalog?.key !== key) {
			const text = [
				"<omp-code-mode>",
				"Use eval to call listed tools: await tool.<name>(args). Match the JSON schema, inspect results and print only needed output. Native permissions apply.",
				python
					? javascript
						? 'Prefer language="py" for code mode. Use language="js" when JavaScript-specific APIs or libraries are needed.'
						: 'Use language="py" for code mode; JavaScript is not available.'
					: 'Use language="js" for code mode; Python is not available.',
				"Use the host's help://<tool>/<topic> links for documentation topics. Tools absent from this catalog keep their native routes.",
				...(entries.some(entry => entry.name === "bash")
					? ["For mounted propose, resolve or reject, use direct bash, not a nested Eval call. Use tool.bash for ordinary shell work."] : []),
				...(entries.some(entry => entry.name === "write")
					? ["Use tool.write for files. Keep native session and planning controls on their advertised routes."] : []),
				...entries.map(entry => [
					`await tool${/^[A-Za-z_][A-Za-z0-9_]*$/.test(entry.name) && !PYTHON_KEYWORDS.has(entry.name) ? `.${entry.name}` : `[${JSON.stringify(entry.name)}]`}(args)`,
					...(entry.deferred ? [`Native command help: ${entry.name} --help (session bash).`] : [
						entry.description,
						...(entry.nativeDescription === entry.description ? [] : [`Native documentation: ${entry.nativeDescription}`]),
						...entry.guidelines,
						`JSON Schema: ${JSON.stringify(entry.schema)}`,
						...(entry.format === undefined ? [] : [`Direct custom wire format (bridge still takes JSON args): ${JSON.stringify(entry.format)}`]),
					]),
				].join("\n")),
				"</omp-code-mode>",
			].join("\n\n");
			catalog = { key, text };
		}
		const original = typeof evaluation.description === "string" ? evaluation.description : "";
		const description = `${original.replace(REGION, "")}\n\n${catalog.text}`;
		return list.replace(project(list.tools, list.kind, hidden, { name: evaluation.name, description }));
	});
}
