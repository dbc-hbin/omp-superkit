# Writing and handoff

Use only the section that serves the requested result. A request for an explanation or status is not permission to edit. For prose edits, stay within the requested text; code cleanup is a separate task. Preserve the caller's required format, including review verdicts, diffs, and machine-readable output. Do not add commentary around a format that does not allow it. Ordinary writing does not require searching past sessions or persisting memory.

## Edit prose without changing the facts

- Keep the author's voice, the requested language, and the meaning of localized text. Use natural phrasing and punctuation for that language rather than applying English word or punctuation bans to it.
- Cut empty praise, decorative emphasis, repeated conclusions, filler, and unsupported generalizations. Replace vague claims with specific facts when the source supports them; otherwise remove the claim or qualify it. Keep caveats that affect the reader's decision.
- Preserve quotations and their attribution, citations, and links. Keep exact identifiers, command spelling and argument order, defaults, output examples, and relevant exceptions. Do not rewrite code, configuration, or machine-readable data as a style fix. If a factual correction is in scope, ground it in the relevant source rather than guessing.

## Write technical instructions or explain in plain language

For instructions, start with the reader's goal and the prerequisites, including where to run the command. Put conditions and warnings before the step they govern. Give the actual command, then what the reader should see on success and what a meaningful failure or exception looks like. Introduce reference facts where readers need them for lookup; don't bury a required step inside background explanation. Shorten a README example only if it still teaches the same operation with the same flags, outcome, and limits.

For a plain-language explanation, lead with what happens or what the reader can do. Define necessary jargon in ordinary words and use one concrete example when it helps. Keep the mechanism, numbers, units, conditions, exceptions, and uncertainty intact; if an exact term is needed to find an option or error, give the term with its explanation. Do not adopt a persona or implementation workflow just because the user asked for an easier explanation.

## Give a status update since the last request

Use the last user message before the status request as the baseline unless the user specifies another point. Agent reports, tool notifications, and background events are evidence of changes, not a new baseline. Use the conversation and relevant evidence already available. Keep the update read-only: do not edit files, start jobs, run new verification, or send anything elsewhere.

Report what actually changed for the requested work, what is still open or blocked, and what has not been checked. A completed edit is not a verified outcome. If a decision or approval is still needed from the user, name the choice and give the options, relevant evidence, trade-off, and recommendation when supported. Include an unresolved earlier decision if it still blocks the work. Don't turn work the agent can do into a user action item. If nothing changed or nothing is waiting, say so.

## Report decisions and evidence when useful

For an ordinary request or handoff, give the result and point to the observation or artifact that supports it. If a decision materially shaped the result, explain why. Separate observed results from inference and from checks not run. Omit routine actions, raw transcripts, and empty sections.

For long work already using a [SUPER Run](../../super-run/SKILL.md) or [SUPER Loop](../../super-loop/SKILL.md) ledger, use that workflow's existing record and rules for material choices, pivots, and checkpoints. Link to the specific evidence and record the observed result or open question there. Don't create a parallel TSV or start a durable workflow just to explain a decision. Don't create or publish a new artifact unless the request and permissions cover it.

See the [source attribution](../ATTRIBUTION.md) for the upstream writing, explanation, status, and decision-trail procedures.
