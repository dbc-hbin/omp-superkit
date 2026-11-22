// SPDX-License-Identifier: MIT

import {
  extractClaudeOpusVersion,
  extractGpt5Version,
  isClaudeFable51Model,
  isClaudeFable52Model,
  isClaudeFable5Model,
  isClaudeHaiku55Model,
  isClaudeOpus55Model,
  isClaudeOpus5Model,
  isClaudeSonnet55Model,
  isDeepseekV41FlashModel,
  isDeepseekV4Flash0731Model,
  isDeepseekV4FlashModel,
  isDeepseekV4ProModel,
  isGlm52Model,
  isGlm53Model,
  isGpt62Model,
  isGpt6FamilyModel,
  isGrok45Model,
  isGrok46Model,
  isGrok47Model,
  isKimiK26Model,
  isKimiK27Model,
  isKimiK28Model,
  isKimiK31Model,
  isKimiK3Model,
  isSWE2Model,
} from "./model-matchers.js";

export function resolvePresetName(model) {
  if (isGpt62Model(model)) {
    return "gpt-6.2";
  }
  if (isGpt6FamilyModel(model)) {
    return "gpt-6-astra";
  }
  const gpt5Version = extractGpt5Version(model.id);
  if (gpt5Version) {
    return gpt5Version;
  }
  if (isKimiK31Model(model)) {
    return "kimi-k3-1";
  }
  if (isSWE2Model(model) || isKimiK3Model(model)) {
    return "kimi-k3";
  }
  if (isKimiK28Model(model)) {
    return "kimi-k2-8";
  }
  if (isKimiK27Model(model)) {
    return "kimi-k2-7";
  }
  if (isKimiK26Model(model)) {
    return "kimi-k2-6";
  }
  if (isClaudeFable52Model(model.id)) {
    return "claude-fable-5-2";
  }
  if (isClaudeFable51Model(model.id)) {
    return "claude-fable-5-1";
  }
  if (isClaudeFable5Model(model.id)) {
    return "claude-fable-5";
  }
  if (isClaudeOpus55Model(model.id)) {
    return "claude-opus-5-5";
  }
  if (isClaudeOpus5Model(model.id)) {
    return "claude-opus-5";
  }
  if (isClaudeSonnet55Model(model.id)) {
    return "claude-sonnet-5-5";
  }
  if (isClaudeHaiku55Model(model.id)) {
    return "claude-haiku-5-5";
  }
  const claudeVersion = extractClaudeOpusVersion(model.id);
  if (claudeVersion) {
    return claudeVersion;
  }
  if (isGlm53Model(model)) {
    return "glm-5.3";
  }
  if (isGlm52Model(model)) {
    return "glm-5.2";
  }
  if (isDeepseekV4Flash0731Model(model)) {
    return "deepseek-v4-flash-0731";
  }
  if (isDeepseekV41FlashModel(model)) {
    return "deepseek-v4-1-flash";
  }
  if (isDeepseekV4FlashModel(model)) {
    return "deepseek-v4-flash";
  }
  if (isDeepseekV4ProModel(model)) {
    return "deepseek-v4-pro";
  }
  if (isGrok47Model(model)) {
    return "grok-4.7";
  }
  if (isGrok46Model(model)) {
    return "grok-4.6";
  }
  if (isGrok45Model(model)) {
    return "grok-4.5";
  }
  return;
}
const FULL_SHARED_SECTION_PRESETS = new Set([
  "claude-fable-5",
  "claude-fable-5-1",
  "claude-fable-5-2",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-opus-4-5"
]);
export function presetSharedSections(name) {
  return name !== undefined && FULL_SHARED_SECTION_PRESETS.has(name) ? "full" : "diet";
}
