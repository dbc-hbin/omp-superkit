// SPDX-License-Identifier: MIT

const APPLY_PATCH_TOOL = "apply_patch";
const EDIT_TOOL_NAMES = ["edit", "write"];
const READ_TOOL = "read";
const GREP_TOOL = "grep";
function resolveFileMutationRouting(toolNames) {
  if (toolNames.includes(APPLY_PATCH_TOOL)) {
    return { mode: "apply-patch", tools: [APPLY_PATCH_TOOL] };
  }
  const editTools = EDIT_TOOL_NAMES.filter((name) => toolNames.includes(name));
  if (editTools.length > 0) {
    return { mode: "edit-write", tools: editTools };
  }
  return { mode: "none", tools: [] };
}
function formatToolList(tools) {
  const quoted = tools.map((name) => `\`${name}\``);
  if (quoted.length <= 1) {
    return quoted[0] ?? "";
  }
  return `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]}`;
}
export function buildFileOperationsTuning(options) {
  const { toolNames } = options;
  const routing = resolveFileMutationRouting(toolNames);
  const paragraphs = [];
  if (routing.mode !== "none") {
    paragraphs.push(`Use ${formatToolList(routing.tools)} for ALL file edits and creations. Do NOT write or modify files via bash heredoc (\`cat >\`, \`echo > \`), \`sed -i\`, \`awk -i\`, or inline \`python\`/\`python3 -c\` scripts.`);
  }
  if (toolNames.includes(READ_TOOL)) {
    paragraphs.push("Use `read` for ALL file inspection. Do NOT substitute `cat`, `sed`, `head`, `tail`, or inline `python` invoked through bash.");
  }
  if (toolNames.includes(GREP_TOOL)) {
    paragraphs.push("For text or filename search, use the `grep` tool (ripgrep-backed, respects .gitignore). Do NOT shell out to `grep` or `rg` through bash for the same purpose.");
  }
  if (routing.mode === "apply-patch") {
    paragraphs.push("Do not re-read a file immediately after a successful `apply_patch`; the call returns failure directly if the patch did not apply.");
  }
  if (paragraphs.length === 0) {
    return "";
  }
  return ["## File operations", ...paragraphs].join(`

`);
}
