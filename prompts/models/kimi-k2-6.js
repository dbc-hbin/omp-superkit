// SPDX-License-Identifier: MIT

import { buildExecutionToolingSection } from "./execution-tooling.js";
import { buildDynamicSystemPrompt } from "./shared-prompt.js";

function buildKimiK26Tuning({ surface = "terminal", subagent }) {
  return `You are running on Kimi K2.6. Avoid restating the request, do not re-derive facts you already established this turn, and skip filler verification language ("let me confirm again", "to be sure", "just to double-check").${subagent ? "" : `

${surface === "terminal" ? "The intent gate routing line is required every turn. " : ""}On confirmation turns where the user already chose an option in plain words, acknowledge that choice and execute, not re-litigate alternatives the user already eliminated.`}`;
}
export function buildKimiK26Prompt(options) {
  return buildDynamicSystemPrompt({
    ...options,
    tuningSection: [
      buildExecutionToolingSection({ toolNames: options.selectedTools, dialect: "kimi", subagent: options.subagent }),
      buildKimiK26Tuning(options)
    ].filter((section) => section.length > 0).join(`

`),
    workstationDialect: "kimi"
  });
}
