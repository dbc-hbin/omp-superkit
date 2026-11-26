// SPDX-License-Identifier: MIT

function normalizeModelId(modelId) {
  return modelId.toLowerCase().replace(/\s+/g, "-");
}
function hasGpt6FamilySignal(value) {
  return /(?:^|[/@:._-])gpt[._-]?6(?:(?:[._-]\d+|\d)?[._-](?:astra|sol|luna)|[._-]?1[._-]terra)(?:$|[/@:._-])/.test(normalizeModelId(value));
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
// Accept model namespaces, the embedded OpenAI vendor prefix and the Duo Chat
// product prefix, not arbitrary text preceding a GPT version.
const GPT_MODEL = /^(?:\[[\w.-]+\]-*)?(?:[\w.-]+[/:@]-*)*(?:(?:[\w-]+\.)*openai[._-]+|duo-chat-)?gpt[._-]?(?=\d)/;
// null means a concrete GPT ID without a preset, including legacy GPT-5/5.1.
export function extractGpt5Version(value) {
  const normalized = normalizeModelId(value.trim());
  const model = GPT_MODEL.exec(normalized);
  if (!model) return;
  const release = /^5[._-]?([2-6])(?=$|[/@:-]|[._](?!\d))/.exec(normalized.slice(model[0].length));
  if (!release) return null;
  const [, minor] = release;
  return minor === "3" ? "gpt-5.3-codex" : `gpt-5.${minor}`;
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
export function extractKimiK3Version(value) {
  const normalized = normalizeModelId(value.trim());
  const model = /(?:^|[/@:._-])kimi-k3(?=$|[/@:._-]|p\d)|(?:^|[/@:])k3(?=[._-]\d|p\d)|^k3$/.exec(normalized);
  if (!model) return;
  const suffix = normalized.slice(model.index + model[0].length);
  const minor = /^(?:[._-]|p)(\d+)/.exec(suffix);
  // Capacity and date suffixes decorate base K3 rather than naming a minor release.
  if (!minor || /^-(?:\d+[km]|\d{8}|\d{4}-\d{2}-\d{2})(?=$|[/@:._-])/.test(suffix)) return "kimi-k3";
  if (minor[1] === "1" && /^(?:$|[/@:-]|[._](?!\d))/.test(suffix.slice(minor[0].length))) return "kimi-k3-1";
  return null;
}
export function resolveSWEPreset(value) {
  const name = value.slice(value.lastIndexOf("/") + 1).trim();
  const id = normalizeModelId(name);
  if (!/(?:^|[@:._-])swe-?\d/.test(id)) return undefined;
  // Devin's wire ID puts effort before speed (high-lightning); the catalog
  // label puts speed first (SWE-2.1 Ultrafast High).
  if (/^swe-?2[.-]1(?:-(?:low|medium|high|xhigh|max))?(?:-(?:fast|ultrafast|lightning))?(?::(?:low|medium|high|xhigh|max))?$/.test(id)
    || /^SWE-2\.1\s+Ultrafast\s+(?:Low|Medium|High|XHigh|Max)$/i.test(name)) return "kimi-k3";
  if (/(?:^|[@:._-])swe-2-(?:medium|high|max)(?:$|[@:._])/.test(id)) return "kimi-k3";
  // The ID identifies a SWE model or composite, not an opaque deployment.
  // An unsupported lane must not inherit a supported display name or logical ID.
  return null;
}
function hasDeepseekV4Flash0731Signal(value) {
  return /(?:^|[/@:._-])deepseek[._-]v4[._-]flash[.:_-]0731(?:$|[/@:._-])/.test(normalizeModelId(value));
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
// A model alias can carry a gateway namespace, a date or revision, and delivery
// qualifiers. Match the whole alias rather than a Claude substring in another model.
const CLAUDE_BRAND = /(?:[\w-]+\.)*claude[\s._-]+/.source;
const CLAUDE_FAMILY = /(fable|mythos|opus|sonnet|haiku)/.source;
// Version-first aliases, such as claude-4.6-opus, require the Claude brand.
// GitLab's Duo Chat deployment alias is a family-first name with its own prefix.
const CLAUDE_MODEL = new RegExp(
  String.raw`^(?:\[[\w.-]+\]\s*)?(?:[\w.-]+[/:@]\s*)*(?:(?:${CLAUDE_BRAND}|(duo-chat-))?${CLAUDE_FAMILY}[\s._-]+(\d+)`
  + String.raw`|${CLAUDE_BRAND}(\d+)(?:[._-](\d+))?[\s._-]+${CLAUDE_FAMILY})(?=$|[\s._:@-])`,
);
const CLAUDE_RELEASE = /^(?:-+(?!\d{8}(?=$|[-:@]))(\d+))?(?:[-:@]+(?:\d{8}|\d{4}-\d{2}-\d{2}|v\d+(?::\d+)?|\d+[km]|batch|default|fast(?:-mode)?|free|low|medium|high|extra-high|xhigh|max|thinking|preview|latest))*$/;
const DISTILLED_MODEL = /(?:^|[^a-z0-9])distill(?:ed|ation)?(?:$|[^a-z0-9])/;

// undefined means no Claude identity; null means a recognized but rejected alias.
export function extractClaudeModel(value, { provider, corroboration } = {}) {
  if (value === undefined) return;
  const id = value.trim().toLowerCase();
  if (DISTILLED_MODEL.test(id)) return null;

  const alias = CLAUDE_MODEL.exec(id);
  if (!alias) return;
  const [, duoChat, familyFirst, major, versionFirstMajor, versionFirstMinor, versionFirstFamily] = alias;
  if (duoChat && provider !== undefined && provider !== "gitlab-duo") return null;
  // Preserve namespace punctuation above, and keep ':'/'@' distinct from version separators.
  const release = CLAUDE_RELEASE.exec(id.slice(alias[0].length).replace(/[\s._]+/g, "-"));
  if (!release || (versionFirstFamily && release[1] !== undefined)) return null;

  const modelFamily = familyFirst ?? versionFirstFamily;
  const family = modelFamily === "mythos" ? "fable" : modelFamily;
  // Venice can concatenate the major and minor in a bare Claude deployment ID.
  // Only split the digits if independent metadata names that exact release.
  if (provider === "venice" && familyFirst && id === `claude-${familyFirst}-${major}` && /^[1-9]\d$/.test(major)) {
    const reference = extractClaudeModel(corroboration);
    if (reference?.family === family && reference.major === major[0] && reference.minor === major[1]) {
      return reference;
    }
  }
  return {
    family,
    major: major ?? versionFirstMajor,
    minor: versionFirstFamily ? versionFirstMinor : release[1],
  };
}
