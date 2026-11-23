// SPDX-License-Identifier: MIT

import { buildClaudeSystemPrompt } from "./claude-shared.js";

export function buildClaudeOpus45Prompt(options) {
  return buildClaudeSystemPrompt({
    ...options,
    tuningSection: "Break complex tasks into ordered steps with clear dependencies before executing. When a request covers a set of items, apply it to every item rather than only the first, and state the scope you applied.",
  });
}
