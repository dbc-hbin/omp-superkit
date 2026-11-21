import { readContinuation } from "./ulw-continuation";
import type { UlwApi, UlwContext, UlwGoalEvent } from "./ulw";

const controlType = "omo-ultrawork:continuation";
const ownerType = "omo-ultrawork:goal-owner";
const disabledFlag = "omo-ulw-continuation-disabled";
type Control = { readonly sessionId: string; readonly stopped: boolean; readonly pausedGoalId?: string };
type Goal = NonNullable<UlwGoalEvent["goal"]>;

function isGoal(value: unknown): value is Required<Goal> {
  return typeof value === "object" && value !== null &&
    "id" in value && typeof value.id === "string" &&
    "objective" in value && typeof value.objective === "string" &&
    "status" in value && typeof value.status === "string";
}

function nativeHint(ctx: UlwContext, action: "pause" | "resume"): string {
  return ctx.mode === "rpc"
    ? `Use OMP's native goal RPC command with op=${action} to manage that goal separately.`
    : `Use OMP's /goal ${action} control for that goal.`;
}

export function registerContinuationControls(pi: UlwApi, resetProgress: (fingerprint?: string) => void) {
  pi.registerFlag(disabledFlag, { description: "Disable ULW loop/execute continuation", type: "boolean", default: false });
  let sessionId: string | undefined;
  let control: Control | undefined;
  let nativeGoal: Goal | undefined;
  let ownedGoalId: string | undefined;
  let expectedObjective: string | undefined;

  const restore = (ctx: UlwContext) => {
    const id = ctx.sessionManager.getSessionId();
    sessionId = id;
    control = undefined;
    nativeGoal = undefined;
    ownedGoalId = undefined;
    expectedObjective = undefined;
    const branch = ctx.sessionManager.getBranch();
    // A stop is session-wide, not tied to the leaf selected in the history tree.
    // A copied transcript can contain another session's records, which never apply here.
    for (const entry of ctx.sessionManager.getEntries?.() ?? branch) {
      if (entry.type !== "custom" || typeof entry.data !== "object" || entry.data === null ||
        !("sessionId" in entry.data) || entry.data.sessionId !== id) continue;
      if (entry.customType === controlType && "stopped" in entry.data && typeof entry.data.stopped === "boolean") {
        const pausedGoalId = "pausedGoalId" in entry.data && typeof entry.data.pausedGoalId === "string" ? entry.data.pausedGoalId : undefined;
        control = { sessionId: id, stopped: entry.data.stopped, pausedGoalId };
      }
      if (entry.customType === ownerType && "goalId" in entry.data && typeof entry.data.goalId === "string") {
        ownedGoalId = entry.data.goalId;
      }
    }
    const mode = branch.findLast(entry => entry.type === "mode_change");
    if ((mode?.mode === "goal" || mode?.mode === "goal_paused") && typeof mode.data === "object" &&
      mode.data !== null && "goal" in mode.data && isGoal(mode.data.goal)) nativeGoal = mode.data.goal;
  };
  const syncSession = (ctx: UlwContext) => {
    if (sessionId !== ctx.sessionManager.getSessionId()) restore(ctx);
  };

  pi.on("goal_updated", (event, ctx) => {
    syncSession(ctx);
    nativeGoal = event.goal ?? undefined;
    if (ctx.agent.kind !== "main" || !expectedObjective || !isGoal(nativeGoal) ||
      nativeGoal.status !== "active" || nativeGoal.objective !== expectedObjective) return;
    expectedObjective = undefined;
    ownedGoalId = nativeGoal.id;
    pi.appendEntry(ownerType, { sessionId: ctx.sessionManager.getSessionId(), goalId: ownedGoalId });
  });

  const save = async (ctx: UlwContext, next: Control) => {
    pi.appendEntry(controlType, next);
    control = next;
    resetProgress();
    await ctx.sessionManager.ensureOnDisk?.();
  };
  const read = (ctx: UlwContext) => {
    try {
      return readContinuation(ctx.cwd, ctx.sessionManager.getSessionId());
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      ctx.ui.notify(`ULW continuation: state could not be read: ${error.message}`, "warning");
      return null;
    }
  };
  const canControl = (args: string, ctx: UlwContext, command: string) => {
    if (ctx.agent.kind !== "main") return false;
    if (args.trim()) {
      ctx.ui.notify(`/${command} takes no arguments.`, "warning");
      return false;
    }
    syncSession(ctx);
    return true;
  };

  pi.registerCommand("stop-continuation", {
    description: "Stop automatic ULW continuation in this session without discarding its work",
    handler: async (args, ctx) => {
      if (!canControl(args, ctx, "stop-continuation")) return;
      const id = ctx.sessionManager.getSessionId();
      if (!control?.stopped) await save(ctx, { sessionId: id, stopped: true });
      if (sessionId !== id || id !== ctx.sessionManager.getSessionId()) return;
      const goal = nativeGoal;
      const modes = ctx.sessionModes;
      const hostGoal = modes?.getState().goal;
      if (hostGoal?.status !== "active" && goal?.status !== "active") {
        ctx.ui.notify("ULW continuation stopped for this session. Work and artifacts were kept.", "info");
        return;
      }
      if (!modes || !isGoal(goal) || goal.status !== "active" || goal.id !== ownedGoalId ||
        hostGoal?.status !== "active" || hostGoal.objective !== goal.objective) {
        ctx.ui.notify(`ULW continuation stopped for this session; the native goal was not paused. ${nativeHint(ctx, "pause")}`, "warning");
        return;
      }
      const result = await modes.set({ mode: "goal", action: "pause" });
      if (sessionId !== id || id !== ctx.sessionManager.getSessionId()) return;
      if (!result.ok || !result.changed || result.state.goal.status !== "paused" || result.state.goal.objective !== goal.objective) {
        const detail = result.ok ? "OMP did not confirm the pause." : result.message;
        ctx.ui.notify(`ULW continuation stopped for this session; native goal pause not confirmed: ${detail} ${nativeHint(ctx, "pause")}`, "warning");
        return;
      }
      await save(ctx, { sessionId: id, stopped: true, pausedGoalId: goal.id });
      ctx.ui.notify("ULW continuation stopped for this session and its native goal was paused. Work and artifacts were kept.", "info");
    },
  });

  pi.registerCommand("resume-continuation", {
    description: "Explicitly resume this session's stopped ULW continuation",
    handler: async (args, ctx) => {
      if (!canControl(args, ctx, "resume-continuation")) return;
      if (pi.getFlag(disabledFlag)) {
        ctx.ui.notify("ULW continuation is disabled by --omo-ulw-continuation-disabled; no work was resumed.", "warning");
        return;
      }
      if (!control?.stopped) {
        ctx.ui.notify("No explicit ULW continuation stop is recorded for this session.", "info");
        return;
      }
      const id = ctx.sessionManager.getSessionId();
      const goal = nativeGoal;
      const modes = ctx.sessionModes;
      const hostGoal = modes?.getState().goal;
      if (modes && isGoal(goal) && goal.status === "paused" && goal.id === control.pausedGoalId &&
        hostGoal?.status === "paused" && hostGoal.objective === goal.objective) {
        const result = await modes.set({ mode: "goal", action: "resume" });
        if (sessionId !== id || id !== ctx.sessionManager.getSessionId()) return;
        if (!result.ok || !result.changed || result.state.goal.status !== "active" || result.state.goal.objective !== goal.objective) {
          const detail = result.ok ? "OMP did not confirm the resume." : result.message;
          ctx.ui.notify(`ULW continuation remains stopped; native goal resume not confirmed: ${detail} ${nativeHint(ctx, "resume")}`, "warning");
          return;
        }
        await save(ctx, { sessionId: id, stopped: false });
        ctx.ui.notify("This session's native goal resumed. OMP controls its scheduling.", "info");
        return;
      }
      if (hostGoal?.status === "active" || goal?.status === "active") {
        await save(ctx, { sessionId: id, stopped: false });
        ctx.ui.notify("ULW continuation re-enabled for this session. The active native goal was unchanged and no ULW turn was queued.", "info");
        return;
      }
      const work = read(ctx);
      if (work === null) return;
      if (!work) {
        const guidance = goal?.status === "paused" || hostGoal?.status === "paused" ? ` ${nativeHint(ctx, "resume")}` : "";
        await save(ctx, { sessionId: id, stopped: false });
        ctx.ui.notify(`ULW continuation re-enabled for this session. No eligible work was queued.${guidance}`, "info");
        return;
      }
      await save(ctx, { sessionId: id, stopped: false });
      if (sessionId !== id || id !== ctx.sessionManager.getSessionId() || control?.stopped) return;
      resetProgress(work.fingerprint);
      pi.sendUserMessage(work.reason);
      ctx.ui.notify("Requested resumption of this session's ULW work.", "info");
    },
  });

  return {
    read,
    restore,
    isEnabled: () => !pi.getFlag(disabledFlag),
    isStopped(ctx: UlwContext): boolean {
      syncSession(ctx);
      return control?.stopped === true;
    },
    hasNativeGoal(ctx: UlwContext): boolean {
      syncSession(ctx);
      const status = nativeGoal?.status;
      const host = ctx.sessionModes?.getState().goal.status;
      return host === "active" || host === "paused" || (status !== undefined && status !== "complete" && status !== "dropped");
    },
    expectGoal(ctx: UlwContext, objective: string | undefined) {
      syncSession(ctx);
      expectedObjective = objective;
    },
  };
}
