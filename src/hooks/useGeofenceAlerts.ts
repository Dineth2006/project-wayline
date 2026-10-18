"use client";
import { useEffect, useRef, useState } from "react";
import { ref, onValue, push, remove, update } from "firebase/database";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useBuses } from "./useRealtime";
import type { Geofence } from "@/lib/types";

/**
 * Arrival alerts for a passenger: saved geofences (stop + optional bus),
 * a live "arrived" feed, and browser notifications.
 */
export function useGeofenceAlerts() {
  const { user } = useAuth();
  const buses = useBuses();
  const [fences, setFences] = useState<Geofence[]>([]);
  const [arrived, setArrived] = useState<{ label: string; ts: number }[]>([]);
  const [notif, setNotif] = useState(false);
  const fired = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!user) return;
    return onValue(ref(db, `geofences/${user.uid}`), (s) =>
      setFences(
        Object.entries(s.val() ?? {}).map(([id, v]) => ({ ...(v as Omit<Geofence, "id">), id })) as unknown as Geofence[],
      ),
    );
  }, [user]);

  // ping check: bus enters a fence
  useEffect(() => {
    if (!user || !fences.length) return;
    for (const f of fences) {
      const b = f.busId ? buses.find((x) => x.id === f.busId) : undefined;
      if (!b?.telemetry) continue;
      const d = Math.hypot(b.telemetry.location.x - f.x, b.telemetry.location.y - f.y);
      const key = f.busId ? `${f.busId}:${f.label}` : f.label;
      if (d <= f.r && (!fired.current[key] || Date.now() - fired.current[key] > 120_000)) {
        fired.current[key] = Date.now();
        const label = `${f.label}${f.busId ? " · " + (b.meta?.name ?? b.id) : ""}`;
        setArrived((a) => [{ label, ts: Date.now() }, ...a].slice(0, 10));
        if (notif && "Notification" in window && Notification.permission === "granted") {
          try {
            new Notification("Wayline arrival", { body: `${b.meta?.name ?? "Your bus"} is at ${f.label}` });
          } catch {
            /* notifications blocked */
          }
        }
      }
    }
  }, [buses, fences, notif, user]);

  const askNotif = async () => {
    if (!("Notification" in window)) return;
    const p = await Notification.requestPermission();
    setNotif(p === "granted");
  };

  const add = async (f: Omit<Geofence, "busId" | "id"> & { busId?: string }) => {
    if (!user) return;
    await push(ref(db, `geofences/${user.uid}`), { ...f, ts: Date.now() });
  };
  const del = async (id: string) => {
    if (user) await remove(ref(db, `geofences/${user.uid}/${id}`));
  };
  const setBus = async (id: string, busId: string | null) => {
    if (!user) return;
    await update(ref(db, `geofences/${user.uid}/${id}`), { busId: busId ?? null });
  };

  return { fences, arrived, add, del, setBus, askNotif, notif };
}
