"use client";
import { useEffect, useRef, useState } from "react";
import type L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cn } from "@/lib/cn";
import type { AppSettings, Bus, Pt, Route } from "@/lib/types";

interface Props {
  className?: string;
  routes: Route[];
  stops: (Pt & { name: string })[];
  points: Pt[]; // draft points (route editor)
  buses: Bus[];
  editPoints?: Pt[]; // numbered, draggable draft points
  onMapClick?: (p: Pt) => void;
  onEditPointClick?: (i: number) => void;
  onEditPointMove?: (i: number, p: Pt) => void;
  center?: Pt; // lng/lat of initial centre
  fitAll?: boolean;
  settings?: AppSettings;
}

/**
 * OpenStreetMap (Leaflet) — real-world map, free tiles, no API key.
 * In google mode: Pt.x = lng, Pt.y = lat.
 */
export function OSMMap({
  className,
  routes,
  stops,
  points,
  buses,
  editPoints,
  onMapClick,
  onEditPointClick,
  onEditPointMove,
  center,
  fitAll = true,
}: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const mapClickRef = useRef(onMapClick);
  const editClickRef = useRef(onEditPointClick);
  const editMoveRef = useRef(onEditPointMove);
  mapClickRef.current = onMapClick;
  editClickRef.current = onEditPointClick;
  editMoveRef.current = onEditPointMove;

  // load Leaflet lazily (client-only) so static prerender never touches `window`
  const [lmod, setLmod] = useState<typeof import("leaflet") | null>(null);
  useEffect(() => {
    let c = false;
    import("leaflet").then((m) => {
      if (!c) setLmod((m.default ?? m) as typeof import("leaflet"));
    });
    return () => {
      c = true;
    };
  }, []);

  // init once
  useEffect(() => {
    if (!lmod) return;
    if (!elRef.current || mapRef.current) return;
    const start = center ? [center.y, center.x] : [7.2906, 80.6337]; // Colombo default
    const map = lmod.map(elRef.current, { zoomControl: true }).setView(start as L.LatLngTuple, 13);
    lmod.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    layerRef.current = lmod.layerGroup().addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      mapClickRef.current?.({ x: +e.latlng.lng.toFixed(6), y: +e.latlng.lat.toFixed(6) });
    });
    mapRef.current = map;
    const t = setTimeout(() => map.invalidateSize(), 60);
    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lmod]);

  // rebuild overlay
  useEffect(() => {
    if (!lmod) return;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const bounds: L.LatLngTuple[] = [];

    // committed routes
    for (const r of routes) {
      if (!r.points.length) continue;
      const ll = r.points.map((p) => [p.y, p.x] as L.LatLngTuple);
      if (r.closed !== false) ll.push(ll[0]);
      lmod.polyline(ll, { color: "#0e7a5b", weight: 4, opacity: 0.85 }).addTo(layer);
      bounds.push(...ll);
    }

    // stops
    for (const s of stops) {
      const icon = lmod.divIcon({
        className: "",
        html: `<div style="width:18px;height:18px;border-radius:9999px;background:#f59e0b;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      lmod.marker([s.y, s.x], { icon }).bindTooltip(s.name, { direction: "top" }).addTo(layer);
      bounds.push([s.y, s.x]);
    }

    // draft route (amber dashed)
    if (points.length) {
      const ll = points.map((p) => [p.y, p.x] as L.LatLngTuple);
      lmod.polyline(ll, { color: "#f59e0b", weight: 3, dashArray: "6 6" }).addTo(layer);
      bounds.push(...ll);
    }

    // buses
    for (const b of buses) {
      const t = b.telemetry;
      if (!t?.location) continue;
      const color = b.meta?.color ?? "#0e7a5b";
      const icon = lmod.divIcon({
        className: "",
        html: `<div style="width:22px;height:22px;border-radius:9999px;background:${color};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45)"></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      lmod.marker([t.location.y, t.location.x], { icon }).bindTooltip(b.meta?.name ?? b.id, { direction: "top" }).addTo(layer);
      bounds.push([t.location.y, t.location.x]);
    }

    // editable numbered points (draggable)
    editPoints?.forEach((p, i) => {
      const icon = lmod.divIcon({
        className: "",
        html: `<div style="width:24px;height:24px;border-radius:9999px;background:#0284c7;color:#fff;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font:700 12px/1 ui-sans-serif,system-ui">${i + 1}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      const m = lmod.marker([p.y, p.x], { icon, draggable: true, zIndexOffset: 500 });
      m.on("click", () => editClickRef.current?.(i));
      m.on("drag", (e) => {
        const ll = (e.target as L.Marker).getLatLng();
        editMoveRef.current?.(i, { x: +ll.lng.toFixed(6), y: +ll.lat.toFixed(6) });
      });
      m.bindTooltip(`Point ${i + 1} — drag to move, click to delete`, { direction: "top" });
      m.addTo(layer);
      bounds.push([p.y, p.x]);
    });

    if (fitAll && bounds.length) {
      const pad = editPoints?.length ? lmod.latLngBounds(bounds).pad(0.25) : lmod.latLngBounds(bounds).pad(0.15);
      map.fitBounds(pad, { animate: false });
    }
  }, [routes, stops, points, buses, editPoints, fitAll, lmod]);

  return <div ref={elRef} className={cn("min-h-[280px] w-full", className)} />;
}
