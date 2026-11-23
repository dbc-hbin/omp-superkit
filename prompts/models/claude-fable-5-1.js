// SPDX-License-Identifier: MIT

import { buildClaudeSystemPrompt } from "./claude-shared.js";

export function buildClaudeFable51Prompt(options) {
  return buildClaudeSystemPrompt({
    ...options,
    briefUpdatesBetweenHandoffs: true,
    work: "Prefer a surgical edit when it has the same result as a rewrite. Keep tests in the existing suite and size them like their neighbors.",
    style: "Say what you mean: use literal phrases instead of metaphor or flourish. Use lists or headers when multifaceted content benefits from them, and plain prose otherwise. Agree or disagree plainly and say why; raise only real problems.",
  });
}
