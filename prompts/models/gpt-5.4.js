// SPDX-License-Identifier: MIT

import { buildFileOperationsTuning } from "./file-operations.js";
import { buildGptEvalRoutingTuning } from "./gpt-eval-routing.js";
import { buildDynamicSystemPrompt } from "./shared-prompt.js";

function buildGpt54Tuning(toolNames) {
  return `Use explicit section structure and step sequences for multi-step tasks: ordered steps with dependencies. When a specific response shape is needed, declare exact fields and order upfront, no extra text.

Default to medium reasoning effort. Escalate to high only for multi-constraint optimization, subtle bugs, or novel architecture decisions. Use low for classification, extraction, formatting.

State when each tool should and should not be called. Specify parallel vs sequential tool use.

${buildGptEvalRoutingTuning()}

${buildFileOperationsTuning({ toolNames })}`;
}
export function buildGpt54Prompt(options) {
  return buildDynamicSystemPrompt({
    ...options,
    tuningSection: buildGpt54Tuning(options.selectedTools),
    workstationDialect: "codex"
  });
}
