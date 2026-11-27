# Author a skill

Use this when asked to draft or revise a reusable skill. Return a skill another agent can edit and use, not a description of the skill you would write. A request to carry out a workflow, review completed work, or reflect on preferences is not a request to turn it into a skill. For a reusable live verification method or formal check, use [verification authoring](verify-authoring.md) or [formal checks](formal-check.md).

“Turn my PR description rules into a skill; don't install it” calls for editable source. “Write this PR description using my rules” calls for the description only.

## Gather what the skill needs

- Identify the expected output, what the executor may change, and what an observer must see before it can stop. Collect an example that should trigger the skill and a closely related one that should not. Read the relevant project rules, existing skills, and actual command or tool contracts; extend an applicable skill rather than drafting a competing one when revision is requested. Ask only about decisions that remain material after reading the available evidence.
- For a personal mode, start with the user's stated rules and relevant examples supplied for this task. If more history is needed and access is authorized, read only the relevant project, workflow, and time window. Use `skill://reflection` for evidence extraction when appropriate, not for persistence or installation. Separate confirmed preferences from recurring but inferred habits and one-off exceptions. Keep the scope of each supported rule (for example, one repository's PRs), resolve conflicts using the latest relevant explicit direction, and omit or flag unresolved inferences. Do not copy secrets, private excerpts, or unrelated personal details into the draft.
- For an explicitly requested revision, use the named or otherwise unambiguous skill as the baseline. Preserve unrelated rules and deliberate exceptions; change only what the request or scoped evidence supports. Return the revision as a draft unless writing to the existing skill was explicitly authorized.

## Draft and validate

1. Return complete `SKILL.md` source in a code block or at the requested non-installation path. Include valid YAML frontmatter with `name` matching the containing directory and `description` explaining when to use the skill and what it does. Give concrete use and non-use examples in the body, including an exception where it changes the outcome.
2. Write executable instructions in order: inputs and prerequisites, decisions, actions, evidence, and stop conditions. Use the project's actual names, commands, and observable results. Refer to the existing owner of a rule rather than copying it. Include the source or authorized draft path for every required companion file; do not link to an unwritten resource or leave a placeholder for a required step.
3. Validate from a permitted sample directory outside skill discovery, with the proposed folder name and companion layout. Check that frontmatter parses with the target host's format, `name` equals the folder name, and `description` is nonempty. Resolve relative links from the files that contain them, not the current working directory, and resolve cross-skill links through the target host. Walk the trigger and adjacent non-trigger examples against the instructions and record the selected action, expected output, and scopes left untouched. Mark a walkthrough as such; claim live behavior only for an actual run that was authorized. Report any validation you could not perform.

Drafting is not installation. Do not write into a discovery path, overwrite an installed skill, persist preferences, or open a PR on the strength of a draft request. An explicit project installation targets only a host-supported, repository-approved project location (OMP's default is `.omp/skills/<name>/SKILL.md`). If permissions or the supported path cannot be established, return the editable draft and state what is missing. A project install does not authorize an edit to a personal, global, or managed skill store.

See [attribution](../ATTRIBUTION.md) for source workflows.
