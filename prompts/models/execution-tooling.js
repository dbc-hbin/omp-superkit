// SPDX-License-Identifier: MIT

export const EXECUTION_ORDER = "Run independent reads, searches, and lookups in parallel. Inspect every tool result. Keep edits, side effects, deploys, approvals, native waits, state-dependent shell calls, and result-dependent calls sequential; inspect each before the next. Preserve live schemas, specialized-tool routing, permissions, and job lifecycles. Keep call identities, failures, tool-reported errors, and missing or truncated results visible in the evidence.";
export const SHELL_STATE = "## OMP shell execution\n\nPass `cwd` on each bash call that needs a particular directory; do not rely on a previous `cd`. Sequence bash calls that depend on shell state; overlapping calls do not provide state handoffs. A copy of a busy session shell sees variables, functions and options from the last completed command boundary; changes in the copy do not persist in the original shell.";

export function buildAsyncRules(hasBash, hasTask) {
  return "Use async by default for finite calls that expose it, and keep working on everything that does not need their pending results."
    + (hasBash ? " Bash async keeps the command deadline; choose a task-appropriate timeout. Named ready services use the service contract, with no async or timeout parameters." : "")
    + (hasTask ? " Use task's advertised asynchronous, synchronous, or BLOCKING agent contract; never spawn a child just to watch another operation." : "");
}

export function buildPendingResults(hasWait) {
  return hasWait
    ? "When only pending work remains, follow the native `wait` guidance for this session, including when to end the turn for automatic result delivery."
    : "When only pending work remains, leave it pending for result delivery by the host or parent and do not declare it complete.";
}

const KIMI_EVAL_ROUTING = "Sort a multi-call step before you write it: put independent reads, searches, symbol lookups, and probes into one `eval` cell together with `parallel(thunks)`, and run edits, side-effecting commands, deploys, approvals, and any call that depends on a result you have not seen yet one at a time, looking at each result before the next.";
const KIMI_VISUAL_CHECK = "When the result must be seen rather than read - a page, a component, an image, a 3D scene, a layout - make one change, render or screenshot it, look, then make the next; check a 3D scene from several angles and a page at desktop and mobile widths. Compare what you see with the reference or the stated intent, and ask only where two readings of that intent diverge.";
const KIMI_DIRECT_CALL = "Use a direct tool call when one call is enough, when each result decides the next call, or when the action needs approval - then stop deliberating and make it.";

const EXECUTION_TOOLING_RULES = [
  {
    id: "eval-routing-decision",
    concern: "code-cell-routing",
    directive: {
      claude: "Sort each multi-call step first: independent reads/searches/symbol lookups/probes -> ONE `eval` cell via `parallel(thunks)`. Edits, side effects, deploys, approvals, any call fed by an unseen result -> one at a time, observe each before next.",
      kimi: KIMI_EVAL_ROUTING
    },
    fullDirective: {
      claude: "Sort a multi-call step before you write it: independent reads, searches, symbol lookups, and probes go into ONE `eval` cell together via `parallel(thunks)` - an extra read-only call in that wave is nearly free, a stale assumption costs the turn - while edits, side-effecting commands, deploys, approvals, and any call whose input is a result you have not seen yet run one at a time, each observed before the next.",
      kimi: KIMI_EVAL_ROUTING
    }
  },
  {
    id: "eval-evidence-return",
    concern: "code-cell-routing",
    directive: {
      claude: "Name expected state before running a cell; on return COMPARE evidence to it; for a mutating cell also confirm nothing changed beyond it.",
      kimi: "Name the state a cell should produce before running it; when it returns, compare the returned evidence with that state, and for a cell that changed something also check that nothing changed beyond it."
    },
    fullDirective: {
      claude: "Name the state a cell should produce before running it; when it returns, COMPARE the returned evidence with that state, and for a cell that changed something also check that nothing changed beyond it. A result that hides a failed item or a truncated tail is not evidence.",
      kimi: "Name the state a cell should produce before running it; when it returns, compare the returned evidence with that state, and for a cell that changed something also check that nothing changed beyond it. A result that hides a failed item or a truncated tail is not evidence."
    }
  },
  {
    id: "perceived-state-loop",
    concern: "code-cell-routing",
    directive: {
      claude: "Result must be SEEN (page, component, image, 3D scene, layout): one change -> render/screenshot -> look -> next. 3D: several angles. Page: desktop + mobile widths. Compare to reference or stated intent; ask only where two readings of intent diverge.",
      kimi: KIMI_VISUAL_CHECK
    },
    fullDirective: {
      claude: "When the result must be SEEN rather than read - a page, a component, an image, a 3D scene, a layout - make one change, render or screenshot it, look, then make the next; check a 3D scene from several angles and a page at desktop and mobile widths. Compare what you see with the reference or the stated intent, and ask only where two readings of that intent diverge.",
      kimi: KIMI_VISUAL_CHECK
    }
  },
  {
    id: "eval-stay-direct",
    concern: "code-cell-routing",
    directive: {
      claude: "Direct tool call only when: one call suffices, result decides next call, semantic judgment sits between calls, or action needs approval.",
      kimi: KIMI_DIRECT_CALL
    },
    fullDirective: {
      claude: "Call a tool directly only when one call is enough, the result decides the next call, semantic judgment sits between calls, or the action needs approval.",
      kimi: KIMI_DIRECT_CALL
    }
  }
];
const CONCERN_TOOL = {
  "code-cell-routing": "eval"
};
export function buildExecutionToolingSection(options) {
  const paragraphs = EXECUTION_TOOLING_RULES
    .filter(rule => options.toolNames.includes(CONCERN_TOOL[rule.concern]) && !(options.subagent && rule.id === "perceived-state-loop"))
    .map(rule => (options.sharedSections === "full" ? rule.fullDirective : rule.directive)[options.dialect]);
  if (paragraphs.length === 0) {
    return "";
  }
  const body = paragraphs.join(`

`);
  return options.dialect === "claude" ? `<execution_tooling>
${body}
</execution_tooling>` : body;
}
export function buildExecutionToolingParagraph(options) {
  const section = buildExecutionToolingSection(options);
  return section ? `${section}

` : "";
}
