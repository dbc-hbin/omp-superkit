// SPDX-License-Identifier: MIT

import { buildDeepseekV4Tuning } from "./deepseek-v4.js";
import { buildDynamicSystemPrompt } from "./shared-prompt.js";

const PRO_INTRO = "You are running on DeepSeek V4 Pro - a deep reasoner with a decisive finish. Reasoning depth is a budget spent on the problem, not a ritual: routine classification, file edits, and lookups are decided directly, while hard design and debugging work gets the full depth.";
export function buildDeepseekV4ProPrompt(options) {
  return buildDynamicSystemPrompt({
    ...options,
    tuningSection: buildDeepseekV4Tuning("deepseek-v4-pro", PRO_INTRO, options)
  });
}
