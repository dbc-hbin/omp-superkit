// SPDX-License-Identifier: MIT

import { buildExecutionToolingSection } from "./execution-tooling.js";
import { buildDynamicSystemPrompt } from "./shared-prompt.js";

const GLM5_TUNING = "Prefer a cheap, permitted lookup to prolonged speculation. Work in short steps and inspect the evidence before building on it.";
export function buildGlm5Prompt(options) {
  return buildDynamicSystemPrompt({
    ...options,
    tuningSection: [
      buildExecutionToolingSection({ toolNames: options.selectedTools, dialect: "claude", subagent: options.subagent }),
      GLM5_TUNING
    ].filter((section) => section.length > 0).join(`

`),
    workstationDialect: "claude"
  });
}
