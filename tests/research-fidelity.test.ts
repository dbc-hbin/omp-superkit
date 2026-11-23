import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("../skills/super-research/scripts/report-tools.mjs", import.meta.url));
const roots: string[] = [];
const origin = "https://example.org/annual-review";
const count = "The venue welcomed 12.5 million visitors.";
const excerpt = "Demand exceeded expectations.";
const countBlock = "The venue welcomed 12.5 million visitors [S1].";
const quoteBlock = `The review says “${excerpt}” [S1].`;

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function dossier() {
  const root = mkdtempSync(join(tmpdir(), "omp-research-fidelity-"));
  roots.push(root);
  const dir = join(root, "20261018-120000");
  mkdirSync(dir);
  const cli = (...args: string[]) => spawnSync("node", [cliPath, ...args, "--session-dir", dir], { encoding: "utf8" });
  const succeed = (...args: string[]) => {
    const result = cli(...args);
    expect(result.status, result.error?.message ?? result.stderr).toBe(0);
    return JSON.parse(result.stdout);
  };
  const write = (name: string, contents: string) => {
    const path = join(dir, name);
    writeFileSync(path, contents);
    return path;
  };
  const bind = (rows: readonly object[]) => write("bindings.json", JSON.stringify(rows));
  return { dir, cli, succeed, write, bind };
}

function sourcedDossier(format: "html" | "md" = "html") {
  const session = dossier();
  const { succeed, write, bind } = session;
  const source = write("observed.html", `<article><p>${count}</p><p>${excerpt}</p><p>Attendance rose by 8%.</p></article>`);
  write("sources-ledger.md", `[S1] ${origin} Annual review\n`);
  succeed("source", "snapshot", "S1", "--input", source, "--origin", origin);
  const report = write(`report.${format}`, format === "html"
    ? `<p>The venue welcomed <strong>12.5 million visitors</strong> [S1].</p><p>The review says <q>${excerpt}</q> [S1].</p>`
    : `The venue welcomed **12.5 million visitors** [S1].\n\n> ${excerpt} [S1]\n`);
  const rows = [
    { kind: "number", block: countBlock, value: "12.5 million visitors", source: "S1", excerpt: count },
    { kind: "quote", block: format === "html" ? quoteBlock : `${excerpt} [S1]`, value: excerpt, source: "S1", excerpt },
  ];
  return { ...session, report, rows, bindings: bind(rows), format };
}

function failure(result: ReturnType<ReturnType<typeof dossier>["cli"]>, codes: string[]) {
  expect(result.status, result.error?.message ?? result.stderr).toBe(1);
  expect(JSON.parse(result.stdout).problems.map((item: { code: string }) => item.code)).toEqual(codes);
}

test.each(["html", "md"] as const)("delivers the exact source-backed %s edition at outcome finish", (format) => {
  const { report, bindings, succeed } = sourcedDossier(format);
  succeed("outcome", "init", "--promised", format);
  succeed("fact", "verify", report, "--bindings", bindings);
  succeed("outcome", "set", format, "delivered", "--path", report);

  const outcome = succeed("outcome", "finish");

  expect(outcome.editions).toEqual([{ format, path: report, fidelity: "verified_source_text", facts: 2 }]);
});

test.each([
  { value: "12.5 billion visitors", sourceExcerpt: count, kind: "number", issue: "number_mismatch" },
  { value: "12.5 million dollars", sourceExcerpt: count, kind: "number", issue: "number_mismatch" },
  { value: "8 percentage points", sourceExcerpt: "Attendance rose by 8%.", kind: "number", issue: "number_mismatch" },
  { value: "12.5", sourceExcerpt: count, kind: "number", issue: "number_mismatch" },
  { value: "12.5", sourceExcerpt: count, kind: "quote", issue: "quote_mismatch" },
  { value: "Demand met expectations.", sourceExcerpt: excerpt, kind: "quote", issue: "quote_mismatch" },
] as const)("rejects $value even when the report's binding is changed to match it", ({ value, sourceExcerpt, kind, issue }) => {
  const { bind, cli, write } = sourcedDossier();
  const block = kind === "quote" ? `“${value}” [S1]` : `${value} [S1]`;
  const report = write("changed.html", `<p>${block}</p>`);
  const bindings = bind([{ kind, block, value, source: "S1", excerpt: sourceExcerpt }]);

  failure(cli("fact", "verify", report, "--bindings", bindings), [issue]);
});

test("finds unbound mentions regardless of an empty binding file or a citation", () => {
  const { bind, cli, report } = sourcedDossier();

  failure(cli("fact", "verify", report, "--bindings", bind([])), ["unbound_number", "unbound_quote"]);
});

test.each([
  { label: "negative currency", source: "$5", display: "-$5", value: "$5", kind: "number" },
  { label: "compound unit", source: "12 million square feet", display: "12 million square miles", value: "12 million square", kind: "number" },
  { label: "quoted contraction", source: "We can deliver.", display: "‘We can’t deliver.’", value: "We can", kind: "quote" },
  { label: "literal intraword underscores", source: "featureflagenabled", display: "“feature_flag_enabled”", value: "featureflagenabled", kind: "quote" },
])("does not accept a partial or misprojected $label binding", ({ source, display, value, kind }) => {
  const { cli, bind, succeed, write } = dossier();
  write("sources-ledger.md", `[S1] ${origin}\n`);
  succeed("source", "snapshot", "S1", "--input", write("source.txt", source), "--origin", origin);
  const report = write("report.md", `${display} [S1]`);
  const block = `${display.replaceAll("_", "")} [S1]`;
  const result = cli("fact", "verify", report, "--bindings", bind([{ kind, block, value, source: "S1", excerpt: source }]));
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout).ok).toBe(false);
});

test.each([
  ["entities.html", "<p>&ldquo;Measured elsewhere.&rdquo;</p>", "unbound_quote"],
  ["wrapped.txt", "“Measured\nelsewhere.”\n", "unbound_quote"],
  ["pre.html", "<h1>Summary</h1><pre>Latency: 900 ms</pre>", "unbound_number"],
  ["fence.md", "# Summary\n\n```\nLatency: 900 ms\n```\n", "unbound_number"],
])("inspects displayed facts in %s without a binding", (file, contents, issue) => {
  const { cli, write, bind } = dossier();
  failure(cli("fact", "verify", write(file, contents), "--bindings", bind([])), [issue]);
});

test("rejects exchanged source markers even when both sources occur in the report paragraph", () => {
  const { cli, succeed, write, bind } = dossier();
  write("sources-ledger.md", `[S1] ${origin}/first\n[S2] ${origin}/second\n`);
  succeed("source", "snapshot", "S1", "--input", write("first.txt", "Alpha."), "--origin", `${origin}/first`);
  succeed("source", "snapshot", "S2", "--input", write("second.txt", "Beta."), "--origin", `${origin}/second`);
  const block = "“Alpha.” [S2]. “Beta.” [S1].";
  const bindings = bind([["Alpha.", "S1"], ["Beta.", "S2"]].map(([value, source]) => ({
    kind: "quote", block, value, source, excerpt: value,
  })));
  failure(cli("fact", "verify", write("report.md", block), "--bindings", bindings), ["binding_citation_ambiguous", "binding_citation_ambiguous"]);
});

test("does not borrow a bare value from a differently labeled single-column table", () => {
  const { cli, succeed, write, bind } = dossier();
  write("sources-ledger.md", `[S1] ${origin}\n`);
  succeed("source", "snapshot", "S1", "--input", write("source.txt", "The count was 12."), "--origin", origin);
  const report = write("report.html", "<table><tr><th>USD millions</th></tr><tr><td>12 [S1]</td></tr></table>");
  const bindings = bind([{ kind: "number", block: "12 [S1]", value: "12", source: "S1", excerpt: "The count was 12." }]);
  failure(cli("fact", "verify", report, "--bindings", bindings), ["table_unit_missing"]);
});

test("binds a standalone calendar year when surrounding prose is reordered", () => {
  const { succeed, write, bind } = dossier();
  write("sources-ledger.md", `[S1] ${origin}\n`);
  const excerpt = "In 2024 revenue grew.";
  succeed("source", "snapshot", "S1", "--input", write("source.txt", excerpt), "--origin", origin);
  const block = "Revenue grew in 2024 [S1].";
  const verified = succeed("fact", "verify", write("report.md", block), "--bindings", bind([{ kind: "number", block, value: "2024", source: "S1", excerpt }]));
  expect(verified.ok).toBe(true);
});

test("will not finalize a v1 manifest with old pass labels and no fidelity receipt", () => {
  const { cli, dir, succeed, write } = dossier();
  const report = write("legacy.md", "The venue welcomed 12.5 million visitors [S1].\n");
  succeed("outcome", "init", "--promised", "md");
  succeed("outcome", "set", "md", "delivered", "--path", report);
  succeed("outcome", "gate", "proofread", "pass");
  const manifest = readFileSync(join(dir, "outcome.json"), "utf8");

  failure(cli("outcome", "finish"), ["fidelity_receipt_missing"]);

  expect(readFileSync(join(dir, "outcome.json"), "utf8")).toBe(manifest);
});

test.each([
  { changed: "edition", issue: "artifact_changed" },
  { changed: "receipt", issue: "fidelity_receipt_missing" },
  { changed: "source", issue: "snapshot_missing" },
  { changed: "source attribution", issue: "source_attribution" },
  { changed: "bindings", issue: "bindings_changed" },
] as const)("fails outcome verify after $changed no longer matches the original evidence", ({ changed, issue }) => {
  const { bind, bindings, cli, dir, report, rows, succeed, write } = sourcedDossier();
  succeed("outcome", "init", "--promised", "html");
  succeed("outcome", "set", "html", "delivered", "--path", report);
  const { receipt } = succeed("fact", "verify", report, "--bindings", bindings);
  if (changed === "edition") write("report.html", readFileSync(report, "utf8").replace("12.5", "99.9"));
  if (changed === "receipt") rmSync(receipt);
  if (changed === "source") rmSync(join(dir, "source-snapshots", "S1", "raw"));
  if (changed === "source attribution") write("sources-ledger.md", "[S1] https://example.net/different Annual review\n");
  if (changed === "bindings") bind(rows.slice(1));

  failure(cli("outcome", "verify"), [issue]);
});

test("a post without numbers or quotes verifies without inventing source bindings", () => {
  const { bind, succeed, write } = dossier();
  const report = write("post.txt", "We could not establish a causal relationship.\n");
  succeed("outcome", "init", "--promised", "post");
  succeed("outcome", "set", "post", "delivered", "--path", report);
  succeed("fact", "verify", report, "--bindings", bind([]));

  expect(succeed("outcome", "verify").editions).toEqual([{ format: "post", path: report, fidelity: "verified_source_text", facts: 0 }]);
});

test("an inspected rendered derivative is bound to the source receipt but not reported as automatically verified", () => {
  const { bindings, report, succeed, write } = sourcedDossier("md");
  const derivative = write("report.tex", "\\documentclass{article}\n\\begin{document}\nThe venue welcomed 12.5 million visitors [S1].\n\\begin{quote}Demand exceeded expectations.\\end{quote}\n\\end{document}\n");
  const inspection = write("inspect.txt", "Compared the amount and quote in the TeX edition to the source edition.\n");
  succeed("outcome", "init", "--promised", "latex");
  succeed("fact", "verify", report, "--bindings", bindings);
  succeed("fact", "derivative", derivative, "--from", report, "--inspection", inspection);
  succeed("outcome", "set", "latex", "delivered", "--path", derivative);

  expect(succeed("outcome", "verify").editions).toEqual([
    { format: "latex", path: derivative, fidelity: "attested_derivative", from: report, inspection },
  ]);
});
