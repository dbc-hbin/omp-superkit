// SPDX-License-Identifier: MIT

export { APP_UNRUN_CHECK_RULE as GPT_APP_UNRUN_CHECK_RULE } from "./shared-prompt.js";

export const GPT_HANDOFF_MOMENTS = {
  terminal: "a multi-task todo list's creation (in the message that creates it, after the routing line, or the next one), a todo phase change, a blocker or plan change, the final message of a turn that changed something (an answer stays an answer, even after tool calls); the routing line is not one",
  app: "a multi-task todo list's creation (in the message that creates it or the next one), a todo phase change, a blocker or plan change, the final message of a turn that changed something (an answer stays an answer, even after tool calls)"
};
export const GPT_APP_UNVERIFIED_SLOT = "what remains unverified and why";
