#!/usr/bin/env node
// report-tools.mjs - the SUPER Research deliverable CLI. Invoked as
//   node "$SKILL_DIR/scripts/report-tools.mjs" <command> ...
// Exit codes: 0 pass, 1 semantic failure (blockers, a failed verify, a blocked repair), 2 usage or IO.

import { isCliEntry } from "../../super/scripts/entry-guard.mjs"
import { CliError, emit, exitCodeFor } from "./cli-support.mjs"
import { runFact, runSource } from "./fidelity-commands.mjs"
import { FidelityError } from "./fidelity-sources.mjs"
import { runCheck, runFormatExtract, runLayoutProbe, runOutcome, runRepairDecide } from "./report-tools-commands.mjs"

export const COMMANDS = Object.freeze([
	"check",
	"layout-probe",
	"repair decide",
	"source snapshot",
	"fact verify",
	"fact derivative",
	"outcome init",
	"outcome set",
	"outcome gate",
	"outcome render",
	"outcome state",
	"outcome verify",
	"outcome finish",
	"outcome briefing",
	"format-extract",
])

export async function run(argv) {
	const [command, ...rest] = argv
	switch (command) {
		case "check":
			return runCheck(rest)
		case "layout-probe":
			return runLayoutProbe(rest)
		case "repair":
			if (rest[0] !== "decide") throw new CliError("usage: repair decide --state <file> --defects <json>")
			return runRepairDecide(rest.slice(1))
		case "source":
			return runSource(rest)
		case "fact":
			return runFact(rest)
		case "outcome":
			return runOutcome(rest)
		case "format-extract":
			return runFormatExtract(rest)
		case "--help":
		case "help":
			if (rest.includes("--json")) return { json: { commands: COMMANDS }, exitCode: 0 }
			return { text: `report-tools <command>\n${COMMANDS.map((name) => `  ${name}`).join("\n")}`, exitCode: 0 }
		default:
			throw new CliError(`usage: report-tools <${COMMANDS.join(" | ")}> (run --help)`)
	}
}

export async function main(argv = process.argv.slice(2)) {
	try {
		const result = await run(argv)
		emit(result)
		return exitCodeFor(result)
	} catch (error) {
		if (error instanceof FidelityError) {
			emit({ json: { ok: false, problems: [{ code: error.code, message: error.message }] }, summary: `report-tools: ${error.message}` })
			return 1
		}
		process.stderr.write(`report-tools: ${error.message}\n`)
		return exitCodeFor(error)
	}
}

if (isCliEntry(import.meta.url)) {
	process.exitCode = await main()
}
