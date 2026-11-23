#!/usr/bin/env node
import { isCliEntry } from "../../super/scripts/entry-guard.mjs";
import { runCli } from "../../super-loop/scripts/verify-state.mjs";

export * from "../../super-loop/scripts/verify-state.mjs";

if (isCliEntry(import.meta.url)) runCli();
