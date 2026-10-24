"use client";
import { Card, StatCard, SectionTitle } from "./Card";
import { cn } from "@/lib/cn";
import type { DriverStats } from "@/lib/driverStats";
import { eventLabel, timeAgo, verdict } from "@/lib/driverStats";

const TONE: Record<string, string> = {
  crash: "bg-danger",
  deviation: "bg-amber",
  harsh_brake: "bg-amber",
  harsh_accel: "bg-amber",
  obstacle: "bg-slate-400",
};

function Pill({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        ok ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", ok ? "bg-emerald-500" : "bg-slate-400")} />
      {children}
    </span>
  );
}

/** Driver performance summary — stat cards, safety gauge, ratings, incident log. */
export function DriverReport({ stats: s }: { stats: DriverStats }) {
  const scoreColor = s.safetyScore >= 75 ? "#0e7a5b" : s.safetyScore >= 50 ? "#d97706" : "#dc2626";

  return (
    <div className="space-y-4">
      {/* header: identity + safety gauge */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">Driver</p>
            <h3 className="mt-1 text-xl font-semibold text-ink">{s.driverName}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <Pill ok={s.online}>{s.online ? "Online now" : "Offline"}</Pill>
              <Pill ok={false}>{s.busId}</Pill>
              {s.plate && <Pill ok={false}>{s.plate}</Pill>}
              {s.forceStopped && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-2.5 py-1 text-[11px] font-semibold text-danger">
                  Force-stopped
                </span>
              )}
            </div>
            {s.routeName && <p className="mt-2 text-xs text-muted">Route: {s.routeName}</p>}
          </div>
          <div className="flex items-center gap-4">
            <div
              className="relative h-24 w-24 shrink-0 rounded-full"
              style={{ background: `conic-gradient(${scoreColor} ${s.safetyScore * 3.6}deg, #e2e8f0 0deg)` }}
            >
              <div className="absolute inset-[7px] flex flex-col items-center justify-center rounded-full bg-white">
                <span className="text-2xl font-bold tabular-nums" style={{ color: scoreColor }}>
                  {s.safetyScore}
                </span>
                <span className="text-[9px] font-semibold uppercase tracking-wide text-faint">/ 100</span>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">Safety score</p>
              <p className="mt-1 max-w-[160px] text-sm font-semibold leading-snug" style={{ color: scoreColor }}>
                {verdict(s.safetyScore)}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* incident stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Crashes" value={s.counts.crash} tone={s.counts.crash ? "red" : "default"} sub="all time" />
        <StatCard label="Deviations" value={s.counts.deviation} tone={s.counts.deviation ? "amber" : "default"} sub="off-route" />
        <StatCard
          label="Harsh driving"
          value={s.harshTotal}
          tone={s.harshTotal > 5 ? "amber" : "default"}
          sub={`brake ${s.counts.harsh_brake} · accel ${s.counts.harsh_accel}`}
        />
        <StatCard label="Obstacles" value={s.counts.obstacle} sub="detected" />
        <StatCard
          label={`Last ${s.windowDays} days`}
          value={s.windowIncidents}
          tone={s.windowIncidents > 3 ? "amber" : "default"}
          sub="recent incidents"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ratings */}
        <Card className="p-5 sm:p-6">
          <SectionTitle title="Passenger ratings" hint={`From riders of bus ${s.busId}`} />
          {s.ratingCount === 0 ? (
            <p className="mt-4 text-sm text-muted">No ratings yet.</p>
          ) : (
            <div className="mt-4">
              <div className="flex items-end gap-3">
                <span className="text-4xl font-bold tabular-nums text-ink">
                  {(s.ratingAvg ?? 0).toFixed(1)}
                </span>
                <span className="pb-1 text-sm text-muted">{s.ratingCount} rating{s.ratingCount === 1 ? "" : "s"}</span>
              </div>
              <div className="mt-4 space-y-1.5">
                {[5, 4, 3, 2, 1].map((star) => (
                  <div key={star} className="flex items-center gap-2 text-xs">
                    <span className="w-3 tabular-nums text-muted">{star}</span>
                    <span className="text-amber">{"★".repeat(star)}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-amber"
                        style={{ width: `${s.ratingCount ? (s.ratingBreakdown[star - 1] / s.ratingCount) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="w-6 text-right tabular-nums text-muted">{s.ratingBreakdown[star - 1]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* incident log */}
        <Card className="p-5 sm:p-6">
          <SectionTitle title="Incident log" hint="Newest first — from the bus event stream" />
          {s.incidents.length === 0 ? (
            <p className="mt-4 text-sm text-emerald-700">No recorded incidents — clean record.</p>
          ) : (
            <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
              {s.incidents.map((e, i) => (
                <li key={i} className="flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", TONE[e.type] ?? "bg-slate-300")} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {eventLabel(e.type)}
                      {typeof e.value === "number" && Math.abs(e.value) >= 1 && (
                        <span className="ml-2 text-xs tabular-nums text-muted">{e.value.toFixed(1)} g</span>
                      )}
                    </p>
                    {e.ts && <p className="text-[11px] text-faint">{new Date(e.ts).toLocaleString()}</p>}
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-muted">{timeAgo(e.ts)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
