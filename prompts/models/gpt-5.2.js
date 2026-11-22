// SPDX-License-Identifier: MIT

import { buildFileOperationsTuning } from "./file-operations.js";
import { buildGptEvalRoutingTuning } from "./gpt-eval-routing.js";
import { buildDynamicSystemPrompt } from "./shared-prompt.js";

function buildGpt52Tuning(toolNames) {
  return `Constrain verbosity explicitly: "3-6 sentences", "max 5 bullets", "no preamble". Do not over-explain simple tasks.

Optimize tool usage with explicit budgets: "maximum 3 tool calls for this lookup" or "one broad search first, only search again if the core question remains unanswered."

Implement EXACTLY and ONLY what was requested. No extra features, no scope drift.

Compact after major milestones, not every turn. Keep the system prompt functionally identical when resuming.

${buildGptEvalRoutingTuning()}

${buildFileOperationsTuning({ toolNames })}`;
}
export function buildGpt52Prompt(options) {
  return buildDynamicSystemPrompt({
    ...options,
    tuningSection: buildGpt52Tuning(options.selectedTools),
    workstationDialect: "codex"
  });
}
