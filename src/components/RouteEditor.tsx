"use client";
import { useMemo, useState } from "react";
import { push, remove, ref, set } from "firebase/database";
import { db } from "@/lib/firebase";
import { saveSettingsLocal } from "@/hooks/useSettings";
import { WaylineMap } from "./WaylineMap";
import { OSMMap } from "./OSMMap";
import { cn } from "@/lib/cn";
import type { AppSettings, Pt, Route } from "@/lib/types";

interface Props {
  routes: Route[];
  settings: AppSettings;
}

type Mode = "point" | "stop" | "move";

/**
 * Operator route editor — create, edit, delete routes in the current map mode.
 * arena: 2D city map (metres) · google: real GPS coordinates (lng/lat).
 */
export function RouteEditor({ routes, settings }: Props) {
  // map mode: global setting (RTDB, or browser fallback when rules deny it),
  // overridable here — persisted via saveSettingsLocal so the whole app follows.
  const [mapMode, setMapMode] = useState<"arena" | "google">(settings.mapMode === "google" ? "google" : "arena");
  const google = mapMode === "google";
  const [editingId, setEditingId] = useState<string | null>(null); // "new" or a route id
  const [name, setName] = useState("");
  const [tolerance, setTolerance] = useState(8);
  const [closed, setClosed] = useState(false);
  const [points, setPoints] = useState<Pt[]>([]);
  const [stops, setStops] = useState<(Pt & { name: string })[]>([]);
  const [mode, setMode] = useState<Mode>("point");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const editing = useMemo(
    () => (editingId && editingId !== "new" ? routes.find((r) => r.id === editingId) : null),
    [editingId, routes],
  );

  function startNew() {
    setEditingId("new");
    setName("");
    setTolerance(google ? 25 : 8);
    setClosed(false);
    setPoints([]);
    setStops([]);
    setSaved(false);
  }
  function startEdit(r: Route) {
    setEditingId(r.id);
    setName(r.name);
    setTolerance(r.tolerance);
    setClosed(!!r.closed);
    setPoints(r.points.map((p) => ({ ...p })));
    setStops((r.stops ?? []).map((s) => ({ ...s })));
    setSaved(false);
  }
  function stopEditing() {
    setEditingId(null);
    setPoints([]);
    setStops([]);
  }

  function onMapClick(p: Pt) {
    if (mode === "point") setPoints((ps) => [...ps, p]);
    else setStops((ss) => [...ss, { ...p, name: `Stop ${ss.length + 1}` }]);
  }

  function movePoint(i: number, p: Pt) {
    setPoints((ps) => ps.map((x, j) => (j === i ? p : x)));
  }

  function switchMapMode() {
    const next = google ? "arena" : "google";
    if (points.length && !confirm(`Switching to the ${next === "google" ? "OpenStreetMap (lat/lng)" : "2D (metres)"} map uses different coordinates. Keep your ${points.length} drafted points?`)) return;
    setMapMode(next);
    saveSettingsLocal({ mapMode: next });
  }

  async function save() {
    if (points.length < 2 || !name.trim()) return;
    setBusy(true);
    const payload = {
      name: name.trim(),
      tolerance,
      closed,
      points,
      stops,
    };
    try {
      if (editingId === "new") {
        const newRef = push(ref(db, "routes"));
        await set(newRef, payload);
        setEditingId(newRef.key!);
      } else if (editingId) {
        await set(ref(db, `routes/${editingId}`), payload);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setBusy(false);
    }
  }

  async function deleteRoute() {
    if (!editing || !confirm(`Delete route "${editing.name}"?`)) return;
    setBusy(true);
    try {
      await remove(ref(db, `routes/${editing.id}`));
      stopEditing();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
      {/* left: list + form */}
      <div className="flex flex-col gap-3">
        <button
          onClick={startNew}
          className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
        >
          + New route
        </button>

        <div className="flex flex-col gap-2">
          {routes.map((r) => (
            <div
              key={r.id}
              className={cn(
                "flex cursor-pointer items-center justify-between rounded-xl border bg-white px-3 py-2 transition",
                editingId === r.id ? "border-emerald-500 ring-1 ring-emerald-300" : "border-emerald-100 hover:border-emerald-300",
              )}
              onClick={() => startEdit(r)}
            >
              <div>
                <p className="text-sm font-semibold text-slate-800">{r.name}</p>
                <p className="text-[11px] text-slate-500">
                  {r.points.length} pts · {r.tolerance} m tolerance{r.closed ? " · loop" : ""}
                </p>
              </div>
              <span className="text-[11px] font-semibold text-emerald-700">{editingId === r.id ? "editing" : "edit"}</span>
            </div>
          ))}
          {routes.length === 0 && (
            <p className="rounded-xl border border-dashed border-emerald-200 p-4 text-center text-xs text-slate-400">
              No routes yet — create one.
            </p>
          )}
        </div>

        {editingId && (
          <div className="flex flex-col gap-3 rounded-xl border border-emerald-100 bg-white p-4">
            <label className="text-xs font-semibold text-slate-600">
              Route name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Loop A"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal focus:border-emerald-400 focus:outline-none"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Off-route tolerance: <span className="text-emerald-700">{tolerance} m</span>
              <input
                type="range"
                min={2}
                max={google ? 100 : 20}
                step={1}
                value={tolerance}
                onChange={(e) => setTolerance(+e.target.value)}
                className="mt-1 w-full accent-emerald-600"
              />
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} className="accent-emerald-600" />
              Closed loop (bus circles the route)
            </label>
            <div className="flex gap-2">
              <button onClick={save} disabled={busy || points.length < 2 || !name.trim()} className="flex-1 rounded-lg bg-emerald-700 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-40">
                {busy ? "Saving…" : saved ? "Saved ✓" : "Save route"}
              </button>
              {editing && (
                <button onClick={deleteRoute} disabled={busy} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-40">
                  Delete
                </button>
              )}
              <button onClick={stopEditing} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* right: map + draw controls */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-100 bg-white p-3">
          <div className="flex overflow-hidden rounded-lg border border-slate-200">
            <button
              onClick={() => setMode("point")}
              className={cn("px-3 py-1.5 text-xs font-semibold", mode === "point" ? "bg-emerald-700 text-white" : "bg-white text-slate-600")}
            >
              ● Add point
            </button>
            <button
              onClick={() => setMode("stop")}
              className={cn("px-3 py-1.5 text-xs font-semibold", mode === "stop" ? "bg-amber-500 text-white" : "bg-white text-slate-600")}
            >
              ⚑ Add stop
            </button>
            <button
              onClick={() => setMode("move")}
              className={cn("px-3 py-1.5 text-xs font-semibold", mode === "move" ? "bg-sky-600 text-white" : "bg-white text-slate-600")}
            >
              ✥ Move point
            </button>
          </div>
          <button
            onClick={switchMapMode}
            className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
          >
            {google ? "🗺 2D map" : "🌐 OSM map"}
          </button>
          <button onClick={() => setPoints((p) => p.slice(0, -1))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
            Undo point
          </button>
          <button onClick={() => { setPoints([]); setStops([]); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
            Clear
          </button>
          <span className="ml-auto text-[11px] text-slate-400">
            {mode === "move"
              ? "Move mode: drag a numbered point to a new spot — map clicks are ignored"
              : `Click the map to ${mode === "point" ? "add route points" : "place a stop"} · click a numbered point to remove it · drag to move it`}
          </span>
        </div>

        {editingId ? (
          <MapCanvas
            google={google}
            settings={settings}
            points={points}
            stops={stops}
            moveMode={mode === "move"}
            onMapClick={mode === "move" ? undefined : onMapClick}
            onEditPointClick={(i) => setPoints((ps) => ps.filter((_, j) => j !== i))}
            onEditPointMove={movePoint}
          />
        ) : (
          <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/30 text-sm text-slate-400">
            Select or create a route, then click the map to draw it.
          </div>
        )}

        {/* points list */}
        {editingId && points.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {points.map((p, i) => (
              <span key={i} className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1">
                <span className="text-xs font-bold text-amber-800">{i + 1}</span>
                <span className="font-mono text-[10px] text-amber-700">
                  {google ? `${p.y.toFixed(4)}, ${p.x.toFixed(4)}` : `${p.x}, ${p.y} m`}
                </span>
                <button onClick={() => setPoints((ps) => ps.filter((_, j) => j !== i))} className="text-amber-500 hover:text-amber-700" title="Remove point">
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        {/* stops list */}
        {editingId && stops.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {stops.map((s, i) => (
              <label key={i} className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1">
                <input
                  value={s.name}
                  onChange={(e) => setStops((ss) => ss.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  className="w-24 bg-transparent text-xs font-semibold text-amber-800 focus:outline-none"
                />
                <button onClick={() => setStops((ss) => ss.filter((_, j) => j !== i))} className="text-amber-500 hover:text-amber-700">
                  ✕
                </button>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MapCanvas({
  google,
  settings,
  points,
  stops,
  moveMode,
  onMapClick,
  onEditPointClick,
  onEditPointMove,
}: {
  google: boolean;
  settings: AppSettings;
  points: Pt[];
  stops: (Pt & { name: string })[];
  moveMode: boolean;
  onMapClick?: (p: Pt) => void;
  onEditPointClick: (i: number) => void;
  onEditPointMove: (i: number, p: Pt) => void;
}) {
  if (google)
    return (
      <OSMMap
        routes={[]}
        points={points}
        stops={stops}
        buses={[]}
        editPoints={points}
        onEditPointClick={onEditPointClick}
        onEditPointMove={onEditPointMove}
        onMapClick={onMapClick}
        fitAll
        className="aspect-[16/10]"
      />
    );
  return (
    <WaylineMap
      editPoints={points}
      moveMode={moveMode}
      onEditPointClick={onEditPointClick}
      onEditPointMove={onEditPointMove}
      onMapClick={onMapClick}
      className="aspect-[16/10]"
    />
  );
}
