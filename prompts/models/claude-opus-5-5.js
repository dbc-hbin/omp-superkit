// SPDX-License-Identifier: MIT

import { buildClaudeSystemPrompt } from "./claude-shared.js";

export function buildClaudeOpus55Prompt(options) {
  return buildClaudeSystemPrompt({
    ...options,
    briefUpdatesBetweenHandoffs: true,
    work: "Keep the user's purpose in view. When the evidence is thin, look beyond the first plausible reading: what does this result mean for the user, or what assumption does this example call into question? Follow that lead if it could change your judgment. Once the evidence is clear, make the call and move on.",
    style: "Keep responses focused on the main answer, with short caveats. Do not close on a milestone, a list of non-blocking decisions, or an offer to continue in place of authorized work you can still do. Correct earlier slips explicitly only when they change conclusions or decisions.",
  });
}
