// CLI adapters for evidence retention, edition verification and derivative attestation.
import { resolve } from "node:path"

import { CliError, parseArgs, sessionDirFrom } from "./cli-support.mjs"
import { inspectEdition } from "./fidelity-check.mjs"
import { sourceIdPattern } from "./fidelity-mentions.mjs"
import { inspectDerivative, saveReceipt } from "./fidelity-receipts.mjs"
import { saveSnapshot, validOrigin } from "./fidelity-sources.mjs"
import { textFormat } from "./fidelity-text.mjs"

export function runSource(argv) {
	const [verb, ...rest] = argv
	const args = parseArgs(rest)
	const [id] = args.positionals
	if (verb !== "snapshot" || args.positionals.length !== 1 || !sourceIdPattern.test(id)) {
		throw new CliError("usage: source snapshot <S-id> --input <saved UTF-8 .html|.md|.txt> --origin <URL or absolute path> --session-dir <dir>")
	}
	const input = resolve(args.required("input"))
	const origin = args.required("origin")
	if (!textFormat(input) || !validOrigin(origin)) throw new CliError("source snapshot requires a supported text input and HTTP(S) URL or absolute path as origin")
	const snapshot = saveSnapshot(sessionDirFrom(args.flags), { id, input, origin })
	return { json: { command: "source snapshot", snapshot }, exitCode: 0 }
}

export function runFact(argv) {
	const [verb, ...rest] = argv
	const args = parseArgs(rest)
	const [path] = args.positionals
	if (!path || args.positionals.length !== 1 || !["verify", "derivative"].includes(verb)) {
		throw new CliError("usage: fact verify <edition> --bindings <json> | fact derivative <artifact> --from <verified edition> --inspection <notes.txt> (both require --session-dir <dir>)")
	}
	const report = resolve(path)
	const sessionDir = sessionDirFrom(args.flags)
	if (verb === "derivative") {
		const receipt = inspectDerivative(sessionDir, { report, from: resolve(args.required("from")), inspection: resolve(args.required("inspection")) })
		return {
			json: { command: "fact derivative", status: "attested_derivative", receipt: saveReceipt(sessionDir, receipt) },
			summary: "fact derivative: recorded inspection; derivative content was not checked by the CLI",
			exitCode: 0,
		}
	}
	const { receipt, problems } = inspectEdition(sessionDir, { report, bindings: resolve(args.required("bindings")) })
	const ok = problems.length === 0
	return {
		json: { command: "fact verify", ok, problems, receipt: ok ? saveReceipt(sessionDir, receipt) : null },
		summary: `fact verify: ${ok ? `${receipt.facts} bound occurrence(s)` : `${problems.length} problem(s)`}`,
		exitCode: ok ? 0 : 1,
	}
}
