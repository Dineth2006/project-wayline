"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Flag,
  Gauge,
  Navigation,
  PauseCircle,
  PlayCircle,
  Route as RouteIcon,
  Siren,
  Square,
} from "lucide-react";
import { ref, set } from "firebase/database";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Gate } from "@/lib/guards";
import { useBuses, useRoutes, useWarning } from "@/hooks/useRealtime";
import { etaSeconds, formatDistance, routeProgress } from "@/lib/travel";
import { Workspace, type NavItem } from "@/components/Workspace";
import { Card, SectionTitle, StatCard } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { DriverSummary } from "@/components/DriverSummary";
import { LiveMap } from "@/components/LiveMap";
import { cn } from "@/lib/cn";

const NAV: NavItem[] = [
  { id: "trip", label: "Trip", icon: Navigation },
  { id: "summary", label: "Summary", icon: Flag },
];

function DriverApp() {
  const auth = useAuth();
  const [tab, setTab] = useState("trip");
  const buses = useBuses();
  const routes = useRoutes();
  const bus = buses.find((b) => b.id === auth.busId);
  const route = routes.find((r) => r.id === bus?.meta?.routeId);

  return (
    <Workspace
      workspace={bus?.meta?.name ? `${bus.meta.name} · ${bus.meta.plate}` : "Cab"}
      items={NAV}
      active={tab}
      onNavigate={setTab}
    >
      {tab === "trip" && (
        <div className="space-y-4">
          <TripBanner busId={bus?.id} />
          {bus && route && (
            <TripStats busId={bus.id} routeId={route.id} />
          )}
          {bus && (
            <DrivePad
              busId={bus.id}
              locked={!!(bus.telemetry?.force_stopped || bus.telemetry?.crash) && !!bus.online}
              offline={!bus.online}
            />
          )}
        </div>
      )}
      {tab === "summary" && (
        <div className="space-y-4">
          {bus ? <DriverSummary busId={bus.id} /> : (
            <Card><p className="p-5 text-sm text-muted">No bus assigned to this account.</p></Card>
          )}
        </div>
      )}
    </Workspace>
  );
}

function TripBanner({ busId }: { busId?: string }) {
  const buses = useBuses();
  const warning = useWarning(busId);
  const bus = buses.find((b) => b.id === busId);
  const t = bus?.telemetry;

  return (
    <div>
      <div className="rounded-2xl bg-forest p-4 text-white shadow-card sm:p-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
              Live trip
            </p>
            <p className="text-2xl font-bold tracking-tight">
              {bus?.meta?.name ?? "No bus"}
              <span className="ml-2 font-mono text-sm font-normal text-white/60">
                {bus?.meta?.plate}
              </span>
            </p>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
                Speed
              </p>
              <p className="text-2xl font-bold tabular-nums">
                {t ? Math.round(t.speed) : "—"}
                <span className="ml-1 text-xs font-medium text-white/60">cm/s</span>
              </p>
            </div>
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold",
                t?.crash
                  ? "bg-danger text-white"
                  : t?.force_stopped
                    ? "bg-amber text-white"
                    : bus?.online
                      ? "bg-white/15 text-white"
                      : "bg-white/10 text-white/60",
              )}
            >
              {t?.crash ? "Crash lock" : t?.force_stopped ? "Held" : bus?.online ? "Running" : "Offline"}
            </span>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {t?.crash && bus?.online && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mt-3 flex items-center gap-3 rounded-2xl border border-danger/30 bg-danger-soft p-4 text-danger"
          >
            <Siren className="h-5 w-5 shrink-0" />
            <p className="flex-1 text-sm font-semibold">
              Collision detected — controls are locked. An operator or the device
              must clear the crash state.
            </p>
          </motion.div>
        )}
        {!t?.crash && warning && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-amber/30 bg-amber-soft p-4"
          >
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">
                {warning.msg || "Operator message"}
              </p>
              <p className="text-xs text-muted">
                {warning.by ? `from ${warning.by} · ` : ""}
                {new Date(warning.ts ?? 0).toLocaleTimeString()}
              </p>
            </div>
            <button
              onClick={() =>
                void set(ref(db, `commands/${busId}/warningAck`), warning.id)
              }
              className="flex items-center gap-1.5 rounded-xl bg-forest px-3 py-2 text-xs font-semibold text-white hover:bg-forest-deep"
            >
              <Check className="h-3.5 w-3.5" />
              Acknowledge
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TripStats({ busId, routeId }: { busId: string; routeId: string }) {
  const buses = useBuses();
  const routes = useRoutes();
  const bus = buses.find((b) => b.id === busId);
  const route = routes.find((r) => r.id === routeId);
  const t = bus?.telemetry;

  const prog = t && route ? routeProgress(t.location, route) : null;
  const next = prog?.nextStop ?? null;
  const eta = next && t ? etaSeconds(next.dist, t.speed) : null;

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Next stop"
          value={next?.name ?? "—"}
          sub={next ? `in ${formatDistance(next.dist)}` : "no route set"}
          icon={<Navigation className="h-4 w-4" />}
        />
        <StatCard
          label="ETA"
          value={eta != null ? `${Math.round(eta)}s` : "—"}
          sub={next && t ? `at ${Math.round(t.speed)} cm/s` : "waiting for speed"}
          icon={<Gauge className="h-4 w-4" />}
          delay={0.05}
        />
        <StatCard
          label="Route"
          value={route?.name ?? "—"}
          sub={route ? `${route.points.length} waypoints` : "assign a route"}
          icon={<RouteIcon className="h-4 w-4" />}
          delay={0.1}
        />
      </div>
      <Card>
        <div className="p-4 sm:p-5">
          <SectionTitle title="Position" hint="Live 2 m arena view — the marker is your bus." />
        </div>
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <LiveMap
            buses={buses}
            routes={routes}
            selectedBusId={busId}
            className="aspect-[16/10] w-full border border-line"
          />
        </div>
      </Card>
    </>
  );
}

type Cmd = "F" | "B" | "L" | "R" | "S" | "FF" | "X";

function DrivePad({ busId, locked, offline }: { busId: string; locked: boolean; offline: boolean }) {
  const [held, setHeld] = useState<Cmd | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => stop(), []);

  function send(cmd: Cmd) {
    void set(ref(db, `commands/${busId}/drive`), { cmd, ts: Date.now() });
  }
  function start(cmd: Cmd) {
    if (locked || offline || timer.current) return;
    setHeld(cmd);
    send(cmd);
    timer.current = window.setInterval(() => send(cmd), 200);
  }
  function stop() {
    if (timer.current) {
      window.clearInterval(timer.current);
      timer.current = null;
      setHeld(null);
    }
  }

  const btn = (cmd: Cmd, label: string, icon: React.ReactNode, wide = false) => (
    <button
      onPointerDown={() => start(cmd)}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      disabled={locked || offline}
      style={{ touchAction: "none", userSelect: "none" }}
      className={cn(
        "flex h-16 select-none flex-col items-center justify-center gap-0.5 rounded-2xl border text-sm font-bold transition-all sm:h-20",
        wide && "col-span-2",
        held === cmd
          ? "border-forest bg-forest text-white shadow-card"
          : locked || offline
            ? "cursor-not-allowed border-line bg-canvas text-faint"
            : "border-line bg-white text-ink hover:border-primary hover:bg-soft",
      )}
    >
      {icon}
      <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
    </button>
  );

  return (
    <Card>
      <div className="p-4 sm:p-5">
        <SectionTitle
          title="Drive controls"
          hint="Press and hold to send — the bus keeps moving while you hold."
          action={
            offline ? (
              <Pill tone="gray">Bus offline</Pill>
            ) : locked ? (
              <Pill tone="red" dot>Controls locked</Pill>
            ) : (
              <Pill tone="green" dot>Ready</Pill>
            )
          }
        />
      </div>
      <div className="grid grid-cols-3 gap-2.5 px-4 pb-4 sm:grid-cols-4 sm:px-5 sm:pb-5">
        <div className="col-span-3 flex justify-center sm:col-span-1">
          {btn("F", "Forward", <ArrowUp className="h-5 w-5" />)}
        </div>
        {btn("L", "Left", <ArrowLeft className="h-5 w-5" />)}
        {btn("S", "Stop", <Square className="h-4 w-4" />)}
        {btn("R", "Right", <ArrowRight className="h-4 w-4" />)}
        <div className="col-span-1 sm:col-span-1" />
        {btn("B", "Back", <ArrowDown className="h-5 w-5" />)}
        <div className="col-span-2 sm:col-span-2" />
        {btn("FF", "Full speed", <Gauge className="h-4 w-4" />, true)}
        <div className="col-span-3 mt-1 sm:col-span-4">
          <button
            onClick={() => {
              stop();
              send("X");
            }}
            disabled={locked || offline}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-danger/30 bg-danger-soft py-3 text-sm font-bold text-danger transition hover:bg-danger hover:text-white disabled:opacity-50"
          >
            <PauseCircle className="h-4 w-4" />
            Abort all motion (X)
          </button>
        </div>
      </div>
    </Card>
  );
}

export default function DriverPage() {
  return (
    <Gate role="driver">
      <DriverApp />
    </Gate>
  );
}
