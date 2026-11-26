// SPDX-License-Identifier: MIT

import {
  extractClaudeModel,
  extractGpt5Version,
  extractKimiK3Version,
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
  resolveSWEPreset,
} from "./model-matchers.js";

const CLAUDE_PRESET_VERSIONS = new Set([
  "fable-5-2", "fable-5-1", "fable-5",
  "opus-5-5", "opus-5", "opus-4-8", "opus-4-7", "opus-4-6", "opus-4-5",
  "sonnet-5-5", "haiku-5-5",
]);

function claudePresetName(identity) {
  if (!identity) return;
  const { family, major, minor } = identity;
  const base = `${family}-${major}`;
  const exact = `${base}-${minor}`;
  if (minor !== undefined && CLAUDE_PRESET_VERSIONS.has(exact)) return `claude-${exact}`;
  if (CLAUDE_PRESET_VERSIONS.has(base)) return `claude-${base}`;
}

// undefined is unrecognized; null is recognized but must not fall back to metadata.
function resolveModelAlias(model, claudeCorroboration) {
  const swe = resolveSWEPreset(model.id);
  if (swe !== undefined) return swe;
  const claude = extractClaudeModel(model.id, { provider: model.provider, corroboration: claudeCorroboration });
  if (claude !== undefined) return claudePresetName(claude) ?? null;
  if (isGpt62Model(model)) {
    return "gpt-6.2";
  }
  if (isGpt6FamilyModel(model)) {
    return "gpt-6-astra";
  }
  const gpt5Version = extractGpt5Version(model.id);
  if (gpt5Version !== undefined) {
    return gpt5Version;
  }
  const kimiK3Version = extractKimiK3Version(model.id);
  if (kimiK3Version !== undefined) {
    return kimiK3Version;
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
}

export function resolvePresetName(model) {
  const { class: lineage, logicalId } = model.identity ?? {};
  const alias = logicalId ?? model.name;
  const allowsClaudeMetadata = lineage === undefined || lineage === "unknown" || lineage === "anthropic";
  const direct = resolveModelAlias({ id: model.id, provider: model.provider }, allowsClaudeMetadata ? alias : undefined);
  // Billing variants can omit the snapshot from the wire ID. Refine only
  // a generic V4 Flash ID, never a specific revision or another family.
  if (direct === "deepseek-v4-flash" && alias !== undefined &&
      (lineage === undefined || lineage === "unknown" || lineage === "deepseek") &&
      resolveModelAlias({ id: alias }) === "deepseek-v4-flash-0731") {
    return "deepseek-v4-flash-0731";
  }
  if (direct !== undefined) return direct ?? undefined;

  if (alias === undefined) return;
  let preset = resolveModelAlias({ id: alias });
  if (preset === undefined && logicalId === undefined) {
    // An OpenAI catalog label can append the concrete model to the deployed
    // alias, e.g. "Chat Latest (GPT-5.5 Instant)" for "openai/chat-latest".
    const label = /^(.+?)\s+\(([^()]+)\)$/.exec(alias.trim());
    const segments = model.id.trim().toLowerCase().split(/[/:@]/);
    const openai = lineage === "openai" || segments.at(-2) === "openai";
    if (openai && label && label[1].toLowerCase().replace(/\s+/g, "-") === segments.at(-1)) {
      preset = extractGpt5Version(label[2]);
    }
  }

  if (!preset) return;
  if (preset.startsWith("claude-") && !allowsClaudeMetadata) return;
  if (lineage !== undefined && lineage !== "unknown") {
    if (preset.startsWith("gpt-") && lineage !== "openai") return;
    if (preset.startsWith("kimi-") && lineage !== "kimi") return;
  }
  return preset;
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
