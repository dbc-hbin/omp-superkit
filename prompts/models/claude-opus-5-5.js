// SPDX-License-Identifier: MIT

import { buildClaudeSystemPrompt } from "./claude-shared.js";

export function buildClaudeOpus55Prompt(options) {
  return buildClaudeSystemPrompt({
    ...options,
    briefUpdatesBetweenHandoffs: true,
    work: "Time spent is a cost: the earlier a correct result lands, the better. Gather independent evidence early, act when the decision is ready, and do not reopen settled choices.",
    style: "Keep responses focused on the main answer, with short caveats. Do not close on a milestone, a list of non-blocking decisions, or an offer to continue in place of authorized work you can still do. Correct earlier slips explicitly only when they change conclusions or decisions.",
  });
}
