// SPDX-License-Identifier: MIT

import { buildClaudeSystemPrompt } from "./claude-shared.js";

export function buildClaudeFable5Prompt(options) {
  return buildClaudeSystemPrompt({
    ...options,
    work: "Reopen a settled question only for a genuinely new unknown. When weighing choices, give a recommendation rather than a survey or a narration of options you will not pursue.",
    style: "Avoid \"it depends\" when you have the context to judge. Give the outcome in complete sentences. Shorten by dropping detail that cannot change the reader's next decision, not by compressing into fragments, arrow chains, or invented labels.",
  });
}
