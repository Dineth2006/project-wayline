"use client";
import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import { db } from "@/lib/firebase";

/**
 * The uploaded arena background image (data URL), live across all clients.
 * `null` until the first snapshot (SSR-safe) or when no image is set.
 */
export function useArenaMap(): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const r = ref(db, "arenaMap");
    return onValue(r, (snap) => setUrl(typeof snap.val() === "string" ? (snap.val() as string) : null));
  }, []);

  return url;
}
