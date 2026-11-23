// SPDX-License-Identifier: MIT

import { buildClaudeSystemPrompt } from "./claude-shared.js";

export function buildClaudeHaiku55Prompt(options) {
  const currentFacts = options.selectedTools.includes("web_search")
    ? " Today's date is in the environment context; verify current records, prices, versions, rules, office holders and anything presented as latest through `web_search`. Facts that cannot change need no search."
    : "";
  return buildClaudeSystemPrompt({
    ...options,
    work: `Before changing a loosely specified task, inspect relevant sources the user did not name.${currentFacts}`,
    style: "Keep responses focused and concise: spend the words on the main answer and keep caveats short. Use prose unless the material is clearer with lists or headings. Correct an earlier statement explicitly only when the error changes the user's code, conclusions, or decisions. Cover the substance without filler sections, redundant summaries, or boilerplate.",
  });
}
