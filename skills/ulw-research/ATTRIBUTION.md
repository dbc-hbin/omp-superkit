# ATTRIBUTION / NOTICE

`ulw-research` is authored for OMP. The projects below inspired research/report ideas; no third-party source is vendored or redistributed here.

## Inline HTML report delivery

- Workflow source: [OMO v5.1.79 research delivery](https://github.com/code-yeongyu/oh-my-openagent/blob/822bd923038c88427b450744de75e0fa7d7401cd/packages/shared-skills/skills/ulw-research/SKILL.md).
- Adaptation: show the verified report using [OMP v19.1.0's client-advertised `renderEmbeds` contract](https://github.com/can1357/oh-my-pi/blob/a7135b8f31826c878734388b648f52bed8da436e/packages/coding-agent/src/prompts/system/system-prompt.md), with the existing local report gates and link fallback. No upstream report tooling is used.

## insane-research (fivetaku)

The claim-graph data-flow lock is inspired by **insane-research**: high-risk non-code assertions enter synthesis only after independent sources, counter-search and primary backing, otherwise remaining unresolved/refuted.

- Source: https://github.com/fivetaku/insane-research
- License: MIT (declared in its README); copyright (c) 2026 renocrypt.
- Adaptation: idea only, no code copied.

## latex-paper-skills (yunshenwuchuxun)

Verified bibliography entries tied to retrieved sources and citation-preserving prose refinement in `references/latex-report.md` are inspired by its citation-verification workflow and `latex-rhythm-refiner` skill.

- Source: https://github.com/yunshenwuchuxun/latex-paper-skills
- Referenced snapshot: `d0f1061`, 2026-03-25.
- License: MIT (copyright (c) 2026 renocrypt, declared in its LICENSE).
- Adaptation: ideas only; no validators, templates or prompt text copied.

## latex-document-skill (ndpvt-web)

The LaTeX reference's multipass compilation, log-first error diagnosis, rendered-page previews, Unicode-aware engine selection and long-document source structure are inspired by this project.

- Source: https://github.com/ndpvt-web/latex-document-skill
- Referenced snapshot: `54279f7`, 2026-08-08.
- License: MIT.
- Adaptation: ideas only; no upstream compile scripts, templates or text copied.
