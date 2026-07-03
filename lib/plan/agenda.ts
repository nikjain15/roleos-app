import type { AgendaItem, Plan } from "./types";

/**
 * computeAgenda — the shortest ranked list of moves that keeps the user on pace
 * (goal-engine.md §4). Derived from the plan + live tracker/shortlist state, so
 * it's always "what moves the goal," never "everything that exists." Pure.
 *
 * Until the tracker ships (Slice 3), `appsThisWeek` is 0 and the agenda leans on
 * the plan's weekly targets + the current shortlist/draft counts.
 */
export interface AgendaContext {
  plan: Plan;
  pursueRoles: number; // matches recommended "pursue"
  readyArtifacts: number; // résumé/artifacts approved & ready to send
  appsThisWeek: number; // applications sent so far this week
}

export function computeAgenda(ctx: AgendaContext): AgendaItem[] {
  const { plan } = ctx;
  const items: AgendaItem[] = [];

  if (plan.feasibility.verdict === "no_deadline") {
    return [
      {
        id: "set-goal",
        title: "Set your goal",
        detail: "Tell me the role + timeline and I'll build the plan.",
        priority: 100,
        href: "/goal",
      },
    ];
  }

  // 1 · If off pace, the single best lever leads (candid, actionable).
  if (plan.feasibility.verdict !== "on_track") {
    items.push({
      id: "lever",
      title: plan.feasibility.bestLever,
      detail: plan.feasibility.message,
      priority: 100,
      href: "/goal",
    });
  }

  // 2 · Send the applications that keep you on this week's pace.
  const behind = Math.max(0, plan.weekly.applications - ctx.appsThisWeek);
  if (behind > 0 && ctx.readyArtifacts > 0) {
    const n = Math.min(behind, ctx.readyArtifacts);
    items.push({
      id: "send",
      title: `Review + send ${n} ready application${n === 1 ? "" : "s"}`,
      detail:
        ctx.appsThisWeek > 0
          ? `${ctx.appsThisWeek}/${plan.weekly.applications} sent this week — ${behind} to go.`
          : `This week's pace is ${plan.weekly.applications}.`,
      priority: 90,
      href: "/tracker",
    });
  }

  // 3 · Approve a draft to unblock an application when nothing's ready to send.
  if (ctx.readyArtifacts === 0 && ctx.pursueRoles > 0) {
    items.push({
      id: "approve",
      title: "Approve a résumé draft — it unblocks an application",
      detail: "You have pursued roles waiting on an approved, exported résumé.",
      priority: 80,
      href: "/feed",
    });
  }

  // 4 · Keep the shortlist fed so the funnel doesn't starve.
  if (ctx.pursueRoles < plan.weekly.addRoles) {
    items.push({
      id: "shortlist",
      title: `Add roles to your shortlist (~${plan.weekly.addRoles}/week)`,
      detail: `${ctx.pursueRoles} to pursue right now — the funnel wants more supply.`,
      priority: 70,
      href: "/roles",
    });
  }

  // 5 · Once you're sending, interviews follow — prep starts to matter.
  if (plan.weekly.prepSessions > 0 && ctx.appsThisWeek > 0) {
    items.push({
      id: "prep",
      title: `Prep ${plan.weekly.prepSessions} interview session${plan.weekly.prepSessions === 1 ? "" : "s"}`,
      detail: "Applications are out — sharpening now pays off as screens land.",
      priority: 60,
      href: "/studio/coach",
    });
  }

  if (items.length === 0) {
    items.push({
      id: "on-pace",
      title: "You're on pace — nothing urgent",
      detail: plan.feasibility.message,
      priority: 10,
      href: "/roles",
    });
  }

  return items.sort((x, y) => y.priority - x.priority);
}
