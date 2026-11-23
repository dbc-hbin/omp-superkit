#!/usr/bin/env node
import { isCliEntry } from "../../super/scripts/entry-guard.mjs";
import { runCli } from "../../super-plan/scripts/scaffold-plan.mjs";

export * from "../../super-plan/scripts/scaffold-plan.mjs";
export { isSuperPlanArtifact as isUlwArtifact } from "../../super-plan/scripts/scaffold-plan.mjs";

if (isCliEntry(import.meta.url)) await runCli();
