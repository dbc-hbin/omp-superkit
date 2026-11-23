// SPDX-License-Identifier: MIT

import { buildClaudeSystemPrompt } from "./claude-shared.js";

export function buildClaudeOpus5Prompt(options) {
  return buildClaudeSystemPrompt({
    ...options,
    work: "Read widely while context is thin, then make one reasonable plan and act. Revisit it only when evidence changes a decision. Do not re-litigate choices already made; when a choice is still open, give a recommendation.",
    style: "Keep replies focused and concise. Put the words into the main answer, keep caveats short, and use lists or headers only when they help. Fix slips without announcing them unless they would change the reader's code, conclusions, or decisions.",
  });
}
