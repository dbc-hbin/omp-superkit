// SPDX-License-Identifier: MIT

const APPLY_PATCH_TOOL = "apply_patch";

export function buildFileOperationsTuning(options) {
  const { toolNames } = options;
  const hasApplyPatch = toolNames.includes(APPLY_PATCH_TOOL);
  const mutations = [];
  if (hasApplyPatch) {
    mutations.push("Use `apply_patch` for patches within its advertised scope.");
  } else if (toolNames.includes("edit")) {
    mutations.push("Use `edit` for edits within its advertised scope.");
  }
  if (toolNames.includes("write")) {
    mutations.push("Use `write` for creation or replacement only where native routing and its advertised target scope allow it. A URI-only contract does not authorize arbitrary file writes.");
  }
  const paragraphs = [];
  if (mutations.length > 0) {
    paragraphs.push(`${mutations.join(" ")} Do not use shell commands to bypass native file-mutation routing or permissions.`);
  }
  if (toolNames.includes("read")) {
    paragraphs.push("Use `read` for file inspection within its advertised scope.");
  }
  if (toolNames.includes("glob")) {
    paragraphs.push("Use `glob` for known filename patterns.");
  }
  if (toolNames.includes("grep")) {
    paragraphs.push("Use `grep` for literal text and regular expressions in file contents.");
  }
  if (hasApplyPatch) {
    paragraphs.push("Do not re-read a file immediately after a successful `apply_patch`; the call returns failure directly if the patch did not apply.");
  }
  if (paragraphs.length === 0) {
    return "";
  }
  return ["## File operations", ...paragraphs].join(`

`);
}
