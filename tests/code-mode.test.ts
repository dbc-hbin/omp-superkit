import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import install from "../index";
import { codeModeGuidance, type ToolInfo } from "../code-mode";

const model = { id: "claude-sonnet-5-5", api: "anthropic-messages" };
const evalTool = (language: unknown) => ({ name: "eval", parameters: { type: "object", properties: { language } } });

test("guidance follows the enabled eval kernel, not the provider transport", () => {
	for (const [language, expected] of [
		[{ anyOf: [{ const: "py" }, { const: "js" }] }, ["js", "py"]],
		[{ enum: ["py"] }, ["py"]],
		[{ oneOf: [{ const: "js" }] }, ["js"]],
	] as const) {
		const tools = [evalTool(language)];
		const guidance = codeModeGuidance(tools);
		expect([...guidance.matchAll(/language="(py|js)"/g)].map(match => match[1])).toEqual([...expected]);
	}
	expect(codeModeGuidance([{ name: "read" }])).toBe("");
	expect(codeModeGuidance([evalTool({ enum: ["unsupported"] })])).toBe("");
});

test("an unmounted approval tool stays a top-level call without bash", () => {
	const guidance = codeModeGuidance([evalTool({ enum: ["js"] }), { name: "propose" }]);
	expect(guidance).toMatch(/propose, resolve, reject\).*direct tool when offered/);
	expect(guidance).toContain("Never dispatch a decision inside eval");
	expect(guidance).not.toContain("tool.bash(");
});

test("a late native tool stays declared wherever the host references it, without inlining its schema into eval", async () => {
	type Handler = (event: never, ctx: never) => unknown;
	const handlers = new Map<string, Handler[]>();
	const evaluation = evalTool({ enum: ["py", "js"] });
	const late = { name: "late-lookup", parameters: { type: "object", properties: { native_query: { type: "string" } } } };
	const enabled: ToolInfo[] = [evaluation];
	install({
		setLabel() {}, getCommands: () => [], registerCommand() {}, registerFlag() {}, sendUserMessage() {}, appendEntry() {}, getFlag: () => false,
		getActiveTools: () => enabled.map(tool => tool.name),
		getAllTools: () => enabled.map(tool => ({ ...tool, description: tool.name })),
		on: (event: string, handler: Handler) => { handlers.set(event, [...handlers.get(event) ?? [], handler]); },
	});
	const ctx = {
		cwd: ".", mode: "rpc", model, agent: { kind: "main" },
		ui: { notify() {} }, sessionManager: { getSessionId: () => "roster", getBranch: () => [] },
	};
	let blocks = [readFileSync(new URL("./fixtures/omp-system-prompt.md", import.meta.url), "utf8")];
	for (const handler of handlers.get("before_agent_start") ?? []) {
		const next: unknown = await Reflect.apply(handler, undefined, [{ prompt: "Read", systemPrompt: blocks }, ctx]);
		if (next && typeof next === "object" && "systemPrompt" in next && Array.isArray(next.systemPrompt)) blocks = next.systemPrompt;
	}
	expect(blocks.join("\n")).not.toContain("<omp-code-mode>");
	const added = { name: "_" + late.name, description: "late lookup", input_schema: late.parameters, defer_loading: true };
	const base = { name: "_eval", description: "Native eval", input_schema: evaluation.parameters };
	const change = { role: "system", content: [{ type: "tool_addition", tool: { type: "tool_reference", name: added.name } }] };
	for (const add of [false, true]) {
		if (add) enabled.push(late);
		const input = { system: blocks[0], tools: add ? [base, added] : [base], messages: add ? [change] : [] };
		const native = structuredClone(input);
		let output: unknown = input;
		for (const handler of handlers.get("before_provider_request") ?? []) {
			output = await Reflect.apply(handler, undefined, [{ payload: output }, ctx]) ?? output;
		}
		expect(output).toHaveProperty("tools", native.tools);
		expect(output).toHaveProperty("messages", native.messages);
		expect(output).toHaveProperty("system", expect.stringContaining("<omp-code-mode>"));
	}
});
