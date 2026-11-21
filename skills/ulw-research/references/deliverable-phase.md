# ulw-research - deliverable contract

This reference owns report state, format promises, evidence-preserving validation and the existing report-tools interface. Use the [responsibility boundary](../../ulw-loop/references/omp-contract.md) for working methods and permissions. Keep the requested destination/format; a demo or reproduction does not replace a promised report.

## 1. Lanes and destination

Record one lane and exactly the promised formats in `brief.md`:

| Lane | Meaning |
| --- | --- |
| `template-strict` | Match a pointed-at document's structure, tokens, citations and figure style. |
| `template-vibe` | Apply a requested register without an exact template. |
| `no-format` | Use the destination's natural shape, including a chat/text answer. |
| `edit-existing` | Update an existing complete deliverable rather than regenerating it. |

Explicit formats win. Chat/thread answers default to `post`; Markdown files use `md`; a web/blog destination uses `html`; an unspecified document with no destination defaults to `pdf,docx`. A pointed-at template defaults to its format. Use existing preferences when known; resolve only missing destination/format, audience/length or template choices that change the output. Record `answered_by: user|default|request` for each choice, without interrupting independent evidence collection for cosmetic choices.

```text
## Deliverable
lane: template-vibe
state: none
formats: pdf, docx (answered_by: request)
destination: internal review (answered_by: default)
audience: engineering leads, standard length (answered_by: user)
template: clean analyst report (answered_by: default)
format description: none (answered_by: default)
```

## 2. Resumable state

`$SKILL_DIR` is the absolute installed directory containing the `SKILL.md` actually read. `$SESSION_DIR` is the research directory with local timestamp basename `YYYYMMDD-HHMMSS`. Always pass it explicitly. Helpers use only Node built-ins, run under Node or Bun, and never launch a browser.

```bash
node "$SKILL_DIR/scripts/report-tools.mjs" outcome state --deliverable "$SESSION_DIR/report.md" --session-dir "$SESSION_DIR"
node "$SKILL_DIR/scripts/report-tools.mjs" outcome init --promised pdf,docx --lane template-vibe --session-dir "$SESSION_DIR"
```

`state` returns `none` for a missing/empty file, `partial` for `STATUS: draft` in its first five lines or any pending manifest row, otherwise `complete`. Resume a partial skeleton; edit a complete report in place. Create headings early with `STATUS: draft - <n> sections open` near the top (HTML/TeX comment where appropriate), and remove that marker only when content is complete. `init` creates a new manifest: use it once, not to erase resumed state.

## 3. Design spec when presentation matters

A text/chat report does not need a style extraction or elaborate design document. For a formatted artifact, record its actual template, palette, typography, layout, structure, figures and citations in `design-spec.md`. With an HTML/Markdown reference, extraction preserves its format rather than inventing one:

```bash
node "$SKILL_DIR/scripts/report-tools.mjs" format-extract "$SESSION_DIR/reference.html" --out "$SESSION_DIR/design-spec.md"
node "$SKILL_DIR/scripts/report-tools.mjs" format-extract "https://example.com/report" --from-url --out "$SESSION_DIR/design-spec.md"
```

The extractor also writes `<out>.extract.json`. PDF extraction is unsupported; use the source HTML/Markdown or record the limitation. Its fixed sections are `Extracted from`, `Tokens`, `Typography`, `Layout`, `Structure`, `Figures`, `Citations`, `Open questions`. Resolve `TODO: ask` using the request/reference or explicitly recorded defaults. A clean analyst default uses one accent over neutrals, legible sans fonts including the report's language, readable margins and numbered sources with access dates. Korean HTML text uses `word-break: keep-all; overflow-wrap: anywhere`.

`--from-url` performs a static fetch. If the reference requires JavaScript or interaction, read [browser](../../browser/SKILL.md), render it through the authorized native route, save `await sourceTab.evaluate(() => document.documentElement.outerHTML)` through the host's file tools, and pass that file to `format-extract`. This retains the document head and inline styles; `tab.html()` defaults to the body. External stylesheets are not followed by the extractor, so missing computed tokens remain a separate browser observation. For blocked/incomplete references use [ultimate-browsing](../../ultimate-browsing/SKILL.md), retaining provenance and any incomplete coverage. A login/challenge shell must not become the design spec.

Machine readers recognize CSS custom-property colors under `Tokens`/`Palette`/`Colors` (including fenced declarations) and `Lineage: inline|section` under `Citations`:

- `inline` (default): unit-bearing numbers carry `MEASURED`, `ASSUMED`, `DERIVED`, `data-lineage`, or a source citation in the same element.
- `section`: sections remain cited; captions explain numeric lineage. Untagged numbers are advisory minor defects rather than major defects.

For included figures, use captioned containers, contain-fit and preserved aspect ratio; charts retain real text for title, labels, units and values. See [report-visualization.md](report-visualization.md) for applicable evidence visuals and [latex-report.md](latex-report.md) for `.tex` plus compiled PDF delivery.

## 4. Report gates

Validate the actual promised report, not only its embedded demo. Keep facts, units, uncertainty, attribution, citations, links and claim associations intact during proofreading; suspected factual changes return to the source/claim graph. Recheck affected evidence and rendering when an edit invalidates them.

For plain text/Markdown/chat, validate citations, numeric lineage, requested sections and promised files directly; record the checks performed. Do not create an HTML/PDF solely to satisfy an unrelated visual gate. Use `not_run` for inapplicable layout/visual gates, with the reason in the journal. For a formatted or paginated artifact, apply relevant static, layout, rendered-page inspection and proofreading checks in that order; record inaccessible checks and their capability limitation, never a fabricated pass.

The CLI static/layout checker consumes HTML, not Markdown, PDF, DOCX or PNG. For an HTML report or a formatted report's actual HTML source:

```bash
node "$SKILL_DIR/scripts/report-tools.mjs" check "$SESSION_DIR/report.html" --design-spec "$SESSION_DIR/design-spec.md" --visual-requirement not_applicable
node "$SKILL_DIR/scripts/report-tools.mjs" layout-probe --json
node "$SKILL_DIR/scripts/report-tools.mjs" check "$SESSION_DIR/report.html" --design-spec "$SESSION_DIR/design-spec.md" --layout "$SESSION_DIR/boxes.json" --visual-requirement required
node "$SKILL_DIR/scripts/report-tools.mjs" outcome gate static pass --session-dir "$SESSION_DIR"
node "$SKILL_DIR/scripts/report-tools.mjs" outcome gate layout not_run --session-dir "$SESSION_DIR"
node "$SKILL_DIR/scripts/report-tools.mjs" outcome render "$SESSION_DIR/renders/page-01.png" --page 1 --session-dir "$SESSION_DIR"
```

Choose `--visual-requirement auto|required|not_applicable|blocked_capability` from the report's material claims and actual capability, not to hide missing evidence. `auto` uses markup/prose heuristics and can over-classify lists or numbers; an explicit justified value is supported. Text-only delivery is valid. Gates inspect keep-all, palette, punctuation, headings, number lineage, citations, closing/sources sections, assets and figure semantics; [report-gates.md](report-gates.md) defines their codes.

`layout-probe --json` prints a `.source` expression. Evaluate that expression in the actual rendered page and save its returned object as `boxes.json`; a screenshot, PDF or HTML snapshot is not probe JSON. Without that object the CLI reports layout `not_run`. Inspect actual pages for facts a box probe cannot establish: missing/illegible figures, broken pagination, clipped text and wrong source/render correspondence. [Reference compare](report-visualization.md#reference-compare--requested-visual-reproductions-only) applies only to requested reproductions.

For HTML rendering and probe evaluation, read [browser](../../browser/SKILL.md) and the applicable [capture recipe](../../visual-qa/references/browser-setup.md). Open the actual report URL/file in a task-owned native tab and wait for its real ready state. With `reportTab` that handle, `probe` the parsed CLI JSON and `layoutPath` the actual output path:

```js
const boxes = await reportTab.evaluate(probe.source);
await Bun.write(layoutPath, JSON.stringify(boxes, null, 2));
const reportImage = await reportTab.screenshot({ format: "png" });
const reportErrors = await reportTab.errors();
console.log(reportImage, reportErrors.entries, { dropped: reportErrors.dropped });
```

Inspect the returned image and semantic report content at the desktop/mobile states relevant to the promised HTML, using separate desktop tabs after native mobile presets. These browser checks apply when this reference is reached through direct skill invocation too. The layout object alone does not establish visual correctness, and a browser screenshot does not replace the saved probe object. Release owned handles after evidence, unless a final report tab was explicitly retained for the user.

Gate names are exactly `static`, `layout`, `visual`, `proofread`; stored statuses are `pass`, `fail`, `not_run`. The `check` command exits `1` and reports top-level `fail` only for blockers; major/minor defects still require inspection and an explicit repair/residual decision. `outcome gate` records a status; it does not run the check. Edition fidelity is a separate delivery requirement, never a mutable gate label.

### Edition fidelity

**Retain what was read.** Save the original observed UTF-8 HTML, Markdown or text through the approved source-access route. Register it while collecting, not from report prose or a reconstructed quote. For a browser page save the observed rendered text/DOM and log the state and retrieval route. The command does not fetch or interact with the URL.

```bash
node "$SKILL_DIR/scripts/report-tools.mjs" source snapshot S1 \
  --input "$SESSION_DIR/annual-review.html" \
  --origin "https://example.org/annual-review" --session-dir "$SESSION_DIR"
```

The snapshot keeps `source-snapshots/S1/raw` and `meta.json` (content digest, projection format, origin, retention timestamp). A different capture under the same ID is rejected; give it a new ID and update the ledger/citations. In `sources-ledger.md`, start the line with `[S1] https://example.org/annual-review` and append title, actual access date and provenance. Use `<...>` around an origin path containing spaces. IDs must be unique; a report `[S1]` cannot be proven with `S2` or a different origin.

**Bind the exact report text.** Each block containing bound numbers or quotes must identify one source. Split a paragraph or table row that mixes different sources into separately cited blocks; the verifier will not guess which citation belongs to which value.

Suppose the retained source contains these two paragraphs:

```html
<p>The venue welcomed 12.5 million visitors.</p>
<p>Demand exceeded expectations.</p>
```

The published HTML has:

```html
<p>The venue welcomed <strong>12.5 million visitors</strong> [S1].</p>
<p>The review says <q>Demand exceeded expectations.</q> [S1].</p>
```

Save a UTF-8 JSON array as `$SESSION_DIR/report.bindings.json`:

```json
[
  {
    "kind": "number",
    "block": "The venue welcomed 12.5 million visitors [S1].",
    "value": "12.5 million visitors",
    "source": "S1",
    "excerpt": "The venue welcomed 12.5 million visitors."
  },
  {
    "kind": "quote",
    "block": "The review says “Demand exceeded expectations.” [S1].",
    "value": "Demand exceeded expectations.",
    "source": "S1",
    "excerpt": "Demand exceeded expectations."
  }
]
```

```bash
node "$SKILL_DIR/scripts/report-tools.mjs" fact verify "$SESSION_DIR/report.html" \
  --bindings "$SESSION_DIR/report.bindings.json" --session-dir "$SESSION_DIR"
```

Use one binding per occurrence: `block` is the displayed paragraph, heading, table row or text block (including its citation); `value` is the complete displayed numeral with adjacent unit/scale or the verbatim quote without outer quotation marks; `excerpt` is exact, unique context from the cited snapshot containing the whole mention. `<q>` is projected with curly double quotes. For a block quote put `[S1]` at the end of the quoted block; it is not part of `value`. Split duplicate mentions in the same block into distinct blocks. Use a separate bindings file where editions project different blocks. Prose without numbers or direct quotes uses `[]`, not invented source rows. Dates and other digit runs in projected reader text can also require bindings; keep labels that are just citation markers or organize non-claim metadata outside the reading edition. An initial check with `[]` returns detected unbound mentions and their projected blocks.

The scan rejects absent/unbound mentions, citation mismatches, ambiguous source context, altered quote text, or changed units/scales. For example, a report and a binding that both switch `12.5 million visitors` to `12.5 billion visitors` still fail with `number_mismatch`. A quote cannot silently shorten a numerical token or its unit. Whitespace and Unicode canonical composition are normalized; otherwise use the same literal value, spelling, sign, scale and unit as retained. It does not automatically recognize conversions, rounding, spelled-out numbers, qualifiers beyond the lexical mention, units inherited from headers, or relations between values. Display units beside numbers in each factual table row, keep the subject, period, denominator and qualification checked in the claim graph, and retain real executed results or explicitly labeled assumption records for published derived or assumed values. Stale or missing evidence is a failure, not a residual visual defect.

The text projection is static, not the browser accessibility tree or a full Markdown renderer. It checks supported HTML/Markdown/TXT text (including inline SVG text), not raster or external chart labels, CSS-generated content/style visibility, dynamic data, TeX, or PDF text. Do not use hidden content as evidence. For unsupported representations, include the evidence in checked visible text and compare the actual visual/converted output separately. For a PDF or other binary source, retain the attributable text extraction, record how it was obtained and independently check it against the original; the snapshot only pins the material supplied. The receipt proves this local evidence/edition pairing, not that a remote site served the provided file or that the claim is true.

**Review derivative bytes.** For PDF, DOCX, TeX and binary slides, run `fact verify` on the real HTML, Markdown or text reading edition used to produce or compare the output (it need not itself be a promised format). Inspect the actual derivative against that reading edition and relevant captures, comparing values, units, direct quotes, citations and any unsupported visual data. Save the actual review and its scope, then attach it to that derivative:

```bash
node "$SKILL_DIR/scripts/report-tools.mjs" fact derivative "$SESSION_DIR/report.pdf" \
  --from "$SESSION_DIR/report.html" --inspection "$SESSION_DIR/pdf-inspection.txt" \
  --session-dir "$SESSION_DIR"
```

The receipt pins the derivative bytes, verified source edition and review notes. `attested_derivative` means the inspection was recorded, not that the CLI parsed, rendered or cross-checked the derivative. Keep the inspection truthful; the CLI only checks its presence and digest. Reinspect and rebind after changing either edition or the review. A source-edition receipt alone never covers a derivative or a second HTML/Markdown file.

## 5. Report repair tracker

When a report-tools gate returns defects, retain its JSON as `defects.json` through the host's file-writing/output facilities. The tracker accepts either the check result or its defect array:

```bash
node "$SKILL_DIR/scripts/report-tools.mjs" repair decide --state "$SESSION_DIR/repair-state.json" --defects "$SESSION_DIR/defects.json" --artifact-bytes 24000 --renders 3 --session-dir "$SESSION_DIR"
```

The byte/render counts above are examples: supply measured counts. `repair` requests another correction and gate result; `deliver` ends report polishing and records residual defects; `block` prevents delivery of the affected artifact. Content-integrity defects cannot be waived by exhaustion. Defaults are three repairs, two non-improving attempts, repeated defect-code signature detection and fifteen minutes from the first decision. Delivery with residual defects needs proof of a usable rendered artifact (at least 512 bytes and one render). These are report tracker semantics, not a general execution/retry policy. A clean text report need not manufacture a render to use `outcome verify`.

## 6. Outcome schema and closing briefing

Do not hand-invent a replacement schema. `outcome.json` has `schemaVersion: 1`, `sessionDir`, ISO `startedAt`, nullable `finishedAt` and `elapsedMinutes`, `lane`, nullable `interview`, `deliverables`, `renders`, `gates`, `residualDefects`, nullable `repair` and `sources`.

- Formats: `pdf`, `docx`, `html`, `md`, `latex`, `slides`, `post`. Each row has `format`, `status`, `promised`, ISO `updatedAt`; optional `path`, `reason`, non-negative integer `bytes` and `pages`.
- Statuses: `pending`, `delivered`, `blocked_capability`, `skipped`, `failed`. Resolve every promise. `delivered` requires a real non-empty file; all other terminal statuses require a reason. Save a chat/post answer to a file for its manifest path. An extra format added by `set` has `promised: false`.
- `renders` entries are `{path, page}` with integer page >= 1. The render command records the path; it does not capture or inspect pixels.
- `gates` has all four gate keys and their actual status. `residualDefects` entries have a known `code` and `message` (additional location/detail fields can remain). `repair` and `sources` are populated by their commands.

```bash
node "$SKILL_DIR/scripts/report-tools.mjs" outcome set pdf delivered --path "$SESSION_DIR/report.pdf" --pages 12 --session-dir "$SESSION_DIR"
node "$SKILL_DIR/scripts/report-tools.mjs" outcome set docx blocked_capability --reason "no document converter available" --session-dir "$SESSION_DIR"
node "$SKILL_DIR/scripts/report-tools.mjs" outcome verify --session-dir "$SESSION_DIR"
node "$SKILL_DIR/scripts/report-tools.mjs" outcome finish --session-dir "$SESSION_DIR"
node "$SKILL_DIR/scripts/report-tools.mjs" outcome briefing --session-dir "$SESSION_DIR"
```

Run the last three in order, continuing only when verification succeeds. `verify` and `finish` both reject pending/unreasoned rows, missing/empty delivered files, or a missing, stale or failed edition receipt. They replay the check against the current edition, bindings, provenance and snapshot bytes; setting `proofread pass` or any other gate cannot bypass it. Existing `outcome.json` files remain resumable without reinitializing: add the missing evidence and check their existing delivered paths. `finish` writes time and source counts only after verification passes. `briefing` separates `verified_source_text`, `attested_derivative` and unverified editions, alongside sources, domains, elapsed minutes, statuses and residual defects. Include that printed block with the cited answer and artifact links, plus coverage/convergence and unresolved claims. A resolved failure is accounted for, not a successful artifact.

## 7. Show the HTML report

After the applicable gates and outcome verification, if this client advertises OMP's `renderEmbeds`, put the **actual verified HTML report** first in the delivery message, before the summary and other artifact links. Use a standalone iframe line with a meaningful title and the real HTML artifact path relative to the session working directory:

```html
<iframe src="doc/ulw-research/20261121-103000/report.html" title="Research report: evidence and findings"></iframe>
```

The example path is `$SESSION_DIR/report.html`, not a demo, printout or chart image. Use the verified delivered HTML path from `outcome.json`, or the complete, verified HTML source linked by the derivative receipt. Use the same bytes inspected in the browser, including citations, figures and source comparison pairs where applicable. Keep the report beside its `assets/` tree: references such as `assets/flow.svg` resolve relative to the HTML file, while the iframe path resolves from the session working directory. If the report or assets change, check the changed report before showing it. A reproduction or its preview never substitutes for the report.

If there is no verified HTML, `renderEmbeds` is absent or uncertain, or the client cannot render that report with its assets, give a clickable artifact link instead of an iframe or a claim that the report displayed. Keep the cited summary and links to all promised formats; do not create another format just to enable an embed. The client may show the HTML live or as a screenshot with a link.

## 8. Command reference

All commands are prefixed with `node "$SKILL_DIR/scripts/report-tools.mjs"`. Exit codes: `0` success, `1` semantic failure, `2` usage/IO error. JSON is stdout (briefing/probe can be text); summaries are stderr.

| Command | Flags |
| --- | --- |
| `check <report.html>` | Required `--design-spec <spec>`; optional `--layout <boxes.json>`, `--visual-requirement <value>` (values above), repeatable `--require-section <regex>`, `--max-defects N` (default 200). Exit 1 for blockers. |
| `layout-probe` | `--cap N` (400), `--root <selector>` (`main, article`), `--json`. |
| `repair decide` | Required `--state <file>`, `--defects <json>`; `--artifact-bytes N`, `--renders N`, `--session-dir <dir>`, `--max-attempts N`, `--plateau-limit N`, `--wall-clock-ms N`, `--now <ISO>`. Exit 1 for `block`. |
| `source snapshot <S-id>` | Required `--input <saved .html/.md/.txt>`, `--origin <HTTP(S) URL or absolute path>`, `--session-dir <dir>`. |
| `fact verify <edition>` | Required `--bindings <json>`, `--session-dir <dir>`. Exit 1 on missing or unsupported evidence, mismatches or unbound occurrences. Writes a receipt only on success. |
| `fact derivative <artifact>` | Required `--from <verified edition>`, `--inspection <notes.txt>`, `--session-dir <dir>`. Records an inspection-linked receipt, not an automatic check of derivative content. |
| `outcome init` | Required `--promised <comma-separated formats>`; `--lane <lane>`, `--session-dir <dir>`, `--now <ISO>`. |
| `outcome set <format> <status>` | `--path <file>`, `--pages N`, `--reason <text>`, `--session-dir <dir>`, `--now <ISO>`. |
| `outcome gate <gate> <status>` | `--session-dir <dir>`. |
| `outcome render <png>` | Required `--page N`; `--session-dir <dir>`. |
| `outcome state` | Required `--deliverable <path>`; `--session-dir <dir>`. |
| `outcome verify` | `--session-dir <dir>`; exit 1 for unresolved or unverified delivery. |
| `outcome finish` / `outcome briefing` | `--ledger <file>` (counts only, not the edition attribution ledger), `--session-dir <dir>`, `--now <ISO>`; briefing also `--json`. Finish exits 1 on the same delivery failures as verify. |
| `format-extract <reference>` | Required `--out <design-spec.md>`; `--from-url`. Unsupported references exit 2. |
| `--help` | `--json`. |
