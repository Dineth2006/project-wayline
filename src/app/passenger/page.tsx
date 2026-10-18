"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Armchair,
  Bell,
  BellRing,
  Bus,
  Clock,
  LocateFixed,
  MapPin,
  Plus,
  Star,
  X,
} from "lucide-react";
import { ref, set, push } from "firebase/database";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Gate } from "@/lib/guards";
import { useBuses, useRoutes, useValue } from "@/hooks/useRealtime";
import { useGeofenceAlerts } from "@/hooks/useGeofenceAlerts";
import { etaSeconds, formatDistance, routeProgress } from "@/lib/travel";
import { Workspace, type NavItem } from "@/components/Workspace";
import { Card, SectionTitle, StatCard } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { LiveMap } from "@/components/LiveMap";
import { cn } from "@/lib/cn";

const NAV: NavItem[] = [
  { id: "track", label: "Track", icon: Bus },
  { id: "seats", label: "Seats", icon: Armchair },
  { id: "alerts", label: "Alerts", icon: Bell },
];

function PassengerApp() {
  const [tab, setTab] = useState("track");
  return (
    <Workspace workspace="Passenger" items={NAV} active={tab} onNavigate={setTab}>
      {tab === "track" && <Track />}
      {tab === "seats" && <Seats />}
      {tab === "alerts" && <AlertsTab />}
    </Workspace>
  );
}

/* ---------------- Track ---------------- */

function Track() {
  const buses = useBuses();
  const routes = useRoutes();
  const { fences } = useGeofenceAlerts();

  const stops = useMemo(() => {
    const map = new Map<string, { name: string; x: number; y: number }>();
    for (const r of routes) for (const s of r.stops ?? []) map.set(s.name, s);
    return [...map.values()];
  }, [routes]);

  const [stop, setStop] = useState<string | null>(stops[0]?.name ?? null);

  // per-bus arrival info for the selected stop
  const arrivals = useMemo(() => {
    if (!stop) return [];
    return buses
      .map((b) => {
        const route = routes.find((r) => r.id === b.meta?.routeId);
        if (!route || !(route.stops ?? []).some((s) => s.name === stop)) return null;
        const t = b.telemetry;
        if (!t) return { bus: b, eta: null, dist: null as number | null, online: b.online };
        const prog = routeProgress(t.location, route);
        const d = (route.stops ?? []).find((s) => s.name === stop);
        const distM = d ? Math.hypot(t.location.x - d.x, t.location.y - d.y) : null;
        return {
          bus: b,
          eta: distM != null ? etaSeconds(distM, t.speed) : null,
          dist: distM,
          online: b.online,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => (a.eta ?? Infinity) - (b.eta ?? Infinity));
  }, [buses, routes, stop]);

  const best = arrivals[0];

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="bg-forest p-5 text-center text-white sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">
            {stop ? `Next arrival · ${stop}` : "Pick a stop"}
          </p>
          <div className="mt-1 flex items-end justify-center gap-2">
            <AnimatePresence mode="popLayout">
              <motion.span
                key={best?.eta != null ? Math.round(best.eta) : "none"}
                initial={{ y: 14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -14, opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="text-6xl font-bold tabular-nums tracking-tight sm:text-7xl"
              >
                {best?.eta != null ? Math.max(1, Math.round(best.eta)) : "—"}
              </motion.span>
            </AnimatePresence>
            <span className="pb-2 text-lg font-medium text-white/60">
              {best?.eta != null ? "sec" : ""}
            </span>
          </div>
          <p className="mt-1 text-xs text-white/60">
            {best?.eta != null
              ? `${best.bus.meta?.name} is ${formatDistance(best.dist ?? 0)} away`
              : stop
                ? "no bus on a moving route to this stop"
                : "choose your stop below"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 p-4 sm:p-5">
          {stops.map((s) => (
            <button
              key={s.name}
              onClick={() => setStop(s.name)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition",
                stop === s.name
                  ? "bg-primary text-white shadow-card"
                  : "border border-line bg-white text-muted hover:border-primary hover:text-ink",
              )}
            >
              <MapPin className="h-3.5 w-3.5" />
              {s.name}
            </button>
          ))}
          {stops.length === 0 && (
            <p className="text-sm text-muted">No stops defined on any route.</p>
          )}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <div className="p-4 sm:p-5">
            <SectionTitle title="Live map" hint="Your geofences are drawn as dashed rings." />
          </div>
          <div className="px-4 pb-4 sm:px-5 sm:pb-5">
            <LiveMap
              buses={buses}
              routes={routes}
              fences={fences}
              className="aspect-square w-full border border-line"
            />
          </div>
        </Card>

        <div className="space-y-2.5">
          {arrivals.map((a, i) => (
            <motion.div
              key={a.bus.id}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: a.bus.meta?.color ?? "#0e7a5b" }}>
                <Bus className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{a.bus.meta?.name}</p>
                <p className="font-mono text-xs text-faint">{a.bus.meta?.plate}</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold tabular-nums">
                  {a.eta != null ? `${Math.round(a.eta)}s` : "—"}
                </p>
                <p className="text-[10px] font-medium uppercase tracking-wider text-faint">
                  {a.online ? "to " + stop : "offline"}
                </p>
              </div>
            </motion.div>
          ))}
          {arrivals.length === 0 && (
            <Card>
              <p className="p-5 text-sm text-muted">
                No buses serve this stop. Run <code>npm run seed</code> to load
                the demo network.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Seats ---------------- */

function Seats() {
  const auth = useAuth();
  const buses = useBuses();
  const [busId, setBusId] = useState<string | null>(buses[0]?.id ?? null);
  const bus = buses.find((b) => b.id === busId) ?? buses[0];
  const taken = useValue<Record<string, { uid: string; ts: number; name?: string }>>(
    bus ? `seats/${bus.id}` : null,
  ) ?? {};

  const seats = bus ? Array.from({ length: bus.meta?.seats ?? 8 }, (_, i) => `A${i + 1}`) : [];

  const act = async (seat: string) => {
    if (!bus || !auth.user) return;
    const cur = taken[seat];
    if (cur && cur.uid === auth.user.uid) {
      await set(ref(db, `seats/${bus.id}/${seat}`), null);
    } else if (!cur) {
      await set(ref(db, `seats/${bus.id}/${seat}`), {
        uid: auth.user.uid,
        ts: Date.now(),
        name: auth.user.displayName ?? "Guest",
      });
    }
  };

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Reserve a seat"
        hint="Seats are held for the next departure. Tap yours again to release it."
      />
      <div className="flex flex-wrap gap-2">
        {buses.map((b) => (
          <button
            key={b.id}
            onClick={() => setBusId(b.id)}
            className={cn(
              "flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition",
              bus?.id === b.id
                ? "bg-primary text-white shadow-card"
                : "border border-line bg-white text-muted hover:border-primary",
            )}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: b.meta?.color ?? "#0e7a5b" }} />
            {b.meta?.name}
          </button>
        ))}
      </div>
      <Card>
        <div className="p-4 sm:p-5">
          <SectionTitle
            title={bus?.meta?.name ?? "Choose a bus"}
            hint={bus ? `${Object.keys(taken).length} of ${bus.meta?.seats ?? 8} taken` : ""}
            action={bus?.online ? <Pill tone="green" dot>Online</Pill> : <Pill tone="gray">Offline</Pill>}
          />
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {seats.map((s, i) => {
              const cur = taken[s];
              const mine = cur?.uid === auth.user?.uid;
              return (
                <motion.button
                  key={s}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.02 }}
                  onClick={() => void act(s)}
                  disabled={!!cur && !mine}
                  className={cn(
                    "flex h-14 flex-col items-center justify-center rounded-xl border text-xs font-bold transition",
                    mine
                      ? "border-primary bg-soft text-primary-dark"
                      : cur
                        ? "cursor-not-allowed border-line bg-canvas text-faint"
                        : "border-line bg-white text-muted hover:border-primary hover:text-ink",
                  )}
                >
                  <Armchair className={cn("h-4 w-4", mine ? "text-primary" : cur ? "text-faint" : "text-muted")} />
                  {s}
                </motion.button>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ---------------- Alerts ---------------- */

function AlertsTab() {
  const auth = useAuth();
  const buses = useBuses();
  const routes = useRoutes();
  const { fences, arrived, add, del, askNotif, notif } = useGeofenceAlerts();
  const [stopName, setStopName] = useState<string | null>(null);
  const [radius, setRadius] = useState(0.15);
  const [busFilter, setBusFilter] = useState<string>("");
  const [stars, setStars] = useState(0);
  const [rateBus, setRateBus] = useState<string>(buses[0]?.id ?? "");

  const stops = useMemo(() => {
    const map = new Map<string, { name: string; x: number; y: number }>();
    for (const r of routes) for (const s of r.stops ?? []) map.set(s.name, s);
    return [...map.values()];
  }, [routes]);
  const stop = stops.find((s) => s.name === stopName) ?? null;

  const saveFence = async () => {
    if (!stop) return;
    await add({ label: stop.name, x: stop.x, y: stop.y, r: radius, busId: busFilter || undefined });
    setStopName(null);
  };

  const rate = async () => {
    if (!rateBus || !stars || !auth.user) return;
    await push(ref(db, `ratings/${rateBus}`), {
      uid: auth.user.uid,
      stars,
      ts: Date.now(),
    });
    setStars(0);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <SectionTitle
          title="Arrival alerts"
          hint="Get pinged when a bus reaches one of your stops."
          action={
            <button
              onClick={() => void askNotif()}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold",
                notif ? "bg-soft text-primary-dark" : "border border-line bg-white text-muted hover:text-ink",
              )}
            >
              <BellRing className="h-3.5 w-3.5" />
              {notif ? "On" : "Enable browser alerts"}
            </button>
          }
        />

        <Card className="p-4 sm:p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">New alert</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              value={stopName ?? ""}
              onChange={(e) => setStopName(e.target.value || null)}
              className="rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="">Choose a stop…</option>
              {stops.map((s) => (
                <option key={s.name} value={s.name}>{s.name}</option>
              ))}
            </select>
            <select
              value={busFilter}
              onChange={(e) => setBusFilter(e.target.value)}
              className="rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="">Any bus</option>
              {buses.map((b) => (
                <option key={b.id} value={b.id}>{b.meta?.name}</option>
              ))}
            </select>
          </div>
          <label className="mt-3 block text-xs font-medium text-muted">
            Radius · {Math.round(radius * 100)} cm
            <input
              type="range"
              min={0.05}
              max={0.4}
              step={0.05}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="mt-1 w-full accent-emerald-700"
            />
          </label>
          <button
            onClick={() => void saveFence()}
            disabled={!stop}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Save alert
          </button>
        </Card>

        <div className="space-y-2">
          {fences.map((f) => (
            <div key={f.id} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3.5">
              <LocateFixed className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{f.label}</p>
                <p className="text-xs text-faint">
                  {Math.round(f.r * 100)} cm ring · {f.busId ? buses.find((b) => b.id === f.busId)?.meta?.name ?? f.busId : "any bus"}
                </p>
              </div>
              <button onClick={() => void del(f.id)} className="rounded-lg p-1.5 text-faint hover:bg-canvas hover:text-danger">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          {fences.length === 0 && (
            <p className="rounded-2xl border border-dashed border-line p-5 text-center text-sm text-muted">
              No alerts yet — add one above.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <SectionTitle title="Recent arrivals" hint="The 10 most recent trigger events." />
        <div className="space-y-2">
          {arrived.map((a) => (
            <div key={a.ts + a.label} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3.5">
              <Clock className="h-4 w-4 shrink-0 text-amber" />
              <p className="flex-1 text-sm font-medium">{a.label}</p>
              <span className="text-xs tabular-nums text-faint">
                {new Date(a.ts).toLocaleTimeString()}
              </span>
            </div>
          ))}
          {arrived.length === 0 && (
            <p className="rounded-2xl border border-dashed border-line p-5 text-center text-sm text-muted">
              Arrivals will appear here when a bus enters your ring.
            </p>
          )}
        </div>

        <SectionTitle title="Rate this trip" hint="Your score feeds the driver summary." />
        <Card className="p-4 sm:p-5">
          <select
            value={rateBus}
            onChange={(e) => setRateBus(e.target.value)}
            className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-primary"
          >
            {buses.map((b) => (
              <option key={b.id} value={b.id}>{b.meta?.name} ({b.meta?.plate})</option>
            ))}
          </select>
          <div className="mt-3 flex justify-center gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setStars(n)} className="p-1 transition hover:scale-110">
                <Star className={cn("h-7 w-7", n <= stars ? "fill-amber text-amber" : "text-line")} />
              </button>
            ))}
          </div>
          <button
            onClick={() => void rate()}
            disabled={!stars || !rateBus}
            className="mt-3 w-full rounded-xl bg-forest py-2.5 text-sm font-semibold text-white hover:bg-forest-deep disabled:opacity-50"
          >
            {stars ? `Send ${stars}-star rating` : "Pick a rating"}
          </button>
        </Card>
      </div>
    </div>
  );
}

export default function PassengerPage() {
  return (
    <Gate role="passenger">
      <PassengerApp />
    </Gate>
  );
}
