"use client";
import { useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import type { Bus, Geofence, Pt, Route } from "@/lib/types";

/**
 * Wayline city map. Arena coordinates are metres (0..2); the SVG viewBox is
 * 0..20 so S=10 px per metre. Light blocks, white streets, green route,
 * stop dots, moving bus markers, dashed geofences.
 */
const S = 10;

function CityBlocks() {
  // deterministic light blocks so streets (gaps) read as the reference mock
  const blocks: { x: number; y: number; w: number; h: number }[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      if (rnd() < 0.18) continue; // park / empty lot
      const inset = 0.9 + rnd() * 0.5;
      blocks.push({
        x: gx * 5 + inset,
        y: gy * 5 + inset,
        w: 5 - inset * 2,
        h: 5 - inset * 2,
      });
    }
  }
  return (
    <g>
      {blocks.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          rx={0.7}
          fill="#eef1ef"
        />
      ))}
    </g>
  );
}

interface Props {
  buses?: Bus[];
  routes?: Route[];
  routeFilter?: string | null;
  selectedBusId?: string | null;
  onSelectBus?: (id: string) => void;
  fences?: Geofence[];
  onMapClick?: (p: Pt) => void;
  /** route-editor draft: points under edit, rendered as a dashed amber line */
  editPoints?: Pt[];
  /** click a draft point to remove it (index) */
  onEditPointClick?: (i: number) => void;
  /** drag a draft point to a new position (index, new coords) */
  onEditPointMove?: (i: number, p: Pt) => void;
  /** move mode: ignore map clicks — drag a numbered point only */
  moveMode?: boolean;
  demo?: boolean; // landing page: decorative route with a looping bus
  className?: string;
}

export function WaylineMap({
  buses = [],
  routes = [],
  routeFilter,
  selectedBusId,
  onSelectBus,
  fences = [],
  onMapClick,
  editPoints,
  onEditPointClick,
  onEditPointMove,
  moveMode = false,
  demo = false,
  className,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ i: number; moved: boolean } | null>(null);

  /** screen coords → arena Pt (0..2) */
  const toPt = (e: { clientX: number; clientY: number }): Pt | null => {
    const el = svgRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2;
    const y = ((e.clientY - rect.top) / rect.height) * 2;
    return { x: +Math.min(1.99, Math.max(0.01, x)).toFixed(2), y: +Math.min(1.99, Math.max(0.01, y)).toFixed(2) };
  };
  const shownRoutes = routeFilter
    ? routes.filter((r) => r.id === routeFilter)
    : routes;

  return (
    <div className={cn("relative overflow-hidden rounded-2xl bg-white", className)}>
      <svg
        viewBox="0 0 20 20"
        ref={svgRef}
        className="block h-full w-full select-none"
        onPointerMove={(e) => {
          const d = dragRef.current;
          if (!d || !onEditPointMove) return;
          const p = toPt(e);
          if (!p) return;
          d.moved = true;
          onEditPointMove(d.i, p);
        }}
        onPointerUp={() => {
          const d = dragRef.current;
          dragRef.current = null;
          if (d && !d.moved && !moveMode) onEditPointClick?.(d.i);
        }}
        onPointerLeave={() => {
          dragRef.current = null;
        }}
        onClick={(e) => {
          if (!onMapClick || moveMode) return;
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * 2;
          const y = ((e.clientY - rect.top) / rect.height) * 2;
          onMapClick({ x: +x.toFixed(2), y: +y.toFixed(2) });
        }}
      >
        <rect x={0} y={0} width={20} height={20} fill="#fbfcfb" />
        <CityBlocks />

        {/* route polylines */}
        {shownRoutes.map((r) => {
          const pts = r.points.map((p) => `${p.x * S},${p.y * S}`).join(" ");
          return (
            <g key={r.id}>
              <polyline
                points={pts}
                fill="none"
                stroke={r.closed ? undefined : "none"}
              />
              <polyline
                points={pts}
                fill="none"
                stroke="#0e7a5b"
                strokeWidth={0.42}
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray="0 0"
                opacity={0.9}
              />
              <polyline
                points={pts}
                fill="none"
                stroke="#ffffff"
                strokeWidth={0.14}
                strokeDasharray="0.55 0.55"
                strokeLinecap="round"
                className="animate-dash"
                opacity={0.95}
              />
              {(r.stops ?? []).map((s) => (
                <g key={s.name}>
                  <circle cx={s.x * S} cy={s.y * S} r={0.55} fill="#fff" stroke="#0e7a5b" strokeWidth={0.16} />
                  <circle cx={s.x * S} cy={s.y * S} r={0.18} fill="#0e7a5b" />
                  <text
                    x={s.x * S}
                    y={s.y * S + 1.45}
                    textAnchor="middle"
                    fontSize={0.78}
                    fontWeight={600}
                    fill="#31413a"
                  >
                    {s.name}
                  </text>
                </g>
              ))}
            </g>
          );
        })}

        {/* route editor draft */}
        {editPoints && (
          <g>
            {editPoints.length > 1 && (
              <polyline
                points={editPoints.map((p) => `${p.x * S},${p.y * S}`).join(" ")}
                fill="none"
                stroke="#d97706"
                strokeWidth={0.3}
                strokeDasharray="0.4 0.3"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={0.9}
              />
            )}
            {editPoints.map((p, i) => (
              <g
                key={i}
                className="cursor-grab active:cursor-grabbing"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  svgRef.current?.setPointerCapture?.(e.pointerId);
                  dragRef.current = { i, moved: false };
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <circle cx={p.x * S} cy={p.y * S} r={0.75} fill="transparent" />
                <circle cx={p.x * S} cy={p.y * S} r={0.42} fill="#fff" stroke="#d97706" strokeWidth={0.14} />
                <text
                  x={p.x * S}
                  y={p.y * S + 0.22}
                  textAnchor="middle"
                  fontSize={0.62}
                  fontWeight={700}
                  fill="#92400e"
                >
                  {i + 1}
                </text>
              </g>
            ))}
          </g>
        )}

        {/* geofences */}
        {fences.map((f, i) => (
          <circle
            key={i}
            cx={f.x * S}
            cy={f.y * S}
            r={f.r * S}
            fill="#0e7a5b"
            fillOpacity={0.07}
            stroke="#0e7a5b"
            strokeOpacity={0.55}
            strokeWidth={0.12}
            strokeDasharray="0.3 0.28"
          />
        ))}

        {/* buses */}
        {!demo &&
          buses
            .filter((b) => (routeFilter ? b.meta?.routeId === routeFilter : true))
            .map((b) => {
              const p = b.telemetry?.location;
              if (!p) return null;
              const selected = b.id === selectedBusId;
              return (
                <motion.g
                  key={b.id}
                  initial={false}
                  animate={{ x: p.x * S, y: p.y * S }}
                  transition={{ type: "tween", duration: 1, ease: "linear" }}
                  className={onSelectBus ? "cursor-pointer" : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectBus?.(b.id);
                  }}
                >
                  {selected && (
                    <circle r={1.5} fill="#0e7a5b" opacity={0.16}>
                      <animate attributeName="r" values="1.3;1.8;1.3" dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <rect
                    x={-0.85}
                    y={-0.5}
                    width={1.7}
                    height={1}
                    rx={0.28}
                    fill={b.meta?.color ?? "#0e7a5b"}
                    stroke="#fff"
                    strokeWidth={0.14}
                  />
                  <rect x={-0.55} y={-0.28} width={1.1} height={0.22} rx={0.08} fill="#fff" opacity={0.85} />
                  <text
                    y={1.15}
                    textAnchor="middle"
                    fontSize={0.72}
                    fontWeight={700}
                    fill="#182220"
                    paintOrder="stroke"
                    stroke="#ffffff"
                    strokeWidth={0.22}
                  >
                    {b.meta?.name ?? b.id}
                  </text>
                </motion.g>
              );
            })}

        {/* demo bus looping the route */}
        {demo && shownRoutes[0] && (
          <DemoBus pts={shownRoutes[0].points} />
        )}
      </svg>
    </div>
  );
}

function DemoBus({ pts }: { pts: Pt[] }) {
  const kf = pts.map((p) => ({ x: p.x * S, y: p.y * S }));
  return (
    <motion.g
      animate={{ x: kf.map((k) => k.x), y: kf.map((k) => k.y) }}
      transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
    >
      <circle r={1.4} fill="#0e7a5b" opacity={0.14} />
      <rect x={-0.85} y={-0.5} width={1.7} height={1} rx={0.28} fill="#0e7a5b" stroke="#fff" strokeWidth={0.14} />
      <rect x={-0.55} y={-0.28} width={1.1} height={0.22} rx={0.08} fill="#fff" opacity={0.85} />
    </motion.g>
  );
}
