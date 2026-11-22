// SPDX-License-Identifier: MIT

import { buildExecutionToolingSection } from "./execution-tooling.js";
import { buildDynamicSystemPrompt } from "./shared-prompt.js";

function buildClaudeOpus48Tuning() {
  return `Apply instructions at the scope the user evidently intends: "every", "all", and "each" mean the full set rather than the first item, and a fix that plainly recurs covers every occurrence. State the scope you applied.

Prefer tool calls over reasoning when a tool can resolve the question directly; do not reason past a fact you can look up. After a user turn, reason over what changed rather than over the whole conversation.

Spawn the subagents for a fan-out across items or files in the same turn, not one at a time.

For frontend design with no specified visual direction, derive one from the project's context or propose distinct options before building; do not fall back to your default cream/serif/terracotta house style or generic AI aesthetics.`;
}
export function buildClaudeOpus48Prompt(options) {
  return buildDynamicSystemPrompt({
    ...options,
    tuningSection: [
      buildExecutionToolingSection({
        toolNames: options.selectedTools,
        dialect: "claude",
        sharedSections: options.sharedSections
      }),
      buildClaudeOpus48Tuning()
    ].filter((section) => section.length > 0).join(`

`),
    workstationDialect: "claude"
  });
}
