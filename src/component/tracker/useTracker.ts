"use client";
import { useCallback, useEffect, useState } from "react";
import type { TrackerMe } from "@/app/api/tracker/me/tracker.types";

let shared: Promise<TrackerMe> | null = null;

function load(force = false): Promise<TrackerMe> {
  if (!shared || force) {
    shared = fetch("/api/tracker/me", { cache: "no-store" }).then(async (r) => {
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      return body as TrackerMe;
    });
    shared.catch(() => { shared = null; });
  }
  return shared;
}

/** Live snapshot of the logged-in user's cursus, shared by every tracker page. */
export function useTracker() {
  const [me, setMe] = useState<TrackerMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback((force = false) => {
    setLoading(true);
    load(force)
      .then((d) => { setMe(d); setError(null); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  return { me, error, loading, refresh: () => refresh(true) };
}

/** State persisted in this browser's localStorage (per-viewer convenience only). */
export function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setValue(JSON.parse(raw));
    } catch { /* storage unavailable */ }
  }, [key]);
  const update = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ }
      return v;
    });
  }, [key]);
  return [value, update] as const;
}
