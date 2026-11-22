// SPDX-License-Identifier: MIT

function normalizeModelId(modelId) {
  return modelId.toLowerCase().replace(/\s+/g, "-");
}
function hasGpt6FamilySignal(value) {
  return /(?:^|[/@:._-])gpt[._-]?6(?:[._-]\d+|\d)?[._-](?:astra|sol|luna)(?:$|[/@:._-])/.test(normalizeModelId(value));
}
function hasGpt62Signal(value) {
  return /(?:^|[/@:._-])gpt[._-]?6(?:[._-]2|2)[._-](?:astra|sol)(?:$|[/@:._-])/.test(normalizeModelId(value));
}
export function isGpt62Model(model) {
  return hasGpt62Signal(model.id) || model.name !== undefined && hasGpt62Signal(model.name);
}
export function isGpt6FamilyModel(model) {
  return hasGpt6FamilySignal(model.id) || model.name !== undefined && hasGpt6FamilySignal(model.name);
}
export function extractGpt5Version(modelId) {
  const normalized = normalizeModelId(modelId);
  if (normalized.includes("gpt-5.6")) {
    return "gpt-5.6";
  }
  if (normalized.includes("gpt-5.5")) {
    return "gpt-5.5";
  }
  if (normalized.includes("gpt-5.4")) {
    return "gpt-5.4";
  }
  if (normalized.includes("gpt-5.3")) {
    return "gpt-5.3-codex";
  }
  if (normalized.includes("gpt-5.2")) {
    return "gpt-5.2";
  }
  return;
}
function hasKimiK26Signal(value) {
  return /(?:^|[/@._-])kimi-k2(?:[._-]|p)6(?:$|[/@._:-])/.test(normalizeModelId(value));
}
export function isKimiK26Model(model) {
  return hasKimiK26Signal(model.id) || model.name !== undefined && hasKimiK26Signal(model.name);
}
const KIMI_CODE_K27_MODEL_ID = "kimi-for-coding-highspeed";
const KIMI_CODE_K28_MODEL_ID = "kimi-for-coding";
function hasKimiK27Signal(value) {
  const normalized = normalizeModelId(value);
  return normalized === KIMI_CODE_K27_MODEL_ID || /(?:^|[/@._-])kimi-k2(?:[._-]|p)7(?:$|[/@._:-])/.test(normalized);
}
export function isKimiK27Model(model) {
  return hasKimiK27Signal(model.id) || model.name !== undefined && hasKimiK27Signal(model.name);
}
function hasKimiK28Signal(value) {
  const normalized = normalizeModelId(value);
  return normalized === KIMI_CODE_K28_MODEL_ID || /(?:^|[/@._-])kimi-k2(?:[._-]|p)8(?:$|[/@._:-])/.test(normalized);
}
export function isKimiK28Model(model) {
  return hasKimiK28Signal(model.id) || model.name !== undefined && hasKimiK28Signal(model.name);
}
function hasKimiK31Signal(value) {
  return /(?:^|[/@._-])(?:kimi-)?k3(?:[._-]|p)1(?:$|[/@._:-])/.test(normalizeModelId(value));
}
export function isKimiK31Model(model) {
  return hasKimiK31Signal(model.id) || model.name !== undefined && hasKimiK31Signal(model.name);
}
function hasKimiK3Signal(value) {
  const normalized = normalizeModelId(value);
  return normalized === "k3" || /(?:^|[/@._-])kimi-k3(?:$|[/@._:-])/.test(normalized);
}
export function isKimiK3Model(model) {
  return hasKimiK3Signal(model.id) || model.name !== undefined && hasKimiK3Signal(model.name);
}
function hasSWE2Signal(value) {
  return /(?:^|[/@:._-])swe-2-(?:medium|high|max)(?:$|[/@:._])/.test(normalizeModelId(value));
}
export function isSWE2Model(model) {
  return hasSWE2Signal(model.id) || model.name !== undefined && hasSWE2Signal(model.name);
}
function hasDeepseekV4Flash0731Signal(value) {
  return /(?:^|[/@:._-])deepseek[._-]v4[._-]flash[._-]0731(?:$|[/@:._-])/.test(normalizeModelId(value));
}
export function isDeepseekV4Flash0731Model(model) {
  return hasDeepseekV4Flash0731Signal(model.id) || model.name !== undefined && hasDeepseekV4Flash0731Signal(model.name);
}
function hasDeepseekV4FlashSignal(value) {
  return /(?:^|[/@:._-])deepseek[._-]v4[._-]flash(?:$|[/@:._-])/.test(normalizeModelId(value));
}
export function isDeepseekV4FlashModel(model) {
  return hasDeepseekV4FlashSignal(model.id) || model.name !== undefined && hasDeepseekV4FlashSignal(model.name);
}
function hasDeepseekV41FlashSignal(value) {
  const normalized = normalizeModelId(value);
  return /(?:^|[/@:._-])deepseek[._-]v4(?:[._-]1|p1)[._-]flash(?:$|[/@:._-])/.test(normalized) || /(?:^|[/@:._-])deepseek[._-]flash(?:$|[/@:._-])/.test(normalized);
}
const DEEPSEEK_OFFICIAL_PROVIDER = "deepseek";
function isRetiredOfficialDeepseekV4FlashAlias(model) {
  return model.provider === DEEPSEEK_OFFICIAL_PROVIDER && hasDeepseekV4FlashSignal(model.id);
}
export function isDeepseekV41FlashModel(model) {
  return hasDeepseekV41FlashSignal(model.id) || model.name !== undefined && hasDeepseekV41FlashSignal(model.name) || isRetiredOfficialDeepseekV4FlashAlias(model);
}
function hasDeepseekV4ProSignal(value) {
  return /(?:^|[/@:._-])deepseek[._-]v4[._-]pro(?:$|[/@:._-])/.test(normalizeModelId(value));
}
export function isDeepseekV4ProModel(model) {
  return hasDeepseekV4ProSignal(model.id) || model.name !== undefined && hasDeepseekV4ProSignal(model.name);
}
function hasGlm52Signal(value) {
  return /(?:^|[/@._-])glm(?:[._-]|p)5(?:[._-]|p)2(?:$|[/@._:-])/.test(normalizeModelId(value));
}
export function isGlm52Model(model) {
  return hasGlm52Signal(model.id) || model.name !== undefined && hasGlm52Signal(model.name);
}
function hasGlm53Signal(value) {
  return /(?:^|[/@._-])glm(?:[._-]|p)5(?:[._-]|p)3(?:$|[/@._:-])/.test(normalizeModelId(value));
}
export function isGlm53Model(model) {
  return hasGlm53Signal(model.id) || model.name !== undefined && hasGlm53Signal(model.name);
}
function hasGrok45Signal(value) {
  return /(?:^|[/@:._-])grok(?:[._-]|p)?4(?:[._-]|p)?5(?:$|[/@._:-])/.test(normalizeModelId(value));
}
export function isGrok45Model(model) {
  return hasGrok45Signal(model.id) || model.name !== undefined && hasGrok45Signal(model.name);
}
function hasGrok46Signal(value) {
  return /(?:^|[/@:._-])grok(?:[._-]|p)?4(?:[._-]|p)?6(?:$|[/@._:-])/.test(normalizeModelId(value));
}
export function isGrok46Model(model) {
  return hasGrok46Signal(model.id) || model.name !== undefined && hasGrok46Signal(model.name);
}
function hasGrok47Signal(value) {
  return /(?:^|[/@:._-])grok(?:[._-]|p)?4(?:[._-]|p)?7(?:$|[/@._:-])/.test(normalizeModelId(value));
}
export function isGrok47Model(model) {
  return hasGrok47Signal(model.id) || model.name !== undefined && hasGrok47Signal(model.name);
}
const CLAUDE_FABLE_52_PATTERN = /(?:fable|mythos)-5[.-]2(?!\d)/;
const CLAUDE_FABLE_51_MARKERS = ["fable-5-1", "fable-5.1", "mythos-5-1", "mythos-5.1"];
const CLAUDE_FABLE_5_MARKERS = ["fable-5", "mythos-5"];
export function isClaudeFable52Model(modelId) {
  return CLAUDE_FABLE_52_PATTERN.test(normalizeModelId(modelId));
}
export function isClaudeFable51Model(modelId) {
  const normalized = normalizeModelId(modelId);
  return CLAUDE_FABLE_51_MARKERS.some((marker) => normalized.includes(marker));
}
export function isClaudeFable5Model(modelId) {
  const normalized = normalizeModelId(modelId);
  return CLAUDE_FABLE_5_MARKERS.some((marker) => normalized.includes(marker));
}
const CLAUDE_OPUS_55_MARKERS = ["opus-5-5", "opus-5.5"];
export function isClaudeOpus55Model(modelId) {
  const normalized = normalizeModelId(modelId);
  return CLAUDE_OPUS_55_MARKERS.some((marker) => normalized.includes(marker));
}
export function isClaudeOpus5Model(modelId) {
  return normalizeModelId(modelId).includes("opus-5");
}
const CLAUDE_SONNET_55_MARKERS = ["sonnet-5-5", "sonnet-5.5"];
export function isClaudeSonnet55Model(modelId) {
  const normalized = normalizeModelId(modelId);
  return CLAUDE_SONNET_55_MARKERS.some((marker) => normalized.includes(marker));
}
const CLAUDE_HAIKU_55_MARKERS = ["haiku-5-5", "haiku-5.5"];
export function isClaudeHaiku55Model(modelId) {
  const normalized = normalizeModelId(modelId);
  return CLAUDE_HAIKU_55_MARKERS.some((marker) => normalized.includes(marker));
}
export function extractClaudeOpusVersion(modelId) {
  const normalized = normalizeModelId(modelId);
  if (normalized.includes("opus-4-8")) {
    return "claude-opus-4-8";
  }
  if (normalized.includes("opus-4-7")) {
    return "claude-opus-4-7";
  }
  if (normalized.includes("opus-4-6")) {
    return "claude-opus-4-6";
  }
  if (normalized.includes("opus-4-5") || normalized.includes("opus-4.5")) {
    return "claude-opus-4-5";
  }
  return;
}
