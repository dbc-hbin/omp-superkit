// Artifact-bound verification at delivery. Replay instead of trusting a pass label.
import { mkdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"
import { isDeepStrictEqual } from "node:util"

import { writeJsonAtomic } from "./cli-support.mjs"
import { inspectEdition } from "./fidelity-check.mjs"
import { FidelityError, parseMaterial, readMaterial, sha256, textMaterial } from "./fidelity-sources.mjs"
import { textFormat } from "./fidelity-text.mjs"

const RECEIPTS_DIR = "fidelity-receipts"

const receiptPath = (sessionDir, report) => join(sessionDir, RECEIPTS_DIR, `${sha256(report)}.json`)

export function saveReceipt(sessionDir, receipt) {
	mkdirSync(join(sessionDir, RECEIPTS_DIR), { recursive: true })
	const path = receiptPath(sessionDir, receipt.report)
	writeJsonAtomic(path, receipt)
	return path
}

function readReceipt(sessionDir, report) {
	const file = receiptPath(sessionDir, report)
	const bytes = readMaterial(file, "fidelity_receipt_missing")
	const receipt = parseMaterial(bytes, file, "fidelity_receipt_invalid")
	if (receipt?.version !== 1 || receipt.report !== report || !["source", "derivative"].includes(receipt.kind)
		|| typeof receipt.artifactSha256 !== "string" || !/^[\da-f]{64}$/u.test(receipt.artifactSha256)) {
		throw new FidelityError("fidelity_receipt_invalid", `invalid edition receipt: ${file}`)
	}
	return { receipt, hash: sha256(bytes) }
}

function assertArtifact(receipt) {
	if (sha256(readMaterial(receipt.report, "edition_missing")) !== receipt.artifactSha256) {
		throw new FidelityError("artifact_changed", `checked artifact bytes changed: ${receipt.report}`)
	}
}

function loadSourceReceipt(sessionDir, report) {
	const { receipt, hash } = readReceipt(sessionDir, report)
	if (receipt.kind !== "source" || typeof receipt.bindings !== "string" || !textFormat(report)) {
		throw new FidelityError("fidelity_receipt_invalid", `expected source-edition receipt: ${report}`)
	}
	assertArtifact(receipt)
	if (sha256(readMaterial(receipt.bindings, "bindings_missing")) !== receipt.bindingsSha256) {
		throw new FidelityError("bindings_changed", `checked bindings changed: ${receipt.bindings}`)
	}
	const replay = inspectEdition(sessionDir, receipt)
	if (replay.problems.length) {
		throw new FidelityError("fidelity_replay_failed", `${report}: ${replay.problems[0].code}: ${replay.problems[0].message}`)
	}
	if (!isDeepStrictEqual(replay.receipt, receipt)) {
		throw new FidelityError("fidelity_receipt_changed", `source pins or edition receipt changed: ${report}`)
	}
	return { receipt, hash }
}

export function inspectDerivative(sessionDir, { report, from, inspection }) {
	if (!Object.values(DERIVATIVE_EXTENSIONS).flat().includes(extname(report).toLowerCase())) {
		throw new FidelityError("derivative_format", "A derivative must be PDF, DOCX, TeX or a slide deck. Use fact verify for HTML/Markdown/text.")
	}
	if (report === from || report === inspection || from === inspection) {
		throw new FidelityError("derivative_format", "A derivative, its source edition, and review notes must be distinct files.")
	}
	const { hash } = loadSourceReceipt(sessionDir, from)
	const inspectionBytes = readMaterial(inspection, "inspection_missing")
	if (!textMaterial(inspectionBytes, inspection).trim()) {
		throw new FidelityError("inspection_missing", `provide the actual rendered-output review notes: ${inspection}`)
	}
	return {
		version: 1, kind: "derivative", report, artifactSha256: sha256(readMaterial(report, "edition_missing")),
		from, sourceReceiptSha256: hash, inspection, inspectionSha256: sha256(inspectionBytes),
	}
}

const DERIVATIVE_EXTENSIONS = {
	pdf: [".pdf"],
	docx: [".docx"],
	latex: [".tex"],
	slides: [".pdf", ".pptx", ".odp", ".key"],
}

function deliveryMode(row) {
	const text = textFormat(row.path)
	const extension = extname(row.path).toLowerCase()
	if (text === row.format || (row.format === "post" && text) || (row.format === "slides" && ["html", "md"].includes(text))) {
		return "source"
	}
	if (DERIVATIVE_EXTENSIONS[row.format]?.includes(extension)) return "derivative"
	throw new FidelityError("edition_format", `${row.format} is not a supported edition format for ${row.path}`)
}

function checkDelivered(sessionDir, row) {
	const report = resolve(row.path)
	if (deliveryMode(row) === "source") {
		const { receipt } = loadSourceReceipt(sessionDir, report)
		return { format: row.format, path: report, fidelity: "verified_source_text", facts: receipt.facts }
	}
	const { receipt } = readReceipt(sessionDir, report)
	if (receipt.kind !== "derivative" || typeof receipt.from !== "string" || typeof receipt.inspection !== "string") {
		throw new FidelityError("fidelity_receipt_invalid", `expected an inspection-linked derivative receipt: ${report}`)
	}
	assertArtifact(receipt)
	if (!isDeepStrictEqual(inspectDerivative(sessionDir, receipt), receipt)) {
		throw new FidelityError("derivative_receipt_changed", `source receipt, review notes or derivative bytes changed: ${report}`)
	}
	return { format: row.format, path: report, fidelity: "attested_derivative", from: receipt.from, inspection: receipt.inspection }
}

export function verifyFidelity(sessionDir, manifest) {
	const editions = []
	const problems = []
	for (const row of manifest.deliverables) {
		if (row.status !== "delivered" || !row.path) continue
		try {
			editions.push(checkDelivered(sessionDir, row))
		} catch (error) {
			if (!(error instanceof FidelityError)) throw error
			problems.push({ format: row.format, path: row.path, code: error.code, message: error.message })
		}
	}
	return { editions, problems }
}
