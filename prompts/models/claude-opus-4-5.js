// SPDX-License-Identifier: MIT

import { buildExecutionToolingSection } from "./execution-tooling.js";
import { buildDynamicSystemPrompt } from "./shared-prompt.js";

function buildClaudeOpus45Tuning() {
  return `Break complex tasks into ordered steps with clear dependencies before executing. When a request covers a set of items, apply it to every item rather than only the first, and state the scope you applied.`;
}
export function buildClaudeOpus45Prompt(options) {
  return buildDynamicSystemPrompt({
    ...options,
    tuningSection: [
      buildExecutionToolingSection({
        toolNames: options.selectedTools,
        dialect: "claude",
        sharedSections: options.sharedSections
      }),
      buildClaudeOpus45Tuning()
    ].filter((section) => section.length > 0).join(`

`),
    workstationDialect: "claude"
  });
}
