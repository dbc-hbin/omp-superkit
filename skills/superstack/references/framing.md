# Explain or reframe the request

Use this reference when the requested deliverable is understanding, a restatement, or a better task description. Keep it read-only unless the user separately requests an edit to a specified prompt or document. Explain the current system; don't silently start a fix.

| What the reader needs | Work from | Deliver |
|---|---|---|
| **How does this work?** | Follow a real input from entry point through the owning code or policy, across any relevant boundaries, to the caller, output or persisted effect. | Name the owner and contracts. Show where the relevant behavior happens and what the consumer sees, with source pointers. |
| **Why was this designed that way?** | Find the commits, PR discussion, decision notes or contemporaneous documents for the change. Inspect current code to see what is still true. | Separate recorded rationale from current behavior, your inference, and unanswered history. “Why does it fail?” asks for the mechanism, not a guess about historical intent. |
| **Teach me this.** | Use the relevant how and why evidence. Select depth from the reader's purpose: an engineer preparing a change needs ownership and invariants; a newcomer needs a working mental model first. | Give a plain definition, then walk one real input through the system, explain an important tradeoff, and show a common mistake or edge case. Keep uncertainty about intent intact. Use a diagram only if it makes the flow clearer. |

For intent restatement, return the problem the user experiences, what they want to change or learn, what must stay unchanged, and what would count as done. State an assumption only if it matters. If asked just to restate, stop there. A clear ordinary request does not need a restatement before work.

## Sharpen the prompt

Deepen the requested work without broadening it. Use the supplied primary inputs or name the raw materials needed, such as the exact retry input, caller code, or a before-state capture. Replace vague instructions with a method that can distinguish the plausible explanations and with evidence an actual consumer or another observer can check. When a reversible experiment can settle a choice, make it part of the prompt; keep material preference decisions with the user. Carry over every no-edit, scope, and output constraint. Deliver the revised prompt, not the result of running it.

For example, sharpen “Find out why the jobs run twice; don't fix it” to “Trace one duplicated job from its original enqueue through a retry using the relevant event log and handler code. Identify the observation that distinguishes a second enqueue from two deliveries of one job, cite the owning code, and state what the available evidence can't settle. Do not change code.”

## Reframe the problem

Start from the user's concrete description and source material. If it could describe different mechanisms, name the plausible ones and an observation that separates each. For example, two rows with different event IDs suggest duplicate creation; two deliveries of the same event ID suggest redelivery. Use only terms that change the question, design or observation, and define them in plain language.

Use an analogy from another system or field only if it clarifies the mechanism. Say what transfers and where it breaks. Cite only examples you examined, and mark untested interpretations as such. Finish with the revised description and any decisive unknowns, not implementation.

Source and license: [attribution](../ATTRIBUTION.md).
