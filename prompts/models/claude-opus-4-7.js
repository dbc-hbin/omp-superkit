// SPDX-License-Identifier: MIT

import { buildClaudeSystemPrompt } from "./claude-shared.js";

function buildClaudeOpus47Tuning() {
  return `Apply instructions at the scope the user evidently intends: "every", "all", and "each" mean the full set rather than the first item, and a fix that plainly recurs covers every occurrence. State the scope you applied.

Prefer tool calls over reasoning when a tool can resolve the question directly; do not reason past a fact you can look up.

For frontend design with no specified visual direction, derive one from the project's context or propose distinct options before building; do not fall back to your default cream/serif/terracotta house style or generic AI aesthetics.`;
}
export function buildClaudeOpus47Prompt(options) {
  return buildClaudeSystemPrompt({
    ...options,
    tuningSection: buildClaudeOpus47Tuning(),
  });
}
