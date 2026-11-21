import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type TaskStatus = "pending" | "complete" | "blocked";
type Continuation = { readonly fingerprint: string; readonly reason: string };

// Section and task-label grammar adapted from OMO v5.1.79 boulder-state/src/plan-checklist.ts.
// Unlike OMO's fallback, an empty structured plan never counts rows from unrelated sections.
const todoHeading = /^##[ \t]+Todos(?:[ \t]+#+)?[ \t]*$/i;
const finalHeading = /^##[ \t]+Final verification wave(?:[ \t]+#+)?[ \t]*$/i;
const sectionHeading = /^ {0,3}#{1,2}(?:[ \t]+|$)/;
const simpleRow = /^[-*][ \t]*\[[ \t]*([xX~]?)[ \t]*\][ \t]+\S/;
const taskRow = /^- \[([ xX~])\] (.+)$/;
const todoLabel = /^(?:[1-9]\d*|T[1-9]\d*(?:\.[1-9]\d*[a-z]?)?)(?:\.[ \t]+|[ \t]+(?:[-\u2014][ \t]+)?)\S/i;
const finalLabel = /^[FH][1-9]\d*(?:\.[1-9]\d*[a-z]?)?(?:\.[ \t]+|[ \t]+(?:[-\u2014][ \t]+)?)\S/i;

function taskStatus(marker: string): TaskStatus {
  if (marker === "~") return "blocked";
  return marker.trim() ? "complete" : "pending";
}

function diskTaskStatuses(markdown: string): readonly TaskStatus[] {
  const legacy: TaskStatus[] = [];
  const structured: TaskStatus[] = [];
  let hasSections = false;
  let labels: RegExp | undefined;
  let fence: RegExp | undefined;
  let inComment = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (fence) {
      if (fence.test(line)) fence = undefined;
      continue;
    }
    if (inComment || /^ {0,3}<!--/.test(line)) {
      inComment = !line.includes("-->");
      continue;
    }
    const opener = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (opener && (opener[1].startsWith("~") || !opener[2].includes("`"))) {
      const delimiter = opener[1];
      fence = new RegExp(`^ {0,3}${delimiter[0]}{${delimiter.length},}[ \\t]*$`);
      continue;
    }
    if (sectionHeading.test(line)) {
      labels = todoHeading.test(line) ? todoLabel : finalHeading.test(line) ? finalLabel : undefined;
      hasSections ||= labels !== undefined;
      continue;
    }
    const task = taskRow.exec(line);
    if (task && labels?.test(task[2])) structured.push(taskStatus(task[1]));
    const simple = simpleRow.exec(line);
    if (simple) legacy.push(taskStatus(simple[1]));
  }
  return hasSections ? structured : legacy;
}

export function readContinuation(cwd: string, sessionId: string): Continuation | undefined {
  const boulderPath = join(cwd, "doc/boulder.json");
  if (existsSync(boulderPath)) {
    const raw = readFileSync(boulderPath, "utf8");
    const boulder: unknown = JSON.parse(raw);
    if (typeof boulder === "object" && boulder !== null && "works" in boulder && typeof boulder.works === "object" && boulder.works !== null) {
      for (const work of Object.values(boulder.works)) {
        if (typeof work !== "object" || work === null || !("status" in work) || work.status !== "active" || !("session_ids" in work) || !Array.isArray(work.session_ids) || !work.session_ids.includes("omp:" + sessionId) || !("active_plan" in work) || typeof work.active_plan !== "string") continue;
        const nativePlan = work.active_plan.startsWith("local://");
        const planPath = nativePlan ? work.active_plan : join(cwd, work.active_plan);
        let plan = "";
        let statuses: readonly TaskStatus[];
        if (nativePlan) {
          if (!("execution_tasks" in work) || !Array.isArray(work.execution_tasks)) continue;
          const tasks: unknown[] = work.execution_tasks;
          if (!tasks.every((task): task is { readonly plan_ref: string; readonly status: TaskStatus } =>
            typeof task === "object" && task !== null && "plan_ref" in task && typeof task.plan_ref === "string" && task.plan_ref.trim() !== "" &&
            "status" in task && (task.status === "pending" || task.status === "complete" || task.status === "blocked"))) continue;
          statuses = tasks.map(task => task.status);
        } else {
          if (!existsSync(planPath)) continue;
          plan = readFileSync(planPath, "utf8");
          statuses = diskTaskStatuses(plan);
        }
        if (statuses.length === 0) continue;
        const pending = statuses.includes("pending");
        const blocked = statuses.includes("blocked");
        if (!pending && blocked) continue;
        return {
          fingerprint: raw + plan,
          reason: `Resume ulw-execute from ${boulderPath} and ${planPath}; ${nativePlan ? "preserve the approved local plan and use this work's execution_tasks for progress; reuse its authoritative inline copy or read the URI through OMP, never as a filesystem path. " : ""}${pending
            ? "integrate pending child results and execute the next dependency-ready pending task, including pending Final Verification Wave rows; capture evidence and update Boulder/ledger"
            : "all execution tasks are verified; finish the approved verification and authorized delivery, then mark the Boulder work complete and finalize its ledger"}.${blocked ? " Treat blocked tasks ([~] rows or execution_tasks status blocked) and transitive dependents as terminal non-success; never reopen or re-queue them. Final verification checks delivered work and reports known gaps without treating those gaps alone as new failures. When pending work ends, report every unmet gap, mark Boulder blocked and stop without claiming success." : ""} Respect cancellation, approvals and blocked/paused state.`,
        };
      }
    }
  }
  const loopPath = join(cwd, "doc/ulw-loop", sessionId, "goals.json");
  if (!existsSync(loopPath)) return;
  const raw = readFileSync(loopPath, "utf8");
  const loop: unknown = JSON.parse(raw);
  if (typeof loop !== "object" || loop === null || !("status" in loop) || loop.status !== "active" || !("goals" in loop) || !Array.isArray(loop.goals)) return;
  const goals: unknown[] = loop.goals;
  if (goals.some(goal => typeof goal === "object" && goal !== null && "status" in goal && (goal.status === "pending" || goal.status === "in_progress"))) {
    return {
      fingerprint: raw,
      reason: `Resume the owning workflow from ${loopPath} and its linked brief/ledger; continue the next eligible goal under that workflow's criteria, capture criterion evidence, and checkpoint only after all gates pass. Shared loop-format state does not select ulw-loop: preserve standalone research ownership and its source/citation requirements. Do not re-plan completed work. Respect cancellation, approvals and blocked/paused state.`,
    };
  }
}
