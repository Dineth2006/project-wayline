/**
 * Driver performance stats — pure computation, no Firebase.
 * Built from the append-only `events/<busId>` log (crash, harsh_brake,
 * harsh_accel, obstacle, deviation) plus accumulated `ratings/<busId>`.
 */

export interface DriverEvent {
  type: string;
  value?: number;
  ts: number;
}

export interface RatingRec {
  uid?: string;
  stars?: number;
  ts?: number;
}

export interface DriverStats {
  busId: string;
  driverName: string;
  driverUid?: string;
  plate?: string;
  routeName?: string;
  online: boolean;
  lastActive?: number;
  lastSpeed?: number;
  forceStopped: boolean;
  counts: {
    crash: number;
    deviation: number;
    harsh_brake: number;
    harsh_accel: number;
    obstacle: number;
    other: number;
  };
  harshTotal: number;
  totalIncidents: number;
  windowDays: number;
  windowIncidents: number; // incidents inside the recent window
  ratingAvg?: number;
  ratingCount: number;
  ratingBreakdown: number[]; // index 0..4 = stars 1..5 count
  safetyScore: number; // 0–100, higher = better
  incidents: DriverEvent[]; // newest first, capped at 50
}

const CAP = 50;

/**
 * Compute a driver summary for one bus.
 * @param windowDays  recent-activity window used for "recent incidents" (default 7)
 */
export function computeDriverStats(
  args: {
    busId: string;
    driverName?: string;
    driverUid?: string;
    plate?: string;
    routeName?: string;
    online?: boolean;
    lastActive?: number;
    lastSpeed?: number;
    forceStopped?: boolean;
  },
  events: DriverEvent[],
  ratings: RatingRec[],
  windowDays = 7,
): DriverStats {
  const counts = {
    crash: 0,
    deviation: 0,
    harsh_brake: 0,
    harsh_accel: 0,
    obstacle: 0,
    other: 0,
  };
  const sorted = [...events].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
  const now = Date.now();
  const windowMs = windowDays * 86_400_000;
  let windowIncidents = 0;

  for (const e of sorted) {
    switch (e.type) {
      case "crash": counts.crash++; break;
      case "deviation": counts.deviation++; break;
      case "harsh_brake": counts.harsh_brake++; break;
      case "harsh_accel": counts.harsh_accel++; break;
      case "obstacle": counts.obstacle++; break;
      default: counts.other++;
    }
    if (e.ts && now - e.ts <= windowMs) windowIncidents++;
  }

  const harshTotal = counts.harsh_brake + counts.harsh_accel;
  const totalIncidents =
    counts.crash + counts.deviation + harshTotal + counts.obstacle + counts.other;

  // ratings
  const ratingBreakdown = [0, 0, 0, 0, 0];
  let starSum = 0;
  let ratingCount = 0;
  for (const r of ratings) {
    const s = Math.round(r.stars ?? 0);
    if (s >= 1 && s <= 5) {
      starSum += s;
      ratingCount++;
      ratingBreakdown[s - 1]++;
    }
  }

  // safety score: start at 100, penalise by severity (window + history blend)
  const recentCrash = sorted.filter((e) => e.type === "crash" && e.ts && now - e.ts <= windowMs).length;
  const recentHarsh = sorted.filter(
    (e) => (e.type === "harsh_brake" || e.type === "harsh_accel") && e.ts && now - e.ts <= windowMs,
  ).length;
  const recentDev = sorted.filter((e) => e.type === "deviation" && e.ts && now - e.ts <= windowMs).length;

  let score = 100;
  score -= recentCrash * 25; // recent crashes hurt most
  score -= (counts.crash - recentCrash) * 10; // older crashes still count
  score -= recentDev * 5;
  score -= recentHarsh * 1.5;
  score -= (harshTotal - recentHarsh) * 0.5;
  const safetyScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    busId: args.busId,
    driverName: args.driverName ?? "Unassigned driver",
    driverUid: args.driverUid,
    plate: args.plate,
    routeName: args.routeName,
    online: !!args.online,
    lastActive: args.lastActive,
    lastSpeed: args.lastSpeed,
    forceStopped: !!args.forceStopped,
    counts,
    harshTotal,
    totalIncidents,
    windowDays,
    windowIncidents,
    ratingAvg: ratingCount ? starSum / ratingCount : undefined,
    ratingCount,
    ratingBreakdown,
    safetyScore,
    incidents: sorted.slice(0, CAP),
  };
}

/** "3h ago" style relative time for the incident log. */
export function timeAgo(ts?: number): string {
  if (!ts) return "—";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/** Human label for an event type. */
export function eventLabel(type: string): string {
  switch (type) {
    case "crash": return "Crash";
    case "deviation": return "Route deviation";
    case "harsh_brake": return "Harsh braking";
    case "harsh_accel": return "Hard acceleration";
    case "obstacle": return "Obstacle detected";
    default: return type;
  }
}

/** Verdict line used on the report + PDF. */
export function verdict(score: number): string {
  if (score >= 90) return "Excellent — safe driving record";
  if (score >= 75) return "Good — minor issues to monitor";
  if (score >= 50) return "Fair — review recommended";
  return "Poor — corrective action advised";
}
