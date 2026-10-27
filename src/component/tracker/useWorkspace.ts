"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LocalFolder, LocalSubject } from "@/utils/workspace";

/** `enabled` is false unless the server sets WORKSPACE_DIR (self-hosting on your own machine). */
export interface Workspace { enabled: boolean; dir: string; hostDir: string; folders: LocalFolder[]; subjects: LocalSubject[] }

let shared: Promise<Workspace> | null = null;
const load = (force = false) => {
  if (!shared || force) {
    shared = fetch("/api/workspace", { cache: "no-store" }).then(async (r) => {
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      return body as Workspace;
    });
    shared.catch(() => { shared = null; });
  }
  return shared;
};

/** Local workspace folder: which projects have a folder, and which subject PDFs exist. */
export function useWorkspace() {
  const [ws, setWs] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback((force = false) => {
    load(force).then((w) => { setWs(w); setError(null); }).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const bySlug = useMemo(() => {
    const m = new Map<string, LocalFolder>();
    for (const f of ws?.folders ?? []) for (const x of [f, ...f.children]) if (x.slug && !m.has(x.slug)) m.set(x.slug, x);
    return m;
  }, [ws]);
  const subjectBySlug = useMemo(() => new Map((ws?.subjects ?? []).filter((s) => s.slug).map((s) => [s.slug as string, s.file])), [ws]);

  return { ws, enabled: !!ws?.enabled, error, refresh: () => refresh(true), folderOf: (slug: string) => bySlug.get(slug), subjectOf: (slug: string) => subjectBySlug.get(slug) };
}

export async function workspaceAction(body: Record<string, string>) {
  const r = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const res = await r.json();
  if (!r.ok) throw new Error(res.error || `HTTP ${r.status}`);
  return res;
}

/** Opens the folder in VS Code on the Mac (works from the browser, even when the app runs in Docker). */
export const vscodeUrl = (hostPath: string) => `vscode://file${encodeURI(hostPath)}`;

export const copyPath = (p: string) => navigator.clipboard?.writeText(p);

export const subjectUrl = (file: string) => `/api/workspace?subject=${encodeURIComponent(file)}`;

export function ago(iso: string | null): string {
  if (!iso) return "–";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${(days / 365).toFixed(1)}y ago`;
}
