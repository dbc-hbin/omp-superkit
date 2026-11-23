#!/usr/bin/env node
import { isCliEntry } from "../../super/scripts/entry-guard.mjs";
import { main } from "../../super-research/scripts/report-tools.mjs";

export * from "../../super-research/scripts/report-tools.mjs";

if (isCliEntry(import.meta.url)) process.exitCode = await main();
