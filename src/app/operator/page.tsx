"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Bus as BusIcon,
  CheckCircle2,
  Gauge,
  Map as MapIcon,
  Route as RouteIcon,
  Settings,
  ShieldAlert,
  Siren,
  UserPlus,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { get, ref, set, remove } from "firebase/database";
import { db } from "@/lib/firebase";
import { Gate } from "@/lib/guards";
import {
  useAlerts,
  useBuses,
  useRoutes,
  useValue,
  useDeviation,
} from "@/hooks/useRealtime";
import { useOperatorEngine } from "@/hooks/useOperatorEngine";
import { useSettings, saveSettingsLocal } from "@/hooks/useSettings";
import { RouteEditor } from "@/components/RouteEditor";
import { Workspace, type NavItem } from "@/components/Workspace";
import { Card, SectionTitle, StatCard } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { LiveMap } from "@/components/LiveMap";
import { cn } from "@/lib/cn";
import type { Alert, Bus, Route } from "@/lib/types";

const NAV: NavItem[] = [
  { id: "alerts", label: "Alerts", icon: Bell },
  { id: "fleet", label: "Fleet", icon: MapIcon },
  { id: "routes", label: "Routes", icon: RouteIcon },
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
      {tab === "settings" && <SettingsPanel settings={settings} />}
      {tab === "teams" && <Teams />}
    </Workspace>
  );
}

function SettingsPanel({ settings }: { settings: ReturnType<typeof useSettings> }) {
  const [mode, setMode] = useState<"arena" | "google">(settings.mapMode === "google" ? "google" : "arena");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    setErr("");
    // apply immediately for this browser (works even if Firebase refuses)
    saveSettingsLocal(patch);
    if (patch.mapMode) setMode(patch.mapMode as "arena" | "google");
    try {
      const snap = await get(ref(db, "settings"));
      await set(ref(db, "settings"), { ...(snap.val() ?? {}), ...patch });
    } catch {
      setErr("Applied for this browser. Firebase refused the write (database rules not deployed yet) — other devices will pick it up once rules are deployed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {err && (
        <p className="rounded-xl border border-amber/40 bg-amber-soft px-4 py-3 text-xs font-medium text-amber">{err}</p>
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
            <BusCard key={b.id} bus={b} routes={routes} delay={i * 0.05} focused={sel === b.id} />
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

function BusCard({ bus, routes, delay, focused }: { bus: Bus; routes: { id: string; name: string }[]; delay: number; focused: boolean }) {
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
        headers: { "Content-Type": "application/json" },
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

  const field =
    "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-soft";
  const list = Object.values(users).sort((a, b) => a.name.localeCompare(b.name));

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
