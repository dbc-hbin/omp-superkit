// Shared lexical scan for the report and retained source. Comparing whole mentions
// avoids borrowing a bare digit or silently equating percent, scale or unit changes.
import { normalizeText } from "./fidelity-text.mjs"

const SOURCE_MARKER = /\[(?:S|Source )([1-9]\d*)\]/gi
const URI = /(?:https?:\/\/|mailto:)[^\s<>"“”]+/giu
const CURRENCY = /(?:[+\-−][ \t]*)?(?:(?<![\p{L}\p{N}])(?:[A-Z]{2,3}[$£€¥₩]|USD|EUR|GBP|JPY|KRW|CNY|CAD|AUD|INR)|[$£€¥₩₹])\s*$/u
const CORE = String.raw`(?:\d{1,3}(?:[ ,.'’]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?|[.,]\d+|\p{N}+)`
const NUMBERS = new RegExp(String.raw`(?:[<>≤≥≈~]\s*)?[+\-−]?${CORE}(?:[eE][+\-]?\d+)?(?:[-−–/:]\d+(?:[.,]\d+)?)*`, "gu")
const UNIT_ATOM = String.raw`[\p{L}°][\p{L}\p{M}°]*(?:\^[+\-−]?\d+|[⁰¹²³⁴⁵⁶⁷⁸⁹]+)?`
const UNIT_WORD = new RegExp(String.raw`^(?:[ \t]*|-)(${UNIT_ATOM}(?:-${UNIT_ATOM})*)`, "u")
const UNIT_SYMBOL = /^\s*(%|‰|‱|[$£€¥₩₹])/u
const UNIT_JOIN = /^(?:[ \t]*[/·][ \t]*|[ \t]+per[ \t]+)/iu
const FUNCTION_WORD = /^(?:and|or|to|from|for|of|in|on|by|with|was|were|are|is|as|than|that|which|after|before)$/iu
const UNIT_PREFIX = /^(?:hundred|thousand|million|billion|trillion|lakh|crore|usd|eur|gbp|jpy|krw|cny|cad|aud|inr|us|metric|square|cubic|nautical|fluid|imperial|troy|per|만|억|조|천만|백만|万|亿|億|兆|千|百)$/iu
const UNIT_NAME = /^(?:kg|g|mg|lbs?|m|km|cm|mm|s|ms|ns|min|h|hz|khz|mhz|ghz|w|kw|mw|pa|kpa|kwh|kb|mb|gb|tb|°[cf]|grams?|kilograms?|pounds?|met(?:re|er)s?|kilomet(?:re|er)s?|miles?|feet|foot|inch(?:es)?|yards?|seconds?|minutes?|hours?|days?|weeks?|months?|years?|lit(?:re|er)s?|gallons?|ounces?|tons?|tonnes?|percent|units?|dollars?|euros?|yen|yuan|won|rupees?)\b/iu
const COMPOUND_UNIT = /^[ \t]*(?:(?:kilo|mega|giga|tera)?watt[ \t]+(?:hours?|seconds?)|(?:newton|pound)[ \t]+(?:met(?:re|er)s?|feet|foot)|survey[ \t]+(?:feet|foot)|light[ \t]+years?|electron[ \t]+volts?)(?![\p{L}\p{M}\p{N}])/iu
const PARENTHETICAL_UNIT = /^\s*\(([^)\d|\[\]]{1,48})\)/u
const SCALE_PREFIX = /^[ \t]*(?:천만|백만|[만억조万亿億兆千百])/u
const PERCENTAGE_POINTS = /^[ \t]*(?:percent(?:age)? points?|%[ \t]*p(?:oints?)?|basis points?)(?![\p{L}\p{M}])/iu
const CALENDAR_INTRO = /(?:^|[,.;:!?])[ \t]*(?:in|during|throughout|before|after|since|until|by|as of)[ \t]+$/iu
const CALENDAR_CLAUSE = /^[ \t]+(?:(?:the|a|an|its|their|our)[ \t]+)?[\p{L}][\p{L}\p{M}-]*[ \t]+(?:is|are|was|were|has|have|had|will|would|can|could|grew|rose|fell|shrank|increased|decreased|declined|improved|worsened|surged|dropped|slowed|expanded|contracted|peaked|changed|remained|stayed)(?![\p{L}\p{M}\p{N}])/iu
const CURLY_SINGLE_BODY = String.raw`((?:[^’\n]|’(?=[\p{L}\p{M}\p{N}]))+?)`
const QUOTES = new RegExp(String.raw`"([^"\n]+)"|“([^”\n]+)”|‘‘${CURLY_SINGLE_BODY}’’|‘${CURLY_SINGLE_BODY}’(?![\p{L}\p{M}\p{N}])|«([^»\n]+)»|‹([^›\n]+)›|「([^」\n]+)」|『([^』\n]+)』|(?<![\p{L}\p{N}])'((?:[^'\n]|'(?=[\p{L}\p{N}]))+?)'(?![\p{L}\p{N}])`, "gu")
const WORD = /[\p{L}\p{M}\p{N}]/u
const CLOSING_CITATIONS = /(?:\s*\[(?:S|Source )[1-9]\d*\])+\s*$/iu

export const sourceIdPattern = /^S[1-9]\d*$/

function sourceIds(text) {
	return new Set([...text.matchAll(SOURCE_MARKER)].map((match) => `S${match[1]}`))
}

function withoutMetadata(text) {
	return text.replace(URI, (value) => " ".repeat(value.length))
		.replace(SOURCE_MARKER, (value) => " ".repeat(value.length))
}

function unitWord(tail) {
	const match = UNIT_WORD.exec(tail)
	return match && !FUNCTION_WORD.test(match[1]) ? match : null
}

function unitSegmentLength(tail) {
	let width = 0
	while (true) {
		const rest = tail.slice(width)
		const parenthetical = PARENTHETICAL_UNIT.exec(rest)
		if (parenthetical && hasUnit(parenthetical[1])) return width + parenthetical[0].length
		const fixed = PERCENTAGE_POINTS.exec(rest) ?? UNIT_SYMBOL.exec(rest) ?? COMPOUND_UNIT.exec(rest)
		if (fixed) return width + fixed[0].length
		const word = unitWord(rest)
		if (!word) return width
		width += word[0].length
		// Korean and CJK scales can also be written directly beside a unit/particle.
		if (!(UNIT_PREFIX.test(word[1]) || SCALE_PREFIX.test(rest)) || !/^[ \t]/u.test(tail.slice(width))) return width
	}
}

function suffixLength(tail) {
	let width = unitSegmentLength(tail)
	if (width === 0) return width
	for (let join = UNIT_JOIN.exec(tail.slice(width)); join; join = UNIT_JOIN.exec(tail.slice(width))) {
		const next = width + join[0].length
		const segment = unitSegmentLength(tail.slice(next))
		if (segment === 0) break
		width = next + segment
	}
	return width
}

function hasUnit(text) {
	const word = unitWord(text)
	return Boolean(UNIT_SYMBOL.test(text) || COMPOUND_UNIT.test(text)
		|| (word && (UNIT_PREFIX.test(word[1]) || UNIT_NAME.test(word[1]) || UNIT_JOIN.test(text.slice(word[0].length)))))
}

export function numericMentions(text) {
	const scan = withoutMetadata(text)
	const numbers = new RegExp(NUMBERS)
	const mentions = []
	for (let match = numbers.exec(scan); match; match = numbers.exec(scan)) {
		const head = scan.slice(0, match.index)
		const tail = scan.slice(numbers.lastIndex)
		const prefix = CURRENCY.exec(head)
		const start = prefix ? prefix.index : match.index
		// Require both a temporal lead-in and a following prose clause. Unknown
		// quantity labels outside that context still belong to the literal amount.
		const calendarYear = !prefix && /^\d{4}$/u.test(match[0])
			&& CALENDAR_INTRO.test(head) && CALENDAR_CLAUSE.test(tail) && !hasUnit(tail)
		const end = numbers.lastIndex + (calendarYear ? 0 : suffixLength(tail))
		mentions.push({ kind: "number", value: normalizeText(text.slice(start, end)), start, end })
		numbers.lastIndex = end
	}
	return mentions
}

export function reportMentions({ text, quoted, table }) {
	const body = quoted ? text.replace(CLOSING_CITATIONS, "").trimEnd() : null
	// A verbatim quote also accounts for its own numerals; amounts in surrounding
	// report prose still need their own independent bindings.
	const quotes = body
		? [{ start: 0, end: body.length, value: body }]
		: [...text.matchAll(QUOTES)].map((match) => ({
			start: match.index,
			end: match.index + match[0].length,
			value: match.slice(1).find((part) => part !== undefined),
		}))
	let citationText = text
	for (const quote of [...quotes].reverse()) citationText = `${citationText.slice(0, quote.start)} ${citationText.slice(quote.end)}`
	return { cites: sourceIds(citationText), sites: [
		...quotes.map((quote) => ({ ...quote, kind: "quote", value: normalizeText(quote.value) })),
		...numericMentions(text).filter(({ start, end }) => !quotes.some((quote) => start >= quote.start && end <= quote.end)),
	].map((site) => ({ ...site, needsUnit: table && site.kind === "number" && /^[+\-−≈~<>≤≥\s\p{N},.'’]+$/u.test(site.value) })) }
}

// A contiguous occurrence cannot start/end inside a word or digit token. Use the
// full source block to scan numerals even when a selected excerpt ends at the digit.
export function excerptRanges(text, excerpt) {
	const ranges = []
	const first = excerpt[0]
	const last = excerpt.at(-1)
	for (let start = text.indexOf(excerpt); start >= 0; start = text.indexOf(excerpt, start + 1)) {
		const end = start + excerpt.length
		if (WORD.test(first) && start > 0 && WORD.test(text[start - 1])) continue
		if (WORD.test(last) && end < text.length && WORD.test(text[end])) continue
		ranges.push({ start, end })
	}
	return ranges
}
