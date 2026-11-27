// SPDX-License-Identifier: MIT

import { buildExecutionToolingSection } from "./execution-tooling.js";
import { buildDynamicSystemPrompt } from "./shared-prompt.js";

function buildKimiK2CodeTuning(modelName, { surface = "terminal", subagent }) {
  const confirmation = subagent ? "" : `${surface === "terminal" ? "The intent gate routing line is required every turn. " : ""}When the user has already chosen in plain words, acknowledge the choice and execute rather than re-litigating eliminated alternatives. `;
  return `You are running on ${modelName} - restrained and outcome-first. Read the ${subagent ? "assignment" : "request"} for its outcome, decide one path, and act; reopen a settled choice only when new evidence or instructions contradict it. Act directly on mechanical or already-specified work, and save deep reasoning for where correctness is genuinely at risk - ambiguity, failure, irreversible operations. ${subagent ? "Claim only what your assigned checks establish." : "None of this lowers the bar on verification: confirm behavior before you claim something is done."}

${confirmation}Write lean - do not re-derive what you already established this turn.`;
}
export function buildKimiK2CodePrompt(options, modelName) {
  return buildDynamicSystemPrompt({
    ...options,
    tuningSection: [
      buildExecutionToolingSection({ toolNames: options.selectedTools, dialect: "kimi", subagent: options.subagent }),
      buildKimiK2CodeTuning(modelName, options)
    ].filter((section) => section.length > 0).join(`

`)
  });
}
