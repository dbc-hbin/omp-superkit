// SPDX-License-Identifier: MIT

import { buildFileOperationsTuning } from "./file-operations.js";
import { buildDynamicSystemPrompt } from "./shared-prompt.js";

function buildGpt54Tuning(toolNames) {
  return `Organize multi-step work into explicit ordered steps with dependencies. When the request specifies a response shape, follow its fields and ordering without extra text.

Match reasoning depth to the problem: use a short pass for classification, extraction, and formatting, and reason more deeply for multi-constraint optimization, subtle bugs, and novel architecture decisions.

Before a multi-tool step, decide which results are independent and which calls require earlier results. Keep tool setup out of the reported result unless it affects the evidence.

${buildFileOperationsTuning({ toolNames })}`;
}
export function buildGpt54Prompt(options) {
  return buildDynamicSystemPrompt({
    ...options,
    tuningSection: buildGpt54Tuning(options.selectedTools)
  });
}
