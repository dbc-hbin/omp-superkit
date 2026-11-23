// A binding selects a concrete report occurrence and a unique retained context.
// Verifying always scans the edition too: simply omitting a row cannot hide a fact.
import { excerptRanges, numericMentions, reportMentions, sourceIdPattern } from "./fidelity-mentions.mjs"
import { FidelityError, loadSources, parseMaterial, readMaterial, sha256, textMaterial } from "./fidelity-sources.mjs"
import { normalizeText, projectText, textFormat } from "./fidelity-text.mjs"

const FIELDS = ["kind", "block", "value", "source", "excerpt"]
const siteKey = ({ kind, block, value }) => JSON.stringify([kind, block, value])

function parseBindings(bytes, path) {
	const input = parseMaterial(bytes, path, "bindings_invalid")
	if (!Array.isArray(input)) throw new FidelityError("bindings_invalid", `${path}: bindings must be a JSON array`)
	return input.map((row, index) => {
		if (row === null || typeof row !== "object" || Array.isArray(row) || Object.keys(row).length !== FIELDS.length
			|| !FIELDS.every((field) => typeof row[field] === "string" && row[field].trim())
			|| !["number", "quote"].includes(row.kind) || !sourceIdPattern.test(row.source)) {
			throw new FidelityError("bindings_invalid", `${path}: row ${index + 1} needs kind (number|quote), block, value, source (S<n>) and excerpt`)
		}
		return { kind: row.kind, block: normalizeText(row.block), value: normalizeText(row.value), source: row.source, excerpt: normalizeText(row.excerpt) }
	})
}

function sourceSupports(binding, source) {
	const contexts = source.blocks.flatMap(({ text }) => excerptRanges(text, binding.excerpt)
		.map((range) => ({ text, ...range })))
	if (contexts.length !== 1) return "source_excerpt_not_unique"
	const context = contexts[0]
	const amounts = numericMentions(context.text)
	if (binding.kind === "quote") {
		const quotes = excerptRanges(context.text, binding.value)
			.filter(({ start, end }) => start >= context.start && end <= context.end
				&& amounts.every((amount) => amount.end <= start || amount.start >= end || (amount.start >= start && amount.end <= end)))
		return quotes.length === 1 ? null : "quote_mismatch"
	}
	const matches = amounts
		.filter(({ start, end, value }) => start >= context.start && end <= context.end && value === binding.value)
	return matches.length === 1 ? null : "number_mismatch"
}

export function inspectEdition(sessionDir, { report, bindings }) {
	const format = textFormat(report)
	if (!format) throw new FidelityError("edition_format", `${report}: fact verify needs a UTF-8 HTML, Markdown or plain-text edition`)
	const reportBytes = readMaterial(report, "edition_missing")
	const artifactSha256 = sha256(reportBytes)
	const projected = projectText(textMaterial(reportBytes, report), format)
	if (!projected.length) throw new FidelityError("edition_empty", `${report}: no reader text found`)
	const bindingBytes = readMaterial(bindings, "bindings_missing")
	const rows = parseBindings(bindingBytes, bindings)
	const sources = loadSources(sessionDir, new Set(rows.map((row) => row.source)))
	const sites = new Map()
	for (const block of projected) {
		const mentions = reportMentions(block)
		for (const { kind, value, needsUnit } of mentions.sites) {
			const site = { kind, value, block: block.text }
			const key = siteKey(site)
			const current = sites.get(key)
			if (current) current.count++
			else sites.set(key, { ...site, count: 1, cites: mentions.cites, checked: false, needsUnit })
		}
	}
	const problems = []
	for (const row of rows) {
		const site = sites.get(siteKey(row))
		const defect = (code, message) => problems.push({ code, message, ...row })
		if (!site || site.count !== 1 || site.checked) {
			defect("binding_not_unique", "Binding must select one complete report occurrence; split repeated values into distinct blocks.")
			continue
		}
		site.checked = true
		if (site.needsUnit) {
			defect("table_unit_missing", "Put the unit or quantity label beside the value; the verifier cannot inherit it from a table header.")
			continue
		}
		if (!site.cites.has(row.source)) {
			defect("binding_citation_missing", "The report block must cite the same source ID as the binding.")
			continue
		}
		if (site.cites.size > 1) {
			defect("binding_citation_ambiguous", "Split factual blocks by source so each displayed citation identifies the source of its values and quotes.")
			continue
		}
		const source = sources.get(row.source)
		if (artifactSha256 === source.meta.sha256) {
			defect("edition_self_citation", "Retain the independent source, not a copy of the edition being checked.")
			continue
		}
		const code = sourceSupports(row, source)
		if (code) defect(code, code === "source_excerpt_not_unique"
			? "The excerpt must occur exactly once in the retained source's text."
			: "The source excerpt must contain the same complete value (including unit and scale), or the same verbatim quote.")
	}
	for (const { kind, value, block, checked } of sites.values()) {
		if (!checked) problems.push({ code: kind === "quote" ? "unbound_quote" : "unbound_number", message: "Add a source binding for this report occurrence.", kind, value, block })
	}
	const snapshotPins = [...sources.values()].map(({ meta }) => meta)
	return {
		problems,
		receipt: {
			version: 1, kind: "source", report, format, artifactSha256,
			bindings, bindingsSha256: sha256(bindingBytes), snapshots: snapshotPins, facts: rows.length,
		},
	}
}
