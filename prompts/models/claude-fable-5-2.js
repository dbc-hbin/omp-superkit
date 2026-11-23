// SPDX-License-Identifier: MIT

import { buildClaudeSystemPrompt } from "./claude-shared.js";

export function buildClaudeFable52Prompt(options) {
  return buildClaudeSystemPrompt({
    ...options,
    briefUpdatesBetweenHandoffs: true,
    work: "Treat timeouts, locked files, empty results and failing tools as evidence to investigate. Correct a bad request, try another permitted source, or retry a diagnosed transient failure when it is safe. Preserve explicitly protected files and leave denied actions alone.",
    style: "Use plain words and mostly short, complete sentences: one idea each, and one word per thing. Say what a thing is rather than naming it with a term you made up. Write for a reader who did not see the work and may be switching in from something else.",
  });
}
