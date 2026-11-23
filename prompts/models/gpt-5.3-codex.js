// SPDX-License-Identifier: MIT

import { buildFileOperationsTuning } from "./file-operations.js";
import { buildDynamicSystemPrompt } from "./shared-prompt.js";

function buildGpt53CodexTuning(toolNames) {
  return `Bias hard toward action within the request. For an authorized change, resolve routine gaps with reasonable assumptions and implement directly. Once any required opening is given, take the first useful step without a separate plan announcement unless the user asked for a plan.

Do not re-state the goal between steps. Move to the next milestone without repeating evidence already reported.

After automatic compaction, continue from the current state rather than re-deriving prior conclusions. Recover a compacted detail only if the next decision needs it.

${buildFileOperationsTuning({ toolNames })}`;
}
export function buildGpt53CodexPrompt(options) {
  return buildDynamicSystemPrompt({
    ...options,
    tuningSection: buildGpt53CodexTuning(options.selectedTools),
    workstationDialect: "codex"
  });
}
