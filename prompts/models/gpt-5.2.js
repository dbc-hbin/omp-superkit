// SPDX-License-Identifier: MIT

import { buildFileOperationsTuning } from "./file-operations.js";
import { buildDynamicSystemPrompt } from "./shared-prompt.js";

function buildGpt52Tuning(toolNames) {
  return `Set a concise response budget appropriate to the deliverable, such as 3-6 sentences or at most 5 bullets for a simple answer. Omit filler, not required content.

Set an initial retrieval budget, such as one broad search wave. Extend it only when a required fact is still missing.

Deliver exactly what was requested. No extra features or scope drift.

When the host compacts context, continue from the next unfinished milestone. Recover prior details only when the remaining work depends on them.

${buildFileOperationsTuning({ toolNames })}`;
}
export function buildGpt52Prompt(options) {
  return buildDynamicSystemPrompt({
    ...options,
    tuningSection: buildGpt52Tuning(options.selectedTools)
  });
}
