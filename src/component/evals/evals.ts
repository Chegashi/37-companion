// Evaluation sheets scraped from 42evalhub.com (scripts/scrape_evalhub.py → src/data/evals*.json).
// This module only loads the small index, so any page can link a project to its sheet(s);
// the full sheets are imported by the /evals page alone.
import indexJson from "@/data/evals-index.json";
import { catalog } from "@/component/tracker/data";

export interface EvalIndexEntry { slug: string; name: string; group: "common" | "specs"; intra_slug: string | null; questions: number }
export type EvalBlock = { type: "p"; text: string } | { type: "pre"; text: string } | { type: "ul"; items: string[] };
export interface EvalQuestion { name: string; kind: "yesno" | "rate"; max?: number; body: EvalBlock[] }
export interface EvalSection { title: string; note: string; bonus: boolean; questions: EvalQuestion[] }
export interface EvalSheet extends EvalIndexEntry {
  file: string; title: string | null; evaluate: string; introduction: string; guidelines: string;
  attachments: { name: string; url: string | null }[]; sections: EvalSection[];
}

export const EVAL_INDEX = indexJson as EvalIndexEntry[];
export const evalHref = (slug: string) => `/evals?sheet=${encodeURIComponent(slug)}`;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Sheet → catalog project. Common Core sheets carry their intra slug; the others match a catalog
// project, or a piscine module ("Django - 0 - Initiation" → piscine-django), by name.
const byKey = new Map<string, string>();
const moduleByKey = new Map<string, string>(); // piscine module name → its own intra slug
for (const p of catalog.projects) {
  byKey.set(norm(p.slug), p.slug);
  byKey.set(norm(p.name), p.slug);
  for (const m of p.modules ?? []) { byKey.set(norm(m.name), p.slug); moduleByKey.set(norm(m.name), m.slug); }
}
const ALIASES: Record<string, string> = { cpp00: "cpp-module-00", cpp01: "cpp-module-01", cpp02: "cpp-module-02", cpp03: "cpp-module-03", cpp04: "cpp-module-04", cpp05: "cpp-module-05", cpp06: "cpp-module-06", cpp07: "cpp-module-07", cpp08: "cpp-module-08", cpp09: "cpp-module-09" };

/** Catalog / intra slug of the project a sheet evaluates (best effort). */
export function projectSlugOf(e: EvalIndexEntry): string {
  return byKey.get(norm(e.intra_slug ?? "")) ?? byKey.get(norm(e.name)) ?? ALIASES[e.slug] ?? e.intra_slug ?? e.slug;
}

export type EvalStatus = "validated" | "in_progress" | "failed" | "todo";
/** Your intra status for a sheet's project — a piscine module sheet uses that module's own status. */
export function statusOf(e: EvalIndexEntry, projects: { slug: string; status: string; validated: boolean }[]): EvalStatus {
  const slugs = [moduleByKey.get(norm(e.name)), projectSlugOf(e)].filter(Boolean) as string[];
  const mine = slugs.map((s) => projects.find((p) => p.slug === s)).find(Boolean);
  if (!mine) return "todo";
  if (mine.validated) return "validated";
  return mine.status === "finished" ? "failed" : "in_progress";
}

const sheetsBySlug = new Map<string, EvalIndexEntry[]>();
for (const e of EVAL_INDEX) {
  const key = norm(projectSlugOf(e));
  sheetsBySlug.set(key, [...(sheetsBySlug.get(key) ?? []), e]);
}

/** Eval sheets for a project — by its slug, else its name (the calculator's custom rows). */
export function sheetsFor(row: { slug: string | null; name: string }): EvalIndexEntry[] {
  return (row.slug ? sheetsBySlug.get(norm(row.slug)) : undefined)
    ?? sheetsBySlug.get(norm(byKey.get(norm(row.name)) ?? row.name))
    ?? [];
}
