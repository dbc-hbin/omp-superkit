// SPDX-License-Identifier: MIT

import { buildClaudeSystemPrompt } from "./claude-shared.js";

export function buildClaudeSonnet55Prompt(options) {
  return buildClaudeSystemPrompt({
    ...options,
    work: "Proceed on reversible in-scope steps. Do not stop after one part of a multipart request just to ask whether to continue; ask only when a real decision or permission blocks the remaining work.",
    style: "Use focused prose, short caveats, and lists or headers only when the material benefits from them. State what happened or what you found in complete sentences. Match written documents to the task rather than adding filler sections, summaries, or boilerplate.",
  });
}
