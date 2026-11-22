// Local model templates retain text adapted from Senpi (MIT; see LICENSE).
// Source: https://github.com/code-yeongyu/senpi/tree/8f7ecd5b37a6bd29ec973ed77ee96221e72dda9b

import { buildClaudeFable5Prompt } from "./claude-fable-5.js";
import { buildClaudeFable51Prompt } from "./claude-fable-5-1.js";
import { buildClaudeFable52Prompt } from "./claude-fable-5-2.js";
import { buildClaudeHaiku55Prompt } from "./claude-haiku-5-5.js";
import { buildClaudeOpus45Prompt } from "./claude-opus-4-5.js";
import { buildClaudeOpus46Prompt } from "./claude-opus-4-6.js";
import { buildClaudeOpus47Prompt } from "./claude-opus-4-7.js";
import { buildClaudeOpus48Prompt } from "./claude-opus-4-8.js";
import { buildClaudeOpus5Prompt } from "./claude-opus-5.js";
import { buildClaudeOpus55Prompt } from "./claude-opus-5-5.js";
import { buildClaudeSonnet55Prompt } from "./claude-sonnet-5-5.js";
import { buildDeepseekV41FlashPrompt } from "./deepseek-v4-1-flash.js";
import { buildDeepseekV4FlashPrompt } from "./deepseek-v4-flash.js";
import { buildDeepseekV4Flash0731Prompt } from "./deepseek-v4-flash-0731.js";
import { buildDeepseekV4ProPrompt } from "./deepseek-v4-pro.js";
import { buildGlm52Prompt } from "./glm-5-2.js";
import { buildGlm53Prompt } from "./glm-5-3.js";
import { buildGpt5Prompt } from "./gpt-5.js";
import { buildGpt52Prompt } from "./gpt-5.2.js";
import { buildGpt53CodexPrompt } from "./gpt-5.3-codex.js";
import { buildGpt54Prompt } from "./gpt-5.4.js";
import { buildGpt55Prompt } from "./gpt-5.5.js";
import { buildGpt56Prompt } from "./gpt-5.6.js";
import { GPT6_ASTRA_RULES, buildGpt6AstraPrompt } from "./gpt-6-astra.js";
import { buildGrok45Prompt } from "./grok-4.5.js";
import { buildGrok46Prompt } from "./grok-4.6.js";
import { buildGrok47Prompt } from "./grok-4.7.js";
import { buildKimiK26Prompt } from "./kimi-k2-6.js";
import { buildKimiK27Prompt } from "./kimi-k2-7.js";
import { buildKimiK28Prompt } from "./kimi-k2-8.js";
import { buildKimiK3Prompt } from "./kimi-k3.js";
import { buildKimiK31Prompt } from "./kimi-k3-1.js";
import { presetSharedSections, resolvePresetName } from "./model-routing.js";

const builders = new Map([
  ["claude-fable-5", buildClaudeFable5Prompt],
  ["claude-fable-5-1", buildClaudeFable51Prompt],
  ["claude-fable-5-2", buildClaudeFable52Prompt],
  ["claude-opus-5-5", buildClaudeOpus55Prompt],
  ["claude-opus-5", buildClaudeOpus5Prompt],
  ["claude-sonnet-5-5", buildClaudeSonnet55Prompt],
  ["claude-haiku-5-5", buildClaudeHaiku55Prompt],
  ["claude-opus-4-8", buildClaudeOpus48Prompt],
  ["claude-opus-4-7", buildClaudeOpus47Prompt],
  ["claude-opus-4-6", buildClaudeOpus46Prompt],
  ["claude-opus-4-5", buildClaudeOpus45Prompt],
  ["deepseek-v4-flash", buildDeepseekV4FlashPrompt],
  ["deepseek-v4-flash-0731", buildDeepseekV4Flash0731Prompt],
  ["deepseek-v4-1-flash", buildDeepseekV41FlashPrompt],
  ["deepseek-v4-pro", buildDeepseekV4ProPrompt],
  ["glm-5.2", buildGlm52Prompt],
  ["glm-5.3", buildGlm53Prompt],
  ["grok-4.5", buildGrok45Prompt],
  ["grok-4.6", buildGrok46Prompt],
  ["grok-4.7", buildGrok47Prompt],
  ["kimi-k3-1", buildKimiK31Prompt],
  ["kimi-k3", buildKimiK3Prompt],
  ["kimi-k2-8", buildKimiK28Prompt],
  ["kimi-k2-7", buildKimiK27Prompt],
  ["kimi-k2-6", buildKimiK26Prompt],
  ["gpt-5", buildGpt5Prompt],
  ["gpt-5.2", buildGpt52Prompt],
  ["gpt-5.3-codex", buildGpt53CodexPrompt],
  ["gpt-5.4", buildGpt54Prompt],
  ["gpt-5.5", buildGpt55Prompt],
  ["gpt-5.6", buildGpt56Prompt],
  ["gpt-6-astra", buildGpt6AstraPrompt],
]);

export const presetNames = [...builders.keys(), "gpt-6.2"];

const rules = new Map(GPT6_ASTRA_RULES.map(rule => [rule.id, rule.directive]));
export const ASYNC_DEFAULT = rules.get("async-default");
export const TURN_END_IS_WAIT = rules.get("turn-end-is-wait");
export const MONITOR_CONDITIONS = rules.get("monitor-conditions");
export { resolvePresetName };

export function buildPreset(name, options) {
  const build = builders.get(name);
  if (!build) return undefined;
  return { name, prompt: build({ ...options, sharedSections: presetSharedSections(name) }) };
}
