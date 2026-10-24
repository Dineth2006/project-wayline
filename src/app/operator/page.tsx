"use client";
import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Bus as BusIcon,
  CheckCircle2,
  ClipboardList,
  FileDown,
  Gauge,
  ImagePlus,
  Map as MapIcon,
  Route as RouteIcon,
  Settings,
  ShieldAlert,
  Siren,
  Trash2,
  UserPlus,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { get, ref, set, remove } from "firebase/database";
import { db, auth, authToken } from "@/lib/firebase";
import { Gate } from "@/lib/guards";
import {
  useAlerts,
  useBuses,
  useRoutes,
  useValue,
  useDeviation,
  useBusEvents,
  useRatings,
} from "@/hooks/useRealtime";
import { useOperatorEngine } from "@/hooks/useOperatorEngine";
import { useSettings, saveSettingsLocal } from "@/hooks/useSettings";
import { useArenaMap } from "@/hooks/useArenaMap";
import { processArenaImage } from "@/lib/imageCrop";
import { RouteEditor } from "@/components/RouteEditor";
import { DriverReport } from "@/components/DriverReport";
import { Workspace, type NavItem } from "@/components/Workspace";
import { Card, SectionTitle, StatCard } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { LiveMap } from "@/components/LiveMap";
import { computeDriverStats } from "@/lib/driverStats";
import { exportDriverPdf } from "@/lib/driverPdf";
import { cn } from "@/lib/cn";
import type { Alert, Bus, Route } from "@/lib/types";

const NAV: NavItem[] = [
  { id: "alerts", label: "Alerts", icon: Bell },
  { id: "fleet", label: "Fleet", icon: MapIcon },
  { id: "routes", label: "Routes", icon: RouteIcon },
  { id: "drivers", label: "Drivers", icon: ClipboardList },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "teams", label: "Teams", icon: Users },
];

function OperatorApp() {
  const [tab, setTab] = useState("alerts");
  const buses = useBuses();
  const routes = useRoutes();
  const alerts = useAlerts();
  const settings = useSettings();
  useOperatorEngine();

  const active = alerts.filter((a) => a.active);
  return (
    <Workspace
      workspace="Control room"
      items={NAV}
      active={tab}
      onNavigate={setTab}
      alertCount={active.length}
    >
      {tab === "fleet" && <Fleet buses={buses} routes={routes} />}
      {tab === "alerts" && <AlertsView alerts={alerts} buses={buses} />}
      {tab === "routes" && <RouteEditor routes={routes} settings={settings} />}
      {tab === "drivers" && <DriversView />}
      {tab === "settings" && <SettingsPanel settings={settings} />}
      {tab === "teams" && <Teams />}
    </Workspace>
  );
}

function SettingsPanel({ settings }: { settings: ReturnType<typeof useSettings> }) {
  const [mode, setMode] = useState<"arena" | "google">(settings.mapMode === "google" ? "google" : "arena");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bg = useArenaMap();

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    setErr("");
    setOk("");
    // apply immediately for this browser (works even if Firebase refuses)
    saveSettingsLocal(patch);
    if (patch.mapMode) setMode(patch.mapMode as "arena" | "google");
    try {
      const snap = await get(ref(db, "settings"));
      await set(ref(db, "settings"), { ...(snap.val() ?? {}), ...patch });
      setOk("Saved — every connected device switches automatically.");
    } catch (e) {
      setErr(
        e instanceof Error && e.message.includes("permission_denied")
          ? "Applied for this browser only. Your account is not allowed to change global settings (operator role required)."
          : "Applied for this browser only. Could not sync to other devices — check your Firebase connection / rules."
      );
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const dataUrl = await processArenaImage(file);
      await set(ref(db, "arenaMap"), dataUrl);
      setOk("Background saved — every client's arena map updated.");
    } catch (err) {
      setErr(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function removeBg() {
    setBusy(true);
    setErr("");
    setOk("");
    try {
      await set(ref(db, "arenaMap"), null);
      setOk("Background removed — arenas show the default city.");
    } catch {
      setErr("Could not remove the background.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {err && (
        <p className="rounded-xl border border-amber/40 bg-amber-soft px-4 py-3 text-xs font-medium text-amber">{err}</p>
      )}
      {ok && (
        <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-600">{ok}</p>
      )}
      <Card>
        <SectionTitle title="Map mode" hint="Which map the whole app uses." />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            onClick={() => save({ mapMode: "arena" })}
            className={`rounded-xl border p-4 text-left transition ${mode === "arena" ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-300" : "border-slate-200 bg-white hover:border-emerald-300"}`}
          >
            <p className="text-sm font-bold text-slate-800">Arena (custom map)</p>
            <p className="mt-1 text-xs text-slate-500">2D city map in metres — the current simulator / 2 m arena. Default.</p>
          </button>
          <button
            onClick={() => save({ mapMode: "google" })}
            className={`rounded-xl border p-4 text-left transition ${mode === "google" ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-300" : "border-slate-200 bg-white hover:border-emerald-300"}`}
          >
            <p className="text-sm font-bold text-slate-800">OpenStreetMap (real GPS)</p>
            <p className="mt-1 text-xs text-slate-500">Routes drawn in lat/lng; bus telemetry read as GPS. Free tiles, no API key needed.</p>
          </button>
        </div>
      </Card>
      <Card>
        <SectionTitle title="Arena background" hint="A photo shown behind the arena (custom map). Applies to every client." />
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          {bg ? (
            <img src={bg} alt="Arena background" className="h-28 w-28 rounded-xl border border-slate-200 object-cover" />
          ) : (
            <div className="flex h-28 w-28 items-center justify-center rounded-xl border border-dashed border-slate-300 text-center text-[11px] text-slate-400">
              No image yet
            </div>
          )}
          <div className="flex flex-col gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50"
            >
              <ImagePlus size={14} />
              {busy ? "Working…" : "Upload image"}
            </button>
            {bg && (
              <button
                onClick={removeBg}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-100 disabled:opacity-50"
              >
                <Trash2 size={14} />
                Remove background
              </button>
            )}
            <p className="text-xs text-slate-400">
              Any photo works — it is cropped to 1:1 and shrunk automatically. Only operators can change it.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ---------------- Fleet ---------------- */

function Fleet({ buses, routes }: { buses: Bus[]; routes: Route[] }) {
  const [sel, setSel] = useState<string | null>(null);
  const online = buses.filter((b) => b.online);
  const offRoute = useMemo(
    () => buses.filter((b) => OffRouteProbe(b, routes)),
    [buses, routes],
  );
  const avgSpeed = online.length
    ? online.reduce((s, b) => s + (b.telemetry?.speed ?? 0), 0) / online.length
    : 0;

  const [reg, setReg] = useState({ id: "", name: "", plate: "", routeId: "", seats: "40", color: "#0f8a6d" });
  const [regBusy, setRegBusy] = useState(false);
  const [regMsg, setRegMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const COLORS = ["#0f8a6d", "#e07b39", "#2f6fb2", "#8a4fb2", "#c2452d", "#5a7d2c"];
  const fieldCls =
    "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-soft";

  const register = async () => {
    const id = reg.id.trim().toUpperCase().replace(/\s+/g, "-");
    if (!id || !reg.name.trim() || !reg.routeId) {
      setRegMsg({ ok: false, text: "Bus ID, name and route are required." });
      return;
    }
    setRegBusy(true);
    setRegMsg(null);
    try {
      await set(ref(db, `buses/${id}/meta`), {
        name: reg.name.trim(),
        plate: reg.plate.trim(),
        routeId: reg.routeId,
        seats: Number(reg.seats) || 40,
        color: reg.color,
      });
      setRegMsg({ ok: true, text: `Bus ${id} registered.` });
      setReg({ id: "", name: "", plate: "", routeId: "", seats: "40", color: "#0f8a6d" });
    } catch (e) {
      setRegMsg({ ok: false, text: (e as Error).message });
    } finally {
      setRegBusy(false);
    }
  };

  const removeBus = async (busId: string) => {
    if (!window.confirm(`Remove bus ${busId}? Its telemetry, events and ratings will be deleted.`)) return;
    setRemoving(busId);
    setRegMsg(null);
    try {
      const res = await fetch("/api/admin/delete-bus", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await authToken()}` },
        body: JSON.stringify({ busId }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setRegMsg({ ok: true, text: `Bus ${busId} removed.` });
    } catch (e) {
      setRegMsg({ ok: false, text: (e as Error).message });
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Buses online"
          value={`${online.length}/${buses.length}`}
          sub={online.length ? "reporting telemetry" : "fleet idle"}
          icon={<BusIcon className="h-4 w-4" />}
        />
        <StatCard
          label="Off route"
          value={offRoute.length}
          tone={offRoute.length ? "amber" : "default"}
          sub={offRoute.length ? "deviation in progress" : "all on path"}
          icon={<ShieldAlert className="h-4 w-4" />}
          delay={0.05}
        />
        <StatCard
          label="Avg speed"
          value={`${Math.round(avgSpeed)} cm/s`}
          sub="across online fleet"
          icon={<Gauge className="h-4 w-4" />}
          delay={0.1}
        />
        <StatCard
          label="Routes"
          value={routes.length}
          sub="active service patterns"
          icon={<MapIcon className="h-4 w-4" />}
          delay={0.15}
        />
      </div>

      <Card delay={0.1}>
        <div className="p-4 sm:p-5">
          <SectionTitle
            title="Register bus"
            hint="Adds a bus to the fleet — firmware/simulator can then report against it."
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input className={fieldCls} placeholder="Bus ID (e.g. BUS-03)" value={reg.id} onChange={(e) => setReg({ ...reg, id: e.target.value })} />
            <input className={fieldCls} placeholder="Name (e.g. City Express)" value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} />
            <input className={fieldCls} placeholder="Plate (optional)" value={reg.plate} onChange={(e) => setReg({ ...reg, plate: e.target.value })} />
            <select className={fieldCls} value={reg.routeId} onChange={(e) => setReg({ ...reg, routeId: e.target.value })}>
              <option value="">Choose a route…</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <input className={fieldCls} type="number" min="1" placeholder="Seats" value={reg.seats} onChange={(e) => setReg({ ...reg, seats: e.target.value })} />
            <div className="flex items-center gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setReg({ ...reg, color: c })}
                  aria-label={`color ${c}`}
                  className={`h-7 w-7 rounded-full transition ${reg.color === c ? "ring-2 ring-ink ring-offset-2" : "opacity-60 hover:opacity-100"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <button
              onClick={register}
              disabled={regBusy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50 sm:col-span-2 sm:justify-self-start"
            >
              {regBusy ? "Registering…" : "Register bus"}
            </button>
          </div>
          {regMsg && (
            <p className={`mt-3 text-xs font-medium ${regMsg.ok ? "text-emerald-600" : "text-red-600"}`}>{regMsg.text}</p>
          )}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card delay={0.1}>
          <div className="p-4 sm:p-5">
            <SectionTitle
              title="Live network"
              hint="Tap a bus to select it. The map mirrors the 2 m arena at 10 px per metre."
            />
          </div>
          <div className="px-4 pb-4 sm:px-5 sm:pb-5">
            <LiveMap
              buses={buses}
              routes={routes}
              selectedBusId={sel}
              onSelectBus={(id) => setSel((s) => (s === id ? null : id))}
              className="aspect-square w-full border border-line"
            />
          </div>
        </Card>

        <div className="space-y-3">
          {buses.length === 0 && (
            <Card>
              <p className="p-5 text-sm text-muted">
                No buses registered yet — run <code>npm run seed</code> to add
                the demo fleet.
              </p>
            </Card>
          )}
          {buses.map((b, i) => (
            <BusCard
              key={b.id}
              bus={b}
              routes={routes}
              delay={i * 0.05}
              focused={sel === b.id}
              onRemove={removeBus}
              removing={removing === b.id}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function OffRouteProbe(b: Bus, routes: Route[]) {
  // lightweight re-computation for the stat card (the hook below stays for per-bus state)
  if (!b.online || !b.telemetry || !b.meta) return false;
  const r = routes.find((x) => x.id === b.meta!.routeId);
  if (!r) return false;
  let best = Infinity;
  const pts = r.points;
  const n = r.closed ?? true ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const c = pts[(i + 1) % pts.length];
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.min(1, Math.max(0, ((b.telemetry.location.x - a.x) * dx + (b.telemetry.location.y - a.y) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(b.telemetry.location.x - (a.x + t * dx), b.telemetry.location.y - (a.y + t * dy)));
  }
  return best > r.tolerance;
}

function BusCard({ bus, routes, delay, focused, onRemove, removing }: { bus: Bus; routes: { id: string; name: string }[]; delay: number; focused: boolean; onRemove?: (id: string) => void; removing?: boolean }) {
  const route = routes.find((r) => r.id === bus.meta?.routeId);
  const off = useDeviation(bus);
  const t = bus.telemetry;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "rounded-2xl border bg-white p-4 shadow-card transition-colors sm:p-5",
        focused ? "border-primary ring-2 ring-soft" : "border-line",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: bus.meta?.color ?? "#0e7a5b" }} />
        <p className="text-sm font-semibold">{bus.meta?.name ?? bus.id}</p>
        <span className="font-mono text-xs text-faint">{bus.meta?.plate}</span>
        <span className="ml-auto">
          {t?.crash ? (
            <Pill tone="red" dot>Crash</Pill>
          ) : !bus.online ? (
            <Pill tone="gray">Offline</Pill>
          ) : t?.force_stopped ? (
            <Pill tone="red">Held</Pill>
          ) : off ? (
            <Pill tone="amber" dot>Off route</Pill>
          ) : (
            <Pill tone="green" dot>On route</Pill>
          )}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-canvas p-2">
          <p className="text-lg font-semibold tabular-nums">{t ? Math.round(t.speed) : "—"}</p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-faint">cm/s</p>
        </div>
        <div className="rounded-xl bg-canvas p-2">
          <p className="text-lg font-semibold tabular-nums">
            {t ? `${t.location.x.toFixed(2)}, ${t.location.y.toFixed(2)}` : "—"}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-faint">x · y</p>
        </div>
        <div className="rounded-xl bg-canvas p-2">
          <p className="text-lg font-semibold tabular-nums">{route?.name ?? "—"}</p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-faint">route</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => void set(ref(db, `commands/${bus.id}/forceStop`), !t?.force_stopped)}
          disabled={!bus.online}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition disabled:opacity-50",
            t?.force_stopped
              ? "bg-danger text-white hover:bg-danger/90"
              : "border border-line bg-white text-danger hover:bg-danger-soft",
          )}
        >
          <Siren className="h-3.5 w-3.5" />
          {t?.force_stopped ? "Release hold" : "Force stop"}
        </button>
        {t?.crash && (
          <button
            onClick={() => void set(ref(db, `commands/${bus.id}/clearCrash`), true)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber/40 bg-amber-soft px-3 py-2 text-xs font-semibold text-amber hover:brightness-95"
          >
            <Wrench className="h-3.5 w-3.5" />
            Clear crash
          </button>
        )}
        {onRemove && (
          <button
            onClick={() => onRemove(bus.id)}
            disabled={removing}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {removing ? "…" : "Remove"}
          </button>
        )}
      </div>
    </motion.div>
  );
}

/* ---------------- Alerts ---------------- */

function AlertsView({ alerts, buses }: { alerts: Alert[]; buses: Bus[] }) {
  const [showResolved, setShowResolved] = useState(false);
  const sorted = [...alerts].sort((a, b) => Number(b.active) - Number(a.active) || b.ts - a.ts);
  const busName = (id: string) => buses.find((b) => b.id === id)?.meta?.name ?? id;

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Incident feed"
        hint="Raised automatically when a bus crashes or sits off route for 10 s."
        action={
          <button
            onClick={() => setShowResolved((v) => !v)}
            className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-muted hover:text-ink"
          >
            {showResolved ? "Hide resolved" : `Show resolved (${alerts.filter((a) => !a.active).length})`}
          </button>
        }
      />
      <AnimatePresence initial={false}>
        {sorted.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl border border-dashed border-line bg-white/60 p-10 text-center text-sm text-muted"
          >
            <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-primary" />
            No incidents. The network is running clean.
          </motion.div>
        )}
      </AnimatePresence>
      <div className="space-y-2.5">
        {sorted
          .filter((a) => showResolved || a.active)
          .map((a, i) => (
            <motion.div
              key={`${a.busId}_${a.type}_${a.ts}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-2xl border p-4",
                a.active
                  ? a.type === "crash"
                    ? "border-danger/30 bg-danger-soft/60"
                    : "border-amber/30 bg-amber-soft/60"
                  : "border-line bg-white opacity-70",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                  a.active
                    ? a.type === "crash"
                      ? "bg-danger text-white"
                      : "bg-amber text-white"
                    : "bg-soft text-primary-dark",
                )}
              >
                {a.type === "crash" ? <Siren className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{a.msg}</p>
                <p className="text-xs text-muted">
                  {busName(a.busId)} · {new Date(a.ts).toLocaleTimeString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {a.active ? (
                  <>
                    {a.type === "crash" && (
                      <button
                        onClick={() => void set(ref(db, `commands/${a.busId}/clearCrash`), true)}
                        className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold hover:bg-canvas"
                      >
                        Clear crash
                      </button>
                    )}
                    <button
                      onClick={() => void set(ref(db, `alerts/${a.busId}_${a.type}`), { ...a, active: false })}
                      className="rounded-lg bg-forest px-3 py-1.5 text-xs font-semibold text-white hover:bg-forest-deep"
                    >
                      Resolve
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => void remove(ref(db, `alerts/${a.busId}_${a.type}`))}
                    className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-muted hover:text-danger"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
      </div>
    </div>
  );
}

/* ---------------- Drivers ---------------- */

function DriversView() {
  const buses = useBuses();
  const routes = useRoutes();
  const users =
    useValue<Record<string, { email?: string; name?: string; role?: string; busId?: string }>>(
      "users",
    ) ?? {};
  const [sel, setSel] = useState<string | null>(null);

  // A driver = a bus with a driver assigned (by uid or name).
  const drivers = buses
    .filter((b) => b.meta?.driverUid || b.meta?.driverName)
    .map((b) => {
      const u = b.meta?.driverUid ? users[b.meta.driverUid] : undefined;
      return {
        busId: b.id,
        name: b.meta?.driverName ?? u?.name ?? "Unassigned driver",
        email: u?.email,
        plate: b.meta?.plate,
        bus: b,
      };
    });

  const active = sel ?? drivers[0]?.busId ?? null;
  const activeDriver = drivers.find((d) => d.busId === active);
  const events = useBusEvents(active);
  const ratings = useRatings(active);

  const stats = activeDriver
    ? computeDriverStats(
        {
          busId: activeDriver.busId,
          driverName: activeDriver.name,
          driverUid: activeDriver.bus.meta?.driverUid,
          plate: activeDriver.plate,
          routeName: routes.find((r) => r.id === activeDriver.bus.meta?.routeId)?.name,
          online: activeDriver.bus.online,
          lastActive: activeDriver.bus.telemetry?.ts,
          lastSpeed: activeDriver.bus.telemetry?.speed,
          forceStopped: activeDriver.bus.telemetry?.force_stopped,
        },
        events,
        ratings,
      )
    : null;

  if (drivers.length === 0) {
    return (
      <Card>
        <p className="p-6 text-sm text-muted">
          No drivers assigned to any bus yet. Create a driver in{" "}
          <span className="font-medium text-ink">Teams</span> and assign them a bus, then their
          performance summary will appear here.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Driver performance"
        hint="Incident history, passenger ratings and a 0–100 safety score per driver. Export any report as PDF."
        action={
          <button
            onClick={() => stats && exportDriverPdf(stats)}
            disabled={!stats}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            <FileDown className="h-3.5 w-3.5" />
            Export PDF
          </button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
        {/* driver picker */}
        <div className="space-y-2">
          {drivers.map((d) => (
            <button
              key={d.busId}
              onClick={() => setSel(d.busId)}
              className={cn(
                "w-full rounded-2xl border p-4 text-left transition",
                active === d.busId
                  ? "border-primary ring-2 ring-soft bg-white"
                  : "border-line bg-white hover:border-primary/40",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-soft text-xs font-bold text-primary-dark">
                  {d.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{d.name}</p>
                  <p className="truncate font-mono text-[11px] text-faint">{d.busId}</p>
                </div>
                <Pill tone={d.bus.online ? "green" : "gray"} dot>
                  {d.bus.online ? "Live" : "Idle"}
                </Pill>
              </div>
            </button>
          ))}
        </div>

        {/* report */}
        <div>{stats && <DriverReport stats={stats} />}</div>
      </div>
    </div>
  );
}

/* ---------------- Teams ---------------- */

function Teams() {
  const users = useValue<Record<string, { email: string; name: string; role: string; busId?: string }>>("users") ?? {};
  const buses = useBuses();
  const [form, setForm] = useState({ role: "driver", name: "", email: "", password: "", busId: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [expanded, setExpanded] = useState(false);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await authToken()}` },
        body: JSON.stringify({
          role: form.role,
          name: form.name,
          email: form.email,
          password: form.password,
          busId: form.role === "driver" ? form.busId || undefined : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create the account.");
      setMsg({ ok: true, text: `${form.name} created as ${form.role}.` });
      setForm({ role: "driver", name: "", email: "", password: "", busId: "" });
      setExpanded(false);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const [removing, setRemoving] = useState<string | null>(null);
  const removeUser = async (uid: string) => {
    if (!window.confirm("Remove this account? The person will no longer be able to sign in.")) return;
    setRemoving(uid);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await authToken()}` },
        body: JSON.stringify({ uid }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setMsg({ ok: true, text: "Account removed." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setRemoving(null);
    }
  };

  const field =
    "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-soft";
  const list = Object.entries(users)
    .filter(([, u]) => u.role !== "passenger")
    .map(([uid, u]) => ({ uid, ...u }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Operators & drivers"
        hint="Passengers self-serve; drive the rest from here."
        action={
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-white hover:bg-primary-dark"
          >
            <UserPlus className="h-3.5 w-3.5" />
            {expanded ? "Close" : "New account"}
          </button>
        }
      />

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <Card className="p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-muted">
                  Role
                  <select
                    className={cn(field, "mt-1")}
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                  >
                    <option value="driver">Driver</option>
                    <option value="operator">Operator</option>
                  </select>
                </label>
                <label className="text-xs font-medium text-muted">
                  Full name
                  <input className={cn(field, "mt-1")} placeholder="Name on the badge" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </label>
                <label className="text-xs font-medium text-muted">
                  Email
                  <input type="email" className={cn(field, "mt-1")} placeholder="name@wayline.app" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </label>
                <label className="text-xs font-medium text-muted">
                  Password
                  <input type="password" minLength={6} className={cn(field, "mt-1")} placeholder="6+ characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </label>
                {form.role === "driver" && (
                  <label className="text-xs font-medium text-muted sm:col-span-2">
                    Assigned bus
                    <select className={cn(field, "mt-1")} value={form.busId} onChange={(e) => setForm({ ...form, busId: e.target.value })}>
                      <option value="">Choose a bus…</option>
                      {buses.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.meta?.name ?? b.id} ({b.meta?.plate})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {msg && (
                <p className={cn("mt-3 rounded-lg px-3 py-2 text-xs font-medium", msg.ok ? "bg-soft text-primary-dark" : "bg-danger-soft text-danger")}>
                  {msg.text}
                </p>
              )}
              <button
                onClick={() => void submit()}
                disabled={busy}
                className="mt-4 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
              >
                {busy ? "Creating…" : "Create account"}
              </button>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <Card>
        <ul className="divide-y divide-line">
          {list.length === 0 && (
            <li className="p-5 text-sm text-muted">No accounts yet.</li>
          )}
          {list.map((u) => (
            <li key={u.email} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-soft text-xs font-bold text-primary-dark">
                {u.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{u.name}</p>
                <p className="truncate text-xs text-faint">{u.email}</p>
              </div>
              <span className="hidden text-xs text-muted sm:block">
                {u.role === "driver" && u.busId ? `drives ${u.busId}` : u.role}
              </span>
              <Pill tone={u.role === "operator" ? "green" : u.role === "driver" ? "amber" : "gray"}>
                {u.role}
              </Pill>
              <button
                onClick={() => removeUser(u.uid)}
                disabled={removing === u.uid || u.uid === auth.currentUser?.uid}
                className="rounded-lg border border-red-100 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-40"
              >
                {removing === u.uid ? "…" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export default function OperatorPage() {
  return (
    <Gate role="operator">
      <OperatorApp />
    </Gate>
  );
}
