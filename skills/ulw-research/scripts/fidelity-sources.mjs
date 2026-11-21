// Retention and provenance for the snapshot that a fact cites.
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { isAbsolute, join } from "node:path"

import { sourceIdPattern } from "./fidelity-mentions.mjs"
import { decodeText, projectText, textFormat } from "./fidelity-text.mjs"

const SNAPSHOTS_DIR = "source-snapshots"
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")
const FILE_LAYOUT = ["raw", "meta.json"]
const ORIGIN_LINE = /^\[(?:S|Source )([1-9]\d*)\]\s+(?:<([^>]+)>|(\S+))/i

export class FidelityError extends Error {
	constructor(code, message) {
		super(message)
		this.name = "FidelityError"
		this.code = code
	}
}

export function readMaterial(path, code) {
	try {
		const bytes = readFileSync(path)
		if (bytes.length) return bytes
		throw new FidelityError(code, `empty file: ${path}`)
	} catch (error) {
		if (error instanceof Error && ["ENOENT", "ENOTDIR", "EISDIR", "EACCES", "EPERM"].includes(error.code)) {
			throw new FidelityError(code, `cannot read ${path}: ${error.code}`)
		}
		throw error
	}
}

export function parseMaterial(bytes, path, code) {
	try {
		return JSON.parse(decodeText(bytes))
	} catch (error) {
		if (!(error instanceof SyntaxError || error instanceof TypeError)) throw error
		throw new FidelityError(code, `invalid UTF-8 JSON: ${path}`)
	}
}

export function textMaterial(bytes, path) {
	try {
		return decodeText(bytes)
	} catch (error) {
		if (!(error instanceof TypeError)) throw error
		throw new FidelityError("invalid_text", `not UTF-8 text: ${path}`)
	}
}

export function validOrigin(origin) {
	return typeof origin === "string" && origin.trim() === origin && !/[\r\n<>]/u.test(origin)
		&& (isAbsolute(origin) || (/^https?:\/\//iu.test(origin) && !/\s/u.test(origin) && URL.canParse(origin)))
}

function loadSnapshot(dir, id) {
	const [rawPath, metaPath] = FILE_LAYOUT.map((name) => join(dir, name))
	const bytes = readMaterial(rawPath, "snapshot_missing")
	const meta = parseMaterial(readMaterial(metaPath, "snapshot_missing"), metaPath, "snapshot_changed")
	if (meta?.version !== 1 || meta.source !== id || !validOrigin(meta.origin)
		|| !["html", "md", "text"].includes(meta.format) || typeof meta.retainedAt !== "string"
		|| !Number.isFinite(Date.parse(meta.retainedAt)) || meta.sha256 !== sha256(bytes)) {
		throw new FidelityError("snapshot_changed", `${id}: snapshot metadata or retained bytes no longer match`)
	}
	return { meta, blocks: projectText(textMaterial(bytes, rawPath), meta.format) }
}

export function saveSnapshot(sessionDir, { id, input, origin }) {
	const format = textFormat(input)
	const bytes = readMaterial(input, "source_input_missing")
	if (!projectText(textMaterial(bytes, input), format).length) {
		throw new FidelityError("source_empty", `${id}: no text was projected from ${input}`)
	}
	const root = join(sessionDir, SNAPSHOTS_DIR)
	const dir = join(root, id)
	const hash = sha256(bytes)
	if (existsSync(dir)) {
		const { meta } = loadSnapshot(dir, id)
		if (meta.sha256 !== hash || meta.origin !== origin || meta.format !== format) {
			throw new FidelityError("snapshot_exists", `${id}: retain a changed source under a new source ID`)
		}
		return meta
	}
	mkdirSync(root, { recursive: true })
	mkdirSync(dir)
	const meta = { version: 1, source: id, origin, format, sha256: hash, retainedAt: new Date().toISOString() }
	writeFileSync(join(dir, FILE_LAYOUT[0]), bytes, { flag: "wx" })
	writeFileSync(join(dir, FILE_LAYOUT[1]), `${JSON.stringify(meta, null, 2)}\n`, { flag: "wx" })
	return meta
}

export function loadSources(sessionDir, ids) {
	const sources = new Map()
	if (!ids.size) return sources
	const ledgerPath = join(sessionDir, "sources-ledger.md")
	const ledger = textMaterial(readMaterial(ledgerPath, "source_ledger_missing"), ledgerPath)
	const origins = new Map()
	for (const line of ledger.split(/\r?\n/u)) {
		const match = ORIGIN_LINE.exec(line)
		if (!match) continue
		const id = `S${match[1]}`
		if (ids.has(id)) origins.set(id, origins.has(id) ? null : match[2] ?? match[3])
	}
	for (const id of ids) {
		if (!sourceIdPattern.test(id)) throw new FidelityError("bindings_invalid", `invalid source ID: ${id}`)
		const { meta, blocks } = loadSnapshot(join(sessionDir, SNAPSHOTS_DIR, id), id)
		if (origins.get(id) !== meta.origin) {
			throw new FidelityError("source_attribution", `${id}: sources-ledger.md must name its pinned origin exactly once (${meta.origin})`)
		}
		sources.set(id, { meta, blocks })
	}
	return sources
}
