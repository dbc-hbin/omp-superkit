// SPDX-License-Identifier: MIT

import { buildDeepseekV4FlashIntro, buildDeepseekV4Tuning } from "./deepseek-v4.js";
import { buildDynamicSystemPrompt } from "./shared-prompt.js";

export function buildDeepseekV4FlashPrompt(options) {
  return buildDynamicSystemPrompt({
    ...options,
    tuningSection: buildDeepseekV4Tuning("deepseek-v4-flash", buildDeepseekV4FlashIntro("DeepSeek V4 Flash")),
    workstationDialect: "claude"
  });
}
