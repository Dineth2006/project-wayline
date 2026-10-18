"use client";
import { useEffect, useRef } from "react";
import { ref, update } from "firebase/database";
import { db } from "@/lib/firebase";
import { distToRoute } from "@/lib/geometry";
import { useBuses, useRoutes } from "./useRealtime";

const OFF_TTL = 10_000; // ms a bus may sit off-route before it alarms
const COOLDOWN = 20_000; // silence between re-alarms for the same state

/**
 * Operator-side safety engine: watches every bus and raises a DB alert when a
 * bus crashes or sits off its route long enough to be a real incident.
 */
export function useOperatorEngine() {
  const buses = useBuses();
  const routes = useRoutes();
  const offSince = useRef<Record<string, number>>({});
  const lastAlarm = useRef<Record<string, number>>({});

  useEffect(() => {
    const now = Date.now();
    for (const bus of buses) {
      const route = routes.find((r) => r.id === bus.meta?.routeId);
      const crashed = !!bus.telemetry?.crash;

      if (crashed) {
        const key = `crash-${bus.id}`;
        if (!lastAlarm.current[key] || now - lastAlarm.current[key] > COOLDOWN) {
          lastAlarm.current[key] = now;
          void update(ref(db, `alerts/${bus.id}_crash`), {
            busId: bus.id,
            type: "crash",
            msg: `${bus.meta?.name ?? bus.id} reported a crash`,
            ts: now,
            active: true,
          });
        }
        continue;
      }

      if (route && bus.online && bus.telemetry) {
        const d = distToRoute(bus.telemetry.location, route.points, route.closed);
        if (d > route.tolerance) {
          if (!offSince.current[bus.id]) offSince.current[bus.id] = now;
          else if (now - offSince.current[bus.id] > OFF_TTL) {
            const key = `off-${bus.id}`;
            if (!lastAlarm.current[key] || now - lastAlarm.current[key] > COOLDOWN) {
              lastAlarm.current[key] = now;
              void update(ref(db, `alerts/${bus.id}_deviation`), {
                busId: bus.id,
                type: "deviation",
                msg: `${bus.meta?.name ?? bus.id} is off its route`,
                ts: now,
                active: true,
              });
            }
          }
        } else {
          delete offSince.current[bus.id];
        }
      } else {
        delete offSince.current[bus.id];
      }
    }
  }, [buses, routes]);
}
