"use client";
import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { db } from "@/lib/firebase";
import type { Bus, Route, Alert, BusEvent, SeatInfo, Rating, Warning } from "@/lib/types";
import { distToRoute } from "@/lib/geometry";

/** Generic single-path listener. Returns null until the first snapshot. */
export function useValue<T>(path: string | null | undefined) {
  const [val, setVal] = useState<T | null>(null);
  useEffect(() => {
    if (!path) return;
    return onValue(ref(db, path), (s) => setVal(s.val()), () => setVal(null));
  }, [path]);
  return val;
}

export function useBuses() {
  const [buses, setBuses] = useState<Bus[]>([]);
  useEffect(
    () =>
      onValue(ref(db, "buses"), (s) => {
        setBuses(
          Object.entries(s.val() ?? {}).map(([id, v]: [string, any]) => ({
            id,
            meta: v.meta,
            telemetry: v.telemetry,
            online: v.telemetry && Date.now() - v.telemetry.ts < 4000,
          })),
        );
      }),
    [],
  );
  return buses;
}

export function useRoutes() {
  const [routes, setRoutes] = useState<Route[]>([]);
  useEffect(
    () =>
      onValue(ref(db, "routes"), (s) =>
        setRoutes(
          Object.entries(s.val() ?? {}).map(([id, v]: [string, any]) => ({ id, ...v })) as unknown as Route[],
        ),
      ),
    [],
  );
  return routes;
}

export function useAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  useEffect(
    () =>
      onValue(ref(db, "alerts"), (s) =>
        setAlerts(
          Object.entries(s.val() ?? {}).map(([k, v]: [string, any]) => {
            const [busId, type] = k.split("_");
            return { busId, type: type as "crash" | "deviation", msg: v.msg, ts: v.ts, active: v.active } as Alert;
          }),
        ),
      ),
    [],
  );
  return alerts;
}

export function useBusEvents(busId?: string) {
  const [events, setEvents] = useState<BusEvent[]>([]);
  useEffect(() => {
    if (!busId) return;
    return onValue(ref(db, `events/${busId}`), (s) =>
      setEvents(Object.values(s.val() ?? {}) as unknown as BusEvent[]),
    );
  }, [busId]);
  return events;
}

export function useSeats(busId?: string) {
  const [seats, setSeats] = useState<SeatInfo[]>([]);
  useEffect(() => {
    if (!busId) return;
    return onValue(ref(db, `seats/${busId}`), (s) =>
      setSeats(Object.entries(s.val() ?? {}).map(([, v]: [string, any]) => v)),
    );
  }, [busId]);
  return seats;
}

export function useRatings(busId?: string) {
  const [ratings, setRatings] = useState<Rating[]>([]);
  useEffect(() => {
    if (!busId) return;
    return onValue(ref(db, `ratings/${busId}`), (s) =>
      setRatings(Object.values(s.val() ?? {}) as unknown as Rating[]),
    );
  }, [busId]);
  return ratings;
}

export function useWarning(busId?: string) {
  const [w, setW] = useState<Warning | null>(null);
  useEffect(() => {
    if (!busId) return;
    return onValue(ref(db, `commands/${busId}/warning`), (s) => setW(s.val()));
  }, [busId]);
  return w;
}

/** Deviation state for one bus against its route. */
export function useDeviation(bus: Bus | undefined) {
  const routes = useRoutes();
  const [off, setOff] = useState(false);
  useEffect(() => {
    if (!bus?.meta || !bus.online) return setOff(false);
    const r = routes.find((x) => x.id === bus.meta!.routeId);
    if (!r) return setOff(false);
    setOff(distToRoute(bus.telemetry!.location, r.points, r.closed) > r.tolerance);
  }, [bus, routes]);
  return off;
}
