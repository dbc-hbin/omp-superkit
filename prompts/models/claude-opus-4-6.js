// SPDX-License-Identifier: MIT

import { buildExecutionToolingSection } from "./execution-tooling.js";
import { buildDynamicSystemPrompt } from "./shared-prompt.js";

export function buildClaudeOpus46Prompt(options) {
  return buildDynamicSystemPrompt({
    ...options,
    tuningSection: buildExecutionToolingSection({
      toolNames: options.selectedTools,
      dialect: "claude",
      sharedSections: options.sharedSections
    }),
    workstationDialect: "claude"
  });
}
