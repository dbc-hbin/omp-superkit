import { PRESET_REGION } from "./host";
import { payloadObject, requestLayout, rewriteArray, rewriteField, rewriteKiroCurrentInput } from "./request-tools";

export { requestToolView, rewriteToolGuidancePayload } from "./request-tools";

type PayloadObject = NonNullable<ReturnType<typeof payloadObject>>;
type PromptReplacement = string | ((match: string) => string);

const codexApi = "openai-codex-responses";
const codexLiteMetadata = "ws_request_header_x_openai_internal_codex_responses_lite";

type CodexRequestModel = {
	readonly api: string;
	readonly id: string;
	readonly provider?: string;
	readonly baseUrl?: string;
};

export type CodexCompletion = {
	readonly api: string;
	readonly model: string;
	readonly provider: string;
	readonly responseId?: string;
	readonly stopReason: string;
};

type CodexGuidance = {
	readonly guidance: string;
	readonly liteTools: readonly unknown[] | undefined;
};

/** Keep one confirmed anchor per recent Codex socket scope, never a transcript. */
export function createCodexCodeModeChain() {
	const accepted = new Map<string, CodexGuidance & { readonly responseId: string }>();
	let pending: (CodexGuidance & {
		readonly scope: string;
		readonly sessionId: string;
		readonly wireSession: string | undefined;
		readonly modelId: string;
		readonly provider: string | undefined;
	}) | undefined;

	return {
		request(payload: unknown, model: CodexRequestModel, session: { getSessionId(): string }) {
			if (model.api !== codexApi) return;
			const sessionId = session.getSessionId();
			const body = payloadObject(payload);
			const metadata = payloadObject(body?.client_metadata);
			const wireSession = typeof metadata?.session_id === "string" ? metadata.session_id : undefined;
			// Side conversations have their own wire session. They do not
			// produce the main loop's assistant_message completion.
			if (pending?.sessionId === sessionId && pending.wireSession === sessionId && wireSession && wireSession !== sessionId) return;
			pending = undefined;
			if (!body || body.type !== "response.create" || !Array.isArray(body.input)) return;
			const lite = metadata?.[codexLiteMetadata] === "true";
			const scope = JSON.stringify([
				sessionId, model.provider, model.baseUrl, model.id, body.model, body.prompt_cache_key,
				wireSession, metadata?.thread_id, metadata?.["x-codex-window-id"], lite,
			]);
			const previous = typeof body.previous_response_id === "string" && body.previous_response_id;
			const anchor = accepted.get(scope);
			const carried = previous && anchor?.responseId === previous ? anchor : undefined;
			const first = payloadObject(body.input[0]);
			const declared = first?.type === "additional_tools" && first.role === "developer" && Array.isArray(first.tools)
				? first.tools : undefined;
			const liteTools = declared ?? (lite ? carried?.liteTools : undefined);
			// In Lite, the socket already holds the leading additional_tools
			// item. Use it to interpret *this* choice without moving tools on wire.
			const toolView = liteTools && !declared && body.tools === undefined
				? { ...body, input: [{ type: "additional_tools", role: "developer", tools: liteTools }] }
				: payload;
			return {
				toolView,
				previousGuidance: carried?.guidance,
				observe(guidance: string) {
					if (!previous || carried) {
						pending = { scope, sessionId, wireSession, modelId: model.id, provider: model.provider, guidance, liteTools };
					}
				},
			};
		},
		complete(message: CodexCompletion, session: { getSessionId(): string }) {
			if (!pending || message.api !== codexApi || pending.sessionId !== session.getSessionId() ||
				message.model !== pending.modelId || message.provider !== pending.provider) return;
			const { scope, guidance, liteTools } = pending;
			pending = undefined;
			if (!message.responseId || message.stopReason === "error" || message.stopReason === "aborted") return;
			accepted.delete(scope);
			accepted.set(scope, { responseId: message.responseId, guidance, liteTools });
			if (accepted.size > 8) {
				const oldest = accepted.keys().next().value;
				if (oldest !== undefined) accepted.delete(oldest);
			}
		},
	};
}

function rewriteText(value: unknown, replacement: PromptReplacement, region: RegExp): unknown {
	if (typeof value !== "string") return value;
	// Callback replacement keeps literal dollar sequences in preset text intact.
	return value.replace(region, typeof replacement === "string" ? () => replacement : replacement);
}

function rewriteBlocks(value: unknown, replacement: PromptReplacement, typed: boolean, region: RegExp): unknown {
	if (typeof value === "string") return rewriteText(value, replacement, region);
	return rewriteArray(value, block => {
		const object = payloadObject(block);
		if (!object || (typed && object.type !== "text" && object.type !== "input_text")) return block;
		return rewriteField(object, "text", text => rewriteText(text, replacement, region));
	});
}

function rewriteMessages(value: unknown, replacement: PromptReplacement, region: RegExp): unknown {
	return rewriteArray(value, message => {
		const object = payloadObject(message);
		if (!object || (object.role !== "system" && object.role !== "developer")) return message;
		// Responses tool items may have unrelated fields; only message content is eligible.
		if (object.type !== undefined && object.type !== "message") return message;
		return rewriteField(object, "content", content => rewriteBlocks(content, replacement, true, region));
	});
}

function rewriteGoogle(object: PayloadObject, replacement: PromptReplacement, region: RegExp): PayloadObject {
	return rewriteField(object, "systemInstruction", instruction => {
		if (typeof instruction === "string") return rewriteText(instruction, replacement, region);
		const content = payloadObject(instruction);
		if (!content) return instruction;
		return rewriteField(content, "parts", parts => rewriteBlocks(parts, replacement, false, region));
	});
}

function rewriteGitLabFlow(object: PayloadObject, replacement: PromptReplacement, region: RegExp): PayloadObject {
	return rewriteField(object, "flowConfig", config => {
		const flow = payloadObject(config);
		if (!flow) return config;
		return rewriteField(flow, "prompts", prompts => rewriteArray(prompts, prompt => {
			const entry = payloadObject(prompt);
			if (!entry) return prompt;
			return rewriteField(entry, "prompt_template", template => {
				const fields = payloadObject(template);
				return fields ? rewriteField(fields, "system", text => rewriteText(text, replacement, region)) : template;
			});
		}));
	});
}

/** Replace only complete extension-owned regions in known provider system-prompt paths.
 * Unrecognized shapes, missing markers, and already-current presets retain identity.
 * Regions must be wholly contained in a single text field; blocks are never merged.
 */
export function rewritePresetPayload(payload: unknown, api: string, replacement: PromptReplacement, region = PRESET_REGION): unknown {
	const root = payloadObject(payload);
	const layout = root && requestLayout(root, api);
	if (!root || !layout) return payload;
	const { kind, body, path } = layout;
	let next;
	switch (kind) {
		case "responses":
			next = rewriteField(rewriteField(body, "instructions", text => rewriteText(text, replacement, region)),
				"input", input => rewriteMessages(input, replacement, region));
			break;
		case "chat": next = rewriteField(body, "messages", messages => rewriteMessages(messages, replacement, region)); break;
		case "devin": next = rewriteField(body, "prompt", text => rewriteText(text, replacement, region)); break;
		case "cursor": next = rewriteField(body, "customSystemPrompt", text => rewriteText(text, replacement, region)); break;
		case "gitlab": next = rewriteGitLabFlow(body, replacement, region); break;
		case "google": next = rewriteGoogle(body, replacement, region); break;
		case "anthropic":
		case "bedrock":
			next = rewriteField(body, "system", system => rewriteBlocks(system, replacement, kind === "anthropic", region));
			break;
		case "kiro": return payload; // Kiro joins the system prompt and user text in the same field.
	}
	return path ? rewriteField(root, path, () => next) : next;
}

const standaloneCodeMode = /^<omp-code-mode>(?:(?!<\/?omp-code-mode>)[\s\S])*<\/omp-code-mode>$(?![\s\S])/;

function syncText(value: unknown, guidance: string): unknown {
	if (typeof value !== "string") return value;
	// String-only carriers have no block boundary. We own the complete slot or a
	// terminal paragraph we appended, never markers embedded inside custom text.
	const start = value.lastIndexOf("<omp-code-mode>");
	const standalone = standaloneCodeMode.test(value.slice(Math.max(start, 0)));
	if (standalone && start === 0) return guidance || undefined;
	if (standalone && value.slice(start - 2, start) === "\n\n") {
		const prefix = value.slice(0, start - 2);
		return guidance ? `${prefix}\n\n${guidance}` : prefix;
	}
	return guidance ? value ? `${value}\n\n${guidance}` : guidance : value;
}

function syncField(body: PayloadObject, key: string, sync: (value: unknown) => unknown): PayloadObject {
	const value = body[key];
	const next = sync(value);
	if (next === value) return body;
	if (next !== undefined) return { ...body, [key]: next };
	const { [key]: removed, ...rest } = body;
	return rest;
}

function syncBlocks(value: unknown, guidance: string, typed: boolean): unknown {
	if (typeof value === "string") return syncText(value, guidance);
	if (!Array.isArray(value)) return value;
	const blocks: readonly unknown[] = value;
	let kept = false;
	const next = blocks.flatMap(block => {
		const item = payloadObject(block);
		if (!item || (typed && item.type !== "text") || typeof item.text !== "string" || !standaloneCodeMode.test(item.text)) return [block];
		if (!guidance || kept) return [];
		kept = true;
		return [rewriteField(item, "text", () => guidance)];
	});
	if (guidance && !kept) next.push(typed ? { type: "text", text: guidance } : { text: guidance });
	return next.length === blocks.length && next.every((item, index) => item === blocks[index]) ? value : next;
}

function syncChatContent(value: unknown, guidance: string): unknown {
	if (Array.isArray(value)) {
		// A gateway may wrap a string (including our terminal paragraph) in
		// a typed content block. Reuse that paragraph instead of appending.
		const tail = payloadObject(value.at(-1));
		if (tail?.type === "text" && typeof tail.text === "string") {
			const prefix = syncText(tail.text, "");
			if (typeof prefix === "string" && prefix !== tail.text) {
				const updated = rewriteField(tail, "text", text => syncText(text, guidance));
				return updated === tail ? value : [...value.slice(0, -1), updated];
			}
		}
	}
	return syncBlocks(value, guidance, true);
}

function syncChatMessages(value: unknown, guidance: string): unknown {
	if (!Array.isArray(value)) return value;
	const items: readonly unknown[] = value;
	const first = payloadObject(items[0]);
	if (!first || (first.role !== "system" && first.role !== "developer")) {
		return guidance ? [{ role: "system", content: guidance }, ...items] : value;
	}
	// OMP may have already coalesced all instructions into one message for a
	// template that rejects a second system message. Reuse that leading slot.
	const content = syncChatContent(first.content, guidance);
	if (content === first.content) return value;
	if (content === undefined && Object.keys(first).length === 2) return items.slice(1);
	return [{ ...first, content: content ?? "" }, ...items.slice(1)];
}

function responsesCodeModeItem(guidance: string) {
	return { type: "message", role: "developer", content: [{ type: "input_text", text: guidance }] };
}

function syncResponsesInput(value: unknown, guidance: string): unknown {
	if (!Array.isArray(value)) return value;
	const items: readonly unknown[] = value;
	// Only touch the leading live instructions. Developer items in the middle
	// of history (including additional_tools controls) are not the current slot.
	let end = 0;
	let owned: { readonly index: number; readonly entry: PayloadObject } | undefined;
	for (const item of items) {
		const entry = payloadObject(item);
		if (end === 0 && entry?.type === "additional_tools" && entry.role === "developer") {
			end++;
			continue;
		}
		if (!entry || (entry.role !== "system" && entry.role !== "developer") || (entry.type !== undefined && entry.type !== "message")) break;
		const part = Array.isArray(entry.content) && entry.content.length === 1 ? payloadObject(entry.content[0]) : undefined;
		const text = part?.type === "input_text" || part?.type === "text" ? part.text : entry.content;
		if (typeof text === "string" && standaloneCodeMode.test(text)) owned = { index: end, entry };
		end++;
	}
	if (owned) {
		const { index, entry } = owned;
		if (!guidance) return [...items.slice(0, index), ...items.slice(index + 1)];
		const updated = rewriteField(entry, "content", content => Array.isArray(content)
			? rewriteArray(content, part => {
				const block = payloadObject(part);
				return block ? rewriteField(block, "text", () => guidance) : part;
			})
			: guidance);
		return updated === entry ? value : [...items.slice(0, index), updated, ...items.slice(index + 1)];
	}
	if (!guidance) return value;
	return [...items.slice(0, end), responsesCodeModeItem(guidance), ...items.slice(end)];
}

/** Synchronize the standalone fallback block without rewriting the model role or unrelated text. */
export function syncCodeModeBlock(payload: unknown, api: string, guidance = "", previousGuidance?: string): unknown {
	const root = payloadObject(payload);
	const layout = root && requestLayout(root, api);
	if (!root || !layout) return payload;
	const { kind, body, path } = layout;
	let next;
	switch (kind) {
		case "anthropic":
		case "bedrock":
			next = syncField(body, "system", system => syncBlocks(
				system === undefined && guidance && Array.isArray(body.messages) ? [] : system, guidance, kind === "anthropic"));
			break;
		case "google":
			next = syncField(body, "systemInstruction", instruction => {
				if (typeof instruction === "string") return syncText(instruction, guidance);
				const content = payloadObject(instruction);
				if (content) {
					const updated = rewriteField(content, "parts", parts => syncBlocks(parts, guidance, false));
					return updated !== content && Array.isArray(updated.parts) && updated.parts.length === 0 && Object.keys(updated).length === 1
						? undefined : updated;
				}
				return instruction === undefined && guidance && (Array.isArray(body.contents) || path === "config" && Array.isArray(root.contents))
					? { parts: [{ text: guidance }] } : instruction;
			});
			break;
		case "chat": next = rewriteField(body, "messages", messages => syncChatMessages(messages, guidance)); break;
		case "devin":
			// Keep the protobuf string field, even when it contained only guidance.
			next = rewriteField(body, "prompt", prompt => syncText(prompt, guidance) ?? "");
			break;
		case "kiro":
			if (!guidance) return payload;
			// Kiro serializes the transcript afresh for each request. Only append to the live
			// turn; a tag in the existing text might be the user's, not ours to replace.
			next = rewriteKiroCurrentInput(body, input => rewriteField(input, "content", content => {
				const suffix = `\n\n${guidance}`;
				if (typeof content !== "string" || content === guidance || content.endsWith(suffix)) return content;
				return content ? content + suffix : guidance;
			}));
			break;
		case "responses":
			if (typeof body.previous_response_id === "string" && body.previous_response_id.length > 0) {
				if (previousGuidance === undefined || previousGuidance === guidance || api !== codexApi ||
					body.type !== "response.create" || !Array.isArray(body.input)) return payload;
				// Codex reattaches its unprojected prefix when a hook drops the
				// anchor. That prefix is capability-neutral. A new live item must
				// be in the delta, not in the unseen prefix, to survive the replay.
				const { previous_response_id: removed, ...replay } = body;
				return guidance ? { ...replay, input: [...body.input, responsesCodeModeItem(guidance)] } : replay;
			}
			next = typeof body.instructions === "string"
				? syncField(body, "instructions", instructions => syncText(instructions, guidance))
				: Array.isArray(body.input)
					? rewriteField(body, "input", input => syncResponsesInput(input, guidance))
					: typeof body.input === "string" && body.instructions === undefined && guidance
						? { ...body, instructions: guidance } : body;
			break;
		case "gitlab":
		case "cursor": return payload;
	}
	return path ? rewriteField(root, path, () => next) : next;
}
