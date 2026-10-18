"use client";
import { useValue } from "@/hooks/useRealtime";
import { clamp } from "@/lib/geometry";
import type { BusEvent } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Card } from "./Card";
import { Star } from "lucide-react";

const LABEL: Record<string, string> = {
  harsh_brake: "Harsh braking",
  harsh_accel: "Harsh acceleration",
  obstacle: "Obstacle stops",
  deviation: "Route deviations",
  crash: "Crashes",
  force_stop: "Operator stops",
  resume: "Resumed",
};
const PENALTY: Record<string, number> = {
  harsh_brake: 5,
  harsh_accel: 5,
  obstacle: 2,
  deviation: 10,
  crash: 25,
};

/** Trip behaviour report: score + passenger rating + event breakdown. */
export function DriverSummary({
  busId,
  driverName,
}: {
  busId: string;
  driverName?: string;
}) {
  const events = useValue<Record<string, BusEvent>>(`events/${busId}`) ?? {};
  const ratings = useValue<Record<string, { stars: number }>>(`ratings/${busId}`) ?? {};
  const list = Object.values(events).sort((a, b) => b.ts - a.ts);
  const count = (t: string) => list.filter((e) => e.type === t).length;
  const score = clamp(
    100 - Object.entries(PENALTY).reduce((s, [t, p]) => s + p * count(t), 0),
    0,
    100,
  );
  const rs = Object.values(ratings);
  const avg = rs.length ? rs.reduce((s, r) => s + r.stars, 0) / rs.length : null;
  const tone =
    score >= 80 ? "text-primary-dark" : score >= 50 ? "text-amber" : "text-danger";

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-6 p-5 sm:p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
            {driverName ?? "Driver"} · behaviour score
          </p>
          <p className={cn("mt-1 text-5xl font-bold tabular-nums", tone)}>
            {score}
            <span className="text-lg font-medium text-faint">/100</span>
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
            Passenger rating
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xl font-semibold sm:justify-end">
            <Star className="h-4 w-4 fill-amber text-amber" />
            {avg ? avg.toFixed(1) : "No ratings yet"}
            {avg && (
              <span className="text-sm font-normal text-faint">
                ({rs.length} rider{rs.length === 1 ? "" : "s"})
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 px-5 sm:grid-cols-5 sm:px-6">
        {Object.keys(PENALTY).map((t) => (
          <div key={t} className="rounded-xl bg-canvas p-3">
            <p className="text-2xl font-bold tabular-nums">{count(t)}</p>
            <p className="mt-0.5 text-xs text-muted">{LABEL[t]}</p>
          </div>
        ))}
      </div>

      <div className="p-5 sm:p-6">
        <p className="text-sm font-semibold">Recent events</p>
        {list.length === 0 && (
          <p className="mt-2 text-sm text-muted">
            No events recorded yet — drive the bus to generate some.
          </p>
        )}
        {list.length > 0 && (
          <ul className="mt-2 max-h-44 divide-y divide-line overflow-auto text-sm">
            {list.slice(0, 12).map((e, i) => (
              <li key={i} className="flex items-center justify-between py-1.5">
                <span>{LABEL[e.type] ?? e.type}</span>
                <span className="font-mono text-xs text-faint">
                  {new Date(e.ts).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
