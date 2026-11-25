export interface ToolInfo {
	readonly name: string;
	readonly parameters?: unknown;
}

function supportsLanguage(schema: unknown, language: "py" | "js"): boolean {
	if (!schema || typeof schema !== "object") return false;
	if ("const" in schema && schema.const === language) return true;
	if ("enum" in schema && Array.isArray(schema.enum) && schema.enum.includes(language)) return true;
	const accepts = (branch: unknown) => supportsLanguage(branch, language);
	return ("anyOf" in schema && Array.isArray(schema.anyOf) && schema.anyOf.some(accepts))
		|| ("oneOf" in schema && Array.isArray(schema.oneOf) && schema.oneOf.some(accepts));
}

/** OMP owns discovery, execution and the provider-visible tools. Only steer how to use them. */
export function codeModeGuidance(enabled: readonly ToolInfo[]): string {
	const parameters = enabled.find(tool => tool.name === "eval")?.parameters;
	// OMP returns its callable omptype schema here, not the provider's JSON object.
	const schema: unknown = typeof parameters === "function" && "toJsonSchema" in parameters
		&& typeof parameters.toJsonSchema === "function" ? parameters.toJsonSchema() : parameters;
	if (!schema || typeof schema !== "object" || !("properties" in schema)) return "";
	const properties = schema.properties;
	if (!properties || typeof properties !== "object" || !("language" in properties)) return "";
	const python = supportsLanguage(properties.language, "py");
	const js = supportsLanguage(properties.language, "js");
	if (!python && !js) return "";
	return [
		"<omp-code-mode>",
		python && js
			? 'Use language="js" by default for all bridge calls. Use language="py" only when the work needs a Python library, API, or existing Python kernel state.'
			: `Use language="${js ? "js" : "py"}" for bridge calls.`,
		'Default to eval for ordinary bridge-callable work, even for a single call. A separate top-level schema is not a reason to use it directly. Use await tool["name"](args) with the host’s advertised names and schemas, and return only what you need.',
		...(enabled.some(tool => tool.name === "bash")
			? ['Read mounted command help with await tool.bash({"command": "<name> --help"}) inside eval.'] : []),
		...(enabled.some(tool => tool.name === "task") ? [
			"Spawn asynchronous workers with await tool.task(args) inside eval. Run blocking workers through top-level task so their usage is recorded for goal budgets and resumed session cost limits. If that route is unavailable, do not spawn a blocking worker through eval.",
		] : []),
		"While native Prewalk is waiting for its implementation handoff, send the checklist update via top-level todo when offered and the first authorized file change via the native edit/write route (or an outer bash write-class tool command). Resume using eval for ordinary work after the handoff.",
		"Use the advertised top-level route whenever the host consumes the outer result: for plan or preview decisions (propose, resolve, reject), call the direct tool when offered, or use outer bash for a mounted command. Never dispatch a decision inside eval. The same top-level rule applies to human questions, native waits, session changes and attachments. Never route around a denied call.",
		"On a restricted turn, such as an AutoLearn capture, obey its permitted routes; a displayed eval schema does not override a restriction on its use.",
		"</omp-code-mode>",
	].join("\n");
}
