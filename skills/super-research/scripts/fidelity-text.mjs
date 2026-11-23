// Static source/edition text projection. No code execution, CSS cascade, or OCR.
import { extname } from "node:path"

import { parseHtml, PROSE_BREAKS } from "./html-lite.mjs"

const HTML = new Set([".html", ".htm"])
const MARKDOWN = new Set([".md", ".markdown"])
const SKIP_TAGS = new Set(["head", "script", "style", "template", "noscript", "title"])
const BLOCK_TAGS = new Set([...PROSE_BREAKS, "body", "text", "summary"])
const INLINE_HIDDEN = /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))\s*(?:!important\s*)?(?:;|$)/i

export const normalizeText = (text) => text.normalize("NFC").replace(/\s+/gu, " ").trim()

export function textFormat(file) {
	const extension = extname(file).toLowerCase()
	if (HTML.has(extension)) return "html"
	if (MARKDOWN.has(extension)) return "md"
	if (extension === ".txt") return "text"
	return null
}

function htmlBlocks(html) {
	const blocks = []
	let pending = ""
	const flush = (quoted, table) => {
		const text = normalizeText(pending)
		if (text) blocks.push({ text: table ? text.replace(/^\| /, "") : text, quoted, table })
		pending = ""
	}
	const walk = (node, context) => {
		if (node.tag === "#text") {
			pending += node.text
			return
		}
		const { tag, attrs } = node
		if (SKIP_TAGS.has(tag) || Object.hasOwn(attrs, "hidden") || INLINE_HIDDEN.test(attrs.style ?? "")) return
		const { quoted, table, preformatted } = context
		const cell = table && (tag === "td" || tag === "th")
		const block = BLOCK_TAGS.has(tag)
		const boundary = block && ((!table && !preformatted) || tag === "tr")
		const blockquote = quoted || tag === "blockquote"
		const children = { quoted: blockquote, table: table || tag === "tr", preformatted: preformatted || tag === "pre" }
		if (boundary) flush(quoted, table)
		else if (cell || block) pending += cell ? " | " : " "
		if (tag === "q") pending += "“"
		if (tag === "svg") walk(parseHtml(node.raw ?? ""), children)
		for (const child of node.children) walk(child, children)
		if (tag === "q") pending += "”"
		if (boundary) flush(blockquote, children.table)
		else if (block) pending += " "
	}
	walk(parseHtml(html), { quoted: false, table: false, preformatted: false })
	flush(false, false)
	return blocks
}

const LINK_TARGET = /(!?)\[([^\]\n]*)\]\((?:[^()\n]|\([^()\n]*\))*\)/gu
const REFERENCE_DEFINITION = /^\s{0,3}\[(?!S(?:ource )?\d+\]:)[^\]]+\]:\s+\S/i
const FENCE = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/u
const PRE_START = /^ {0,3}<pre(?=[\s/>]|$)/iu
const PRE_END = /<\/pre\s*>/iu
const QUOTE_PREFIX = /^ {0,3}>[ \t]?/u
const COMMENT = /<!--[^\r\n]*?(-->|$)/gu
const LITERAL_LIST_PREFIX = /^ {0,3}(?:[-+*]|\d{1,9}[.)]) {1,4}(?! )/u
const LIST = /^\s{0,3}(?:[-+*]|\d{1,9}[.)])\s+/
const HEADING = /^\s{0,3}#{1,6}\s+/
const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/

function quotePrefix(line, limit = Infinity) {
	let end = 0
	let depth = 0
	while (depth < limit) {
		const match = QUOTE_PREFIX.exec(line.slice(end))
		if (!match) break
		end += match[0].length
		depth++
	}
	return { body: line.slice(end), depth }
}

function markdownInline(text) {
	return text
		.replace(LINK_TARGET, (_, image, label) => !image && /^S(?:ource )?[1-9]\d*$/i.test(label) ? `[${label}]` : label)
		.replace(/\[([^\]\n]+)\]\[(?!S(?:ource )?\d+\])[^\]\n]*\]/gi, "$1")
		.replace(/<((?:https?:\/\/|mailto:)[^>\s]+)>/gi, "$1")
		.replace(/(?<![\\*])(\*\*|\*)(?=[^\s*])([^*]+?)(?<=\S)\1(?!\*)/gu, "$2")
		.replace(/(?<![\\_\p{L}\p{M}\p{N}])(__|_)(?=[^\s_])([\s\S]+?)(?<=[^\s\\_])\1(?![_\p{L}\p{M}\p{N}])/gu, "$2")
		.replace(/(`+)([^`\n]+)\1/gu, "$2")
		.replace(/\\([\\`*_{}\[\]()#+\-.!|>])/gu, "$1")
}

// Project common block forms statically; this is not a full Markdown renderer.
function markdownBlocks(markdown) {
	const blocks = []
	let pending = []
	let inQuote = false
	let inComment = false
	let literal = null
	const flush = (row = false) => {
		if (pending.length) {
			const text = markdownInline(pending.join("\n"))
			for (const block of htmlBlocks(text)) {
				blocks.push({
					text: row && !block.table ? block.text.replace(/^\| /, "") : block.text,
					quoted: inQuote || block.quoted,
					table: block.table || (row && block.text.includes(" | ")),
				})
			}
			pending = []
		}
	}
	const flushLiteral = () => {
		const raw = literal.lines.join("\n")
		const quoted = literal.depth > 0
		if (literal.marker) {
			// Fence contents display literally, including entity and comment syntax.
			const text = normalizeText(raw)
			if (text) blocks.push({ text, quoted, table: false })
		} else {
			for (const block of htmlBlocks(raw)) blocks.push({ ...block, quoted: quoted || block.quoted })
		}
		literal = null
	}
	for (const raw of markdown.split(/\r\n?|\n/u)) {
		if (literal) {
			const { body, depth } = quotePrefix(raw, literal.depth)
			if (depth === literal.depth && (!body.trim() || body.startsWith(literal.indent))) {
				const content = body.slice(literal.indent.length)
				const end = literal.marker && FENCE.exec(content)
				if (end && end[1][0] === literal.marker[0] && end[1].length >= literal.marker.length && /^[ \t]*$/u.test(end[2])) {
					flushLiteral()
				} else {
					literal.lines.push(content)
					if (!literal.marker && PRE_END.test(content)) flushLiteral()
				}
				continue
			}
			flushLiteral()
		}
		let line = raw
		if (inComment) {
			const end = line.indexOf("-->")
			if (end === -1) continue
			line = line.slice(end + 3)
			inComment = false
		}
		const opening = quotePrefix(line)
		const listPrefix = LITERAL_LIST_PREFIX.exec(opening.body)?.[0] ?? ""
		const literalStart = opening.body.slice(listPrefix.length)
		const match = FENCE.exec(literalStart)
		const marker = match && (match[1][0] === "~" || !match[2].includes("`")) ? match[1] : null
		if (marker || PRE_START.test(literalStart)) {
			flush()
			literal = { marker, depth: opening.depth, indent: " ".repeat(listPrefix.length), lines: marker ? [] : [literalStart] }
			if (!marker && PRE_END.test(literalStart)) flushLiteral()
			continue
		}
		line = line.replace(COMMENT, (_, end) => {
			inComment = !end
			return ""
		})
		if (!line.trim() || TABLE_RULE.test(line) || REFERENCE_DEFINITION.test(line)) {
			flush()
			continue
		}
		const { body, depth } = quotePrefix(line)
		const quoted = depth > 0
		const heading = HEADING.test(body)
		const row = body.includes("|") && (/^\s*\||\|\s*$/u.test(body) || /\s\|\s/u.test(body))
		if (quoted !== inQuote || heading || row || LIST.test(body)) flush()
		inQuote = quoted
		const content = body.replace(HEADING, "").replace(LIST, "")
		pending.push(row ? content.replace(/[ \t]*\|[ \t]*/gu, " | ") : content)
		if (heading || row) flush(row)
	}
	flush()
	if (literal) flushLiteral()
	return blocks
}

export function projectText(text, format) {
	switch (format) {
		case "html":
			return htmlBlocks(text)
		case "md":
			return markdownBlocks(text)
		case "text":
			return text.replace(/\r\n?/gu, "\n").split(/\n(?:[^\S\n]*\n)+/u)
				.map((paragraph) => ({ text: normalizeText(paragraph), quoted: false })).filter((block) => block.text)
		default:
			throw new TypeError(`unsupported text projection: ${format}`)
	}
}

export function decodeText(bytes) {
	return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
}
