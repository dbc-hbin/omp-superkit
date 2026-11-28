import type { SuperSessionEntry } from "./super";

type Evidence = {
  readonly kind: "user" | "observation" | "assistant";
  readonly text: string;
  readonly time: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messageTime(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15
    ? value : undefined;
}

function journalTime(value: unknown): number | undefined {
  if (typeof value !== "string") return;
  const time = messageTime(Date.parse(value));
  // SessionManager persists Date#toISOString(), not the permissive Date.parse input grammar.
  if (time !== undefined && new Date(time).toISOString() === value) return time;
}

function publicText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap(block =>
    isRecord(block) && block.type === "text" && typeof block.text === "string" ? [block.text] : [],
  ).join("\n");
}

function nativeText(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return;
  const [first, ...attachments] = content;
  if (isRecord(first) && first.type === "text" && typeof first.text === "string" &&
    attachments.every(block => isRecord(block) && block.type === "image")) return first.text;
}

const deliverySource = "background job delivery";
const jobHeader = /^── Job ([^\s()]+)(?: \([^\r\n]*\))? ──$/;

function completeCapture(meta: unknown): boolean {
  if (meta === undefined) return true;
  if (!isRecord(meta) || Object.keys(meta).some(key => key !== "source")) return false;
  const { source } = meta;
  return source === undefined || (isRecord(source) && typeof source.value === "string" && Boolean(source.value) &&
    (source.type === "path" || source.type === "url" || source.type === "internal"));
}

function deliveredOutput(content: string, details: unknown): string | undefined {
  if (!isRecord(details) || !isRecord(details.meta) || !isRecord(details.meta.source) ||
    details.meta.source.type !== "report" || details.meta.source.value !== deliverySource ||
    !Array.isArray(details.jobs) || !details.jobs.length) return;

  const jobs: { id: string; process: boolean; failed: boolean }[] = [];
  const ids = new Set<string>();
  for (const job of details.jobs) {
    if (!isRecord(job) || typeof job.jobId !== "string" || !/^[^\s()<>]+$/.test(job.jobId) ||
      ids.has(job.jobId) || (job.type !== "bash" && job.type !== "task" && job.type !== "eval") ||
      (job.status !== "completed" && job.status !== "failed")) return;
    ids.add(job.jobId);
    // Per-job metadata can mark a capture as partial, shaped, or a report.
    const process = job.type === "bash" && job.agentId === undefined && job.schema === undefined &&
      completeCapture(job.meta);
    jobs.push({ id: job.jobId, process, failed: job.status === "failed" });
  }
  if (!jobs.some(job => job.process)) return;

  const envelope = /^<system-notice>\n([\s\S]*)\n<\/system-notice>$/.exec(content.trimEnd());
  if (!envelope) return;
  const notice = envelope[1];
  // The host escapes these tags in all interpolated fields of the notice.
  if (/<(?=\s*\/?\s*(?:irc|tangent-notice|system-[a-z][a-z-]*)(?![\w-]))/i.test(notice)) return;

  if (jobs.length === 1) {
    const header = /^Background job ([^\s()]+)(?: \([^\r\n]*\))? has completed\.\nResume your work using the result below\.\n+/.exec(notice);
    if (header?.[1] === jobs[0].id) return processOutput(notice.slice(header[0].length), jobs[0].failed);
    return;
  }

  const intro = `${jobs.length} background jobs have completed. Resume your work using the results below.\n`;
  if (!notice.startsWith(intro)) return;
  const batch = notice.slice(intro.length).trimStart();
  const headers = [...batch.matchAll(/^── Job [^\n]*$/gm)];
  // An output line can imitate a header. Never take a segment unless every header
  // accounts for exactly one job and agrees with the structured order.
  if (headers.length !== jobs.length || headers[0].index !== 0 ||
    headers.some((header, index) => jobHeader.exec(header[0])?.[1] !== jobs[index].id)) return;

  const output = jobs.flatMap((job, index) => {
    if (!job.process) return [];
    const header = headers[index];
    return processOutput(batch.slice(header.index + header[0].length, headers[index + 1]?.index), job.failed) ?? [];
  });
  // Keep job boundaries visible so a quotation cannot splice two outputs.
  return output.length ? output.join("\n\0\n") : undefined;
}

function processOutput(payload: string, failed: boolean): string | undefined {
  const text = payload.trim();
  if (/^(?:User's \/tan tangent,|Structured output:|Agent: (?:agent|history):\/\/|<\/?task-result\b|\[exit code )/m.test(text) ||
    /^(?:\[Output truncated\b|\[raw output:|Full output: local:\/\/)/m.test(text)) return;
  // Failed async jobs can also be execution-layer exceptions. Only a captured
  // command with the native final exit-status footer supplies terminal output.
  if (failed && !/\nCommand exited with code -?[1-9]\d*$/.test(text)) return;
  const footer = /^(?:Wall time: \d+\.\d{2} seconds$|Command exited with code -?\d+$|Reset before the next call:|Ran in a copy of the busy session shell;|Background jobs started here run in a copy of the busy session shell;|Write to [\w+.-]+:\/\/|(?:out|proc|agent|history|local):\/\/\S*: )/m.exec(text);
  const output = (footer ? text.slice(0, footer.index) : text).trim();
  if (output && !/^\(no output(?:, exit code 0)?\)$/.test(output)) return output;
}

function customEvidence(message: {
  readonly customType?: unknown;
  readonly attribution?: unknown;
  readonly display?: unknown;
  readonly excludeFromContext?: unknown;
  readonly content?: unknown;
  readonly details?: unknown;
}, time: number): Evidence | undefined {
  if (message.display !== true || (message.excludeFromContext !== undefined && message.excludeFromContext !== false)) return;
  const text = nativeText(message.content);
  if (!text?.trim()) return;

  if (message.customType === "skill-prompt" && message.attribution === "user") {
    // The rendered envelope can contain arbitrary SKILL.md text and expanded
    // mentions. OMP persists the unexpanded, user-supplied arguments separately.
    const { details } = message;
    const header = /^\[IMPORTANT: User invoked the "([^"\r\n]+)" skill; follow its instructions\. Full skill below\.\]\r?\n/.exec(text);
    if (header && isRecord(details) && details.name === header[1] &&
      typeof details.path === "string" && details.path.trim() &&
      (details.args === undefined || typeof details.args === "string")) {
      return { kind: "user", text: details.args ?? "", time };
    }
  }
  if (message.customType === "async-result" && message.attribution === "agent") {
    const output = deliveredOutput(text, message.details);
    if (output) return { kind: "observation", text: output, time };
  }
}

export function goalEvidence(entry: SuperSessionEntry): Evidence | undefined {
  if (entry.type === "custom_message") {
    const time = journalTime(entry.timestamp);
    if (time !== undefined) return customEvidence(entry, time);
    return;
  }
  if (entry.type !== "message" || !isRecord(entry.message)) return;
  const message = entry.message;
  const time = messageTime(message.timestamp);
  if (time === undefined) return;
  if (message.role === "custom") return customEvidence(message, time);
  if (message.excludeFromContext === true) return;
  const text = publicText(message.content);
  if (message.role === "user" && (message.attribution === undefined || message.attribution === "user") &&
    message.synthetic !== true && message.parentIrc === undefined) {
    return { kind: "user", text, time };
  }
  if (message.role === "assistant" && text) return { kind: "assistant", text, time };
  if (message.role === "toolResult" && typeof message.toolName === "string" && message.toolName &&
    !["ask", "goal", "todo"].includes(message.toolName) && text.trim()) {
    return { kind: "observation", text: text.trim(), time };
  }
}
