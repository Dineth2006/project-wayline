"use client";
import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import { db } from "@/lib/firebase";
import type { AppSettings } from "@/lib/types";

const LS_KEY = "wayline:settings";

function readLocal(): AppSettings {
  if (typeof window === "undefined") return {};
  try {
    return (JSON.parse(window.localStorage.getItem(LS_KEY) ?? "{}") as AppSettings) ?? {};
  } catch {
    return {};
  }
}

/**
 * Live app settings from RTDB `settings/` (operator-controlled).
 * Falls back to browser storage when the Firebase node is missing or the
 * rules deny it — the app still works (mode/key apply per browser).
 */
export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>({});

  useEffect(() => {
    const off = onValue(
      ref(db, "settings"),
      (s) => {
        const v = s.val() as AppSettings | null;
        setSettings(v && Object.keys(v).length ? v : readLocal());
      },
      () => setSettings(readLocal()),
    );
    return off;
  }, []);

  return settings;
}

/** Persist settings locally (always); the RTDB copy is the cross-device source. */
export function saveSettingsLocal(patch: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    const next = { ...readLocal(), ...patch };
    window.localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {
    /* storage full/blocked — ignore */
  }
}

