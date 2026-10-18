import { clamp, dist, distToSegment } from "./geometry";
import type { Pt, Route } from "./types";

export interface RouteProgress {
  /** distance along the route (m) of the nearest polyline point */
  distAlong: number;
  total: number; // total route length (m)
  nextStop: { name: string; idx: number; dist: number } | null;
  /** remaining distance (m) until the next pass of the next stop */
  nextStopDist: number;
  /** per-stop remaining distance in stop order, starting at the next stop */
  stops: { name: string; dist: number }[];
}

/** Project a bus position onto its route and compute upcoming stops / distances. */
export function routeProgress(p: Pt, route: Route): RouteProgress {
  const pts = route.points;
  const closed = route.closed ?? true;
  const n = closed ? pts.length : pts.length - 1;

  // cumulative length of each segment
  const cum: number[] = [0];
  for (let i = 0; i < n; i++) {
    cum.push(cum[i] + dist(pts[i], pts[(i + 1) % pts.length]));
  }
  const total = cum[n];

  // nearest point on the polyline
  let best = Infinity;
  let bestAlong = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = dist(a, b) || 1e-6;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (len * len), 0, 1);
    const d = distToSegment(p, a, b);
    if (d < best) {
      best = d;
      bestAlong = cum[i] + t * len;
    }
  }

  // where does each named stop sit along the route?
  const stopAlong = (route.stops ?? []).map((s) => {
    let idx = pts.findIndex((pt) => dist(pt, s) < 1e-3);
    if (idx === -1) {
      // fall back to nearest route point
      idx = 0;
      let bd = Infinity;
      pts.forEach((pt, i) => {
        const dd = dist(pt, s);
        if (dd < bd) {
          bd = dd;
          idx = i;
        }
      });
    }
    return { name: s.name, along: cum[idx % pts.length], idx };
  });

  const remaining = (along: number) => {
    const d = (along - bestAlong + total) % total;
    return d < 1e-3 ? total - 1e-3 : d;
  };

  const stops = stopAlong
    .map((s) => ({ name: s.name, idx: s.idx, dist: remaining(s.along) }))
    .sort((a, b) => a.dist - b.dist);

  return {
    distAlong: bestAlong,
    total,
    nextStop: stops[0] ?? null,
    nextStopDist: stops[0]?.dist ?? 0,
    stops,
  };
}

/** ETA seconds for a distance at a speed in cm/s. null when not moving. */
export function etaSeconds(distM: number, speedCmS: number): number | null {
  if (!isFinite(distM) || speedCmS <= 5) return null;
  return (distM / (speedCmS / 100)) / 1;
}

export function formatClock(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDistance(m: number) {
  if (!isFinite(m)) return "—";
  if (m < 1) return `${Math.round(m * 100)} cm`;
  return `${m.toFixed(1)} m`;
}
