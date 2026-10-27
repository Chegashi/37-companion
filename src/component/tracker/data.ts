import catalogJson from "@/data/projects.json";
import roadmapJson from "@/data/roadmap.json";
import careerJson from "@/data/career.json";
import rncp6web from "@/data/rncp/6-web.json";
import rncp6apps from "@/data/rncp/6-apps.json";
import rncp7sec from "@/data/rncp/7-sec.json";
import rncp7ai from "@/data/rncp/7-ai.json";
import { levelForXp, xpForLevel } from "@/utils/levels";
import type { TrackerMe } from "@/app/api/tracker/me/tracker.types";

// ------------------------------------------------------------------ catalog
export interface CatalogModule { id: number; name: string; slug: string; xp: number; estimate: string | null }
export interface CatalogProject {
  id: number | null;
  name: string;
  slug: string;
  url: string | null;
  xp: number;
  xp_with_modules?: number;
  estimate: string | null;
  estimate_hours: number | null;
  team: string;
  /** Each entry is a list of alternatives; one of them must be validated. */
  requires: string[][];
  blocked_while_ongoing: string[];
  available_on_campus: boolean;
  subscribable: boolean;
  deprecated?: boolean;
  objectives: string[];
  description: string;
  subject_pdf: string[];
  rncp_blocks: string[];
  unlocks: string[];
  modules?: CatalogModule[];
}

export const catalog = catalogJson as { generated_at: string; count: number; projects: CatalogProject[] };
export const catalogBySlug: Record<string, CatalogProject> = Object.fromEntries(catalog.projects.map((p) => [p.slug, p]));
export const projectXp = (p: CatalogProject) => p.xp_with_modules ?? p.xp;
/** XP still to earn: 0 once validated, and a piscine's validated modules are already in your level. */
export const remainingXp = (p: CatalogProject, validated: Set<string>) =>
  validated.has(p.slug) ? 0 : p.xp + (p.modules ?? []).filter((m) => !validated.has(m.slug)).reduce((sum, m) => sum + m.xp, 0);

// ------------------------------------------------------------------ roadmap
// A suggested path through the advanced projects, by domain (src/data/roadmap.json). The calculator,
// RNCP planner and projects page use it for "quick add" and domain labels.
export interface RoadmapItem { slug: string; lane: "solo" | "team" }
export interface RoadmapPhase { id: number; short?: string; title: string; goal: string; why?: string; optional?: boolean; projects: RoadmapItem[] }
export const roadmap = roadmapJson as { goal: string; titles: string[]; phases: RoadmapPhase[] };

/** Industry certifications that build on 42 projects (shown as a layer on the holy graph). */
export interface Certification { id: string; domain: string; name: string; provider: string; after: string[]; why: string; optional?: boolean }
export const career = careerJson as { note: string; certifications: Certification[] };
/** Certifications are ticked off in this browser (key: certification id). */
export const CERTS_DONE_KEY = "37c-certs-done";

export const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" });

// --------------------------------------------------------------------- rncp
// Blocks follow the official intra pages "RNCP 6 certificate" / "RNCP 7 certificate"
// (42 Paris homologated certificates — RNCP 39783 and 39774).
export interface RncpProject { id: number; name: string; xp: number }
export interface RncpBlock { id: number; name: string; min_xp: number; min_projects: number; projects: RncpProject[] }
export interface RncpTitle { key: string; label: string; rncp: 6 | 7; level: number; events: number; experiences: number; blocks: RncpBlock[] }

export const RNCP_TITLES: RncpTitle[] = [
  { key: "6-web", label: "RNCP 6 — Web & mobile", rncp: 6, level: 17, events: 10, experiences: 2, blocks: rncp6web as RncpBlock[] },
  { key: "6-apps", label: "RNCP 6 — Applicative software", rncp: 6, level: 17, events: 10, experiences: 2, blocks: rncp6apps as RncpBlock[] },
  { key: "7-sec", label: "RNCP 7 — Network & IS (Security)", rncp: 7, level: 21, events: 15, experiences: 2, blocks: rncp7sec as RncpBlock[] },
  { key: "7-ai", label: "RNCP 7 — Databases & Data", rncp: 7, level: 21, events: 15, experiences: 2, blocks: rncp7ai as RncpBlock[] },
];

export const blockLabel = (name: string) =>
  ({
    "blocks.web": "Web", "blocks.mobile": "Mobile", "blocks.suite": "Suite", OOP: "Object-oriented",
    "blocks.imperative-prog": "Imperative", "blocks.functional-prog": "Functional", "blocks.security": "Security",
    UNIX: "Unix / Kernel", "blocks.admin-sys": "System administration", "blocks.ai": "Artificial intelligence",
    "blocks.databases": "Web - Database",
  })[name] ?? name;

// Full-time professional experiences that count toward RNCP (part-time projects don't, per the intra rules).
export const EXPERIENCE_SLUGS = ["work-experience-i", "work-experience-ii", "startup-experience", "first-internship", "startup-internship"];

/** Validated (or planned) post-Common-Core group projects — both titles need 2. */
export function groupProjects(me: TrackerMe | null, plan: Plan) {
  const isGroup = (slug: string) => { const p = catalogBySlug[slug]; return !!p && p.team !== "solo" && !EXPERIENCE_SLUGS.includes(slug); };
  const validated = (me?.projects ?? []).filter((p) => p.validated && isGroup(p.slug)).map((p) => p.slug);
  const planned = catalog.projects.filter((p) => p.id != null && plan[p.id] != null && isGroup(p.slug) && !validated.includes(p.slug)).map((p) => p.slug);
  return { validated, planned };
}

/** A planned project and the mark you expect (100–125). */
export type Plan = Record<number, number>;

export interface BlockProgress {
  block: RncpBlock;
  xp: number;
  count: number;
  done: boolean;
  rows: { project: RncpProject; state: "validated" | "planned" | "in_progress" | "todo"; mark: number | null; xp: number }[];
}

export function blockProgress(block: RncpBlock, me: TrackerMe | null, plan: Plan): BlockProgress {
  const byId = new Map((me?.projects ?? []).map((p) => [p.id, p]));
  let xp = 0, count = 0;
  const rows = block.projects.map((project) => {
    const mine = byId.get(project.id);
    if (mine?.validated) {
      const gained = Math.floor((project.xp * (mine.finalMark ?? 100)) / 100);
      xp += gained; count++;
      return { project, state: "validated" as const, mark: mine.finalMark, xp: gained };
    }
    if (plan[project.id] != null) {
      const gained = Math.round((project.xp * plan[project.id]) / 100);
      xp += gained; count++;
      return { project, state: "planned" as const, mark: plan[project.id], xp: gained };
    }
    return { project, state: mine && mine.status !== "finished" ? ("in_progress" as const) : ("todo" as const), mark: null, xp: 0 };
  });
  return { block, xp, count, done: xp >= block.min_xp && count >= block.min_projects, rows };
}

/** Catalog XP of every distinct planned project (by intra id), at the planned mark. */
export function plannedXp(plan: Plan, me: TrackerMe | null): number {
  const validated = new Set((me?.projects ?? []).filter((p) => p.validated).map((p) => p.id));
  const byId = new Map<number, number>();
  for (const t of RNCP_TITLES) for (const b of t.blocks) for (const p of b.projects) byId.set(p.id, p.xp);
  for (const p of catalog.projects) if (p.id != null) byId.set(p.id, projectXp(p));
  return Object.entries(plan).reduce((sum, [id, mark]) => {
    if (validated.has(Number(id))) return sum;
    return sum + Math.round(((byId.get(Number(id)) ?? 0) * mark) / 100);
  }, 0);
}

/** RNCP projects by intra id and by name — the calculator's custom / Leets rows are matched by name. */
const rncpName = (s: string) => s.toLowerCase().replace(/^\[deprecated\]\s*/, "").replace(/[^a-z0-9]/g, "");
const rncpById = new Map<number, RncpProject>();
const rncpByName = new Map<string, number>();
for (const t of RNCP_TITLES) for (const b of t.blocks) for (const p of b.projects) { rncpById.set(p.id, p); rncpByName.set(rncpName(p.name), p.id); }

/** "R6·Web"-style labels of every RNCP block a project counts toward. */
export const rncpBlocksOf = (id: number) => [...new Set(RNCP_TITLES.flatMap((t) => t.blocks.filter((b) => b.projects.some((p) => p.id === id))
  .map((b) => `${t.label.replace(/ —.*/, "").replace("RNCP ", "R")}·${blockLabel(b.name)}`)))];

/** Intra id of a calculator row: its catalog project first, then an RNCP project with the same name. */
export function intraIdOf(row: { slug: string | null; name: string }): number | null {
  const id = row.slug ? catalogBySlug[row.slug]?.id : undefined;
  return id ?? rncpByName.get(rncpName(row.name)) ?? null;
}
export const inRncp = (id: number | null) => id != null && rncpById.has(id);

/** The calculator list as an RNCP plan (id → mark). Rows under 50 fail, so they validate nothing. */
export function planFromRows(rows: { slug: string | null; name: string; mark: number }[]): Plan {
  const plan: Plan = {};
  for (const r of rows) {
    const id = intraIdOf(r);
    if (id != null && r.mark >= 50) plan[id] = r.mark;
  }
  return plan;
}

export const projectedLevel = (level: number, extraXp: number) => levelForXp(xpForLevel(level) + extraXp);

export function validatedSlugs(me: TrackerMe | null): Set<string> {
  return new Set((me?.projects ?? []).filter((p) => p.validated).map((p) => p.slug));
}

/** Prerequisites (alternatives joined by " or ") that are not validated yet. */
export function missingPrerequisites(p: CatalogProject, validated: Set<string>): string[] {
  return p.requires.filter((alts) => !alts.some((s) => validated.has(s))).map((alts) => alts.join(" or "));
}
