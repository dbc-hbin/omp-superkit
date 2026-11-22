// SPDX-License-Identifier: MIT

export const GPT_HANDOFF_MOMENTS = {
  terminal: "a multi-task todo list's creation (in the message that creates it, after the routing line, or the next one), a todo phase change, a blocker or plan change, the final message of a turn that changed something (an answer stays an answer, even after tool calls); the routing line is not one",
  app: "a multi-task todo list's creation (in the message that creates it or the next one), a todo phase change, a blocker or plan change, the final message of a turn that changed something (an answer stays an answer, even after tool calls)"
};
export const GPT_APP_UNRUN_CHECK_RULE = "A check that did not run is covered by the evidence that did run; name it, with the next best check, only when no other evidence supports the claim. Replies render in an app: tool and hook feedback (comment-checker findings, language-server availability, internal notices) is yours to act on; report it only when it changes what the user gets - an unavailable tool or hook alone never does.";
export const GPT_APP_UNVERIFIED_SLOT = "anything left unverified that no other evidence covers";
