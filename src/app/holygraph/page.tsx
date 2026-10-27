"use client";
// Holy graph — like the intra one. With your intra project_data.json imported it uses intra's exact
// positions, states and edge lines; without it, a computed layout: Common Core rings around Libft and
// every advanced project radiating out by track along its prerequisites. Live intra statuses override
// both. Certifications are gold boxes. Drag to pan, pinch / Ctrl+scroll / double-click / buttons to zoom.
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FiExternalLink, FiMaximize, FiMinus, FiPlus, FiRefreshCw, FiUpload, FiX } from "react-icons/fi";
import tracksJson from "@/data/tracks.json";
import layoutJson from "@/data/holygraph-layout.json";
import {
  CERTS_DONE_KEY, RNCP_TITLES, blockLabel, blockProgress, career, catalog, catalogBySlug, missingPrerequisites, projectXp, projectedLevel, remainingXp,
  type Certification, type Plan, type RncpTitle,
} from "@/component/tracker/data";
import { useStoredState, useTracker } from "@/component/tracker/useTracker";
import type { TrackedProject, TrackerMe } from "@/app/api/tracker/me/tracker.types";
import { Badge, PageState, fmt } from "@/component/tracker/ui";
import type { CalcRow } from "@/component/calculator/calc";

type Status = "validated" | "in_progress" | "available" | "locked" | "failed";
const STATUS_LABEL: Record<Status, [string, "ok" | "wip" | "plan" | "todo" | "warn"]> = {
  validated: ["Validated", "ok"], in_progress: ["In progress", "wip"], available: ["Available", "plan"], locked: ["Locked", "todo"], failed: ["Failed — retry", "warn"],
};
const CERT_SHORT: Record<string, string> = {
  "aws-ccp": "AWS CCP", lfcs: "LFCS", ejpt: "eJPT", "aws-saa": "AWS SAA", psm: "PSM I", "htb-cpts": "HTB CPTS", "aws-mle": "AWS MLE", cka: "CKA",
  "htb-cjca": "HTB CJCA", "htb-cwes": "HTB CWES", "htb-cdsa": "HTB CDSA", "htb-cwee": "HTB CWEE", "htb-cwpe": "HTB CWPE", "htb-cape": "HTB CAPE", "htb-offensive-ai": "HTB Offensive AI",
  "aws-dea": "AWS Data Eng.", "hashicorp-terraform": "Terraform", "aws-aip": "AWS AI Pract.", "pmi-capm": "PMI CAPM", "databricks-de": "Databricks DE",
  "confluent-kafka": "Kafka CCDAK", "aws-dop": "AWS DevOps Pro", "nvidia-genl": "NVIDIA GenAI", cks: "CKS", "databricks-ml": "Databricks ML", pmp: "PMP",
};
const TITLE_SHORT: Record<string, string> = { "6-web": "RNCP 6 Web", "6-apps": "RNCP 6 Apps", "7-sec": "RNCP 7 Security", "7-ai": "RNCP 7 Data" };
const titlesOf = new Map<number, string[]>();
for (const t of RNCP_TITLES) for (const b of t.blocks) for (const p of b.projects) {
  const list = titlesOf.get(p.id) ?? [];
  if (!list.includes(t.key)) titlesOf.set(p.id, [...list, t.key]);
}
/** The logged-in user's holy graph data on intra (needs an intra browser session). */
const intraUrl = (me: TrackerMe | null) =>
  me ? `https://projects.intra.42.fr/project_data.json?cursus_id=21&campus_id=${me.campusId ?? ""}&login=${encodeURIComponent(me.login)}` : "https://projects.intra.42.fr/";
const INTRA_KEY = "37c-holygraph-intra";
const norm = (s: string) => s.replace(/^42cursus-/, "");

// ---- Track ownership (sector of each advanced project) ----
interface Track { id: string; title: string; tagline?: string; rncp?: string; stages: { title: string; projects: string[] }[] }
const TRACKS = (tracksJson as { tracks: Track[] }).tracks;
// Sub-steps are not projects (they never get a node).
const EXCLUDED = new Set(["work-experience-i-work-experience-i-contract-upload"]);
const EXTRA: Record<string, string[]> = {
  systems: ["libasm", "corewar", "abstract-vm", "xv", "zappy", "kfs-4", "kfs-5", "kfs-6", "kfs-7", "kfs-8", "kfs-9", "kfs-x"],
  ai: ["ft_linear_regression", "dslr", "matrix", "ai-experimentation-rushes"],
  algorithms: ["computorv1", "abstract_data", "libftpp"],
  graphics: ["doom-nukem", "guimp"],
  fullstack: ["piscine-ror", "tweet", "42_collaborative_resume"],
  devops: ["inception-of-things"],
  leadership: ["work-experience-i", "work-experience-ii", "part-time-i", "part-time-ii", "freddie-mercury"],
};
const OWNER = (() => {
  const owner = new Map<string, string>();
  const take = (s: string, id: string) => { if (catalogBySlug[s] && !catalogBySlug[s].deprecated && !EXCLUDED.has(s) && !owner.has(s)) owner.set(s, id); };
  for (const t of TRACKS) for (const st of t.stages) for (const s of st.projects) take(s, t.id);
  for (const [id, slugs] of Object.entries(EXTRA)) for (const s of slugs) take(s, id);
  return { owner };
})();
const trackTitle = (id?: string) => TRACKS.find((t) => t.id === id)?.title;
/** Every catalog project that counts toward an RNCP title (any block). */
const rncpProjects = (t: RncpTitle) => [...new Set(t.blocks.flatMap((b) => b.projects.map((p) => SLUG_OF_ID.get(p.id)).filter((s): s is string => !!s)))];
const trackProjects = (t: Track) => [...new Set([...t.stages.flatMap((st) => st.projects), ...(EXTRA[t.id] ?? [])])]
  .filter((s) => !EXCLUDED.has(s) && !catalogBySlug[s]?.deprecated);

// ---- Graph model ----
interface Pt { x: number; y: number }
type Shape = "circle" | "pill" | "rect";
interface GNode {
  slug: string; name: string; x: number; y: number; r: number; w: number; h: number; shape: Shape; status: Status;
  next: boolean; delay: number; core: boolean; sector?: string; mark?: number | null; rules?: string; duration?: string;
  sim?: boolean; // validated only in your simulation
}
interface Edge { points: Pt[]; lit: boolean; delay: number }
interface CertBox { cert: Certification; x: number; y: number; links: Pt[]; delay: number }
interface SectorLabel { title: string; x: number; y: number; anchor: "start" | "end" | "middle" }
interface Graph {
  source: "intra" | "computed"; nodes: GNode[]; edges: Edge[]; certs: CertBox[]; labels: SectorLabel[];
  rings: { r: number; done: boolean }[]; center: Pt; unit: number; bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

function liveStatus(mine: Map<string, TrackedProject>, slug: string): Status | null {
  const p = mine.get(slug);
  if (!p) return null;
  if (p.validated) return "validated";
  return p.status === "finished" ? "failed" : "in_progress";
}

function boundsOf(nodes: GNode[], certs: CertBox[], labels: SectorLabel[], pad: number) {
  const xs = [...nodes.map((n) => n.x), ...certs.map((c) => c.x), ...labels.map((l) => l.x)];
  const ys = [...nodes.map((n) => n.y), ...certs.map((c) => c.y), ...labels.map((l) => l.y)];
  return { minX: Math.min(...xs) - pad * 2.5, maxX: Math.max(...xs) + pad * 2.5, minY: Math.min(...ys) - pad, maxY: Math.max(...ys) + pad };
}

/** Node size in intra units, as on intra: big Libft / ft_transcendence, small module circles, pills, rectangles. */
function sizeOf(slug: string, name: string, kind: "project" | "exam" | "piscine"): Pick<GNode, "r" | "w" | "h" | "shape"> {
  if (kind === "piscine") return { r: 45, w: 150, h: 50, shape: "rect" };
  if (kind === "exam") return { r: 45, w: 130, h: 50, shape: "pill" };
  let r = 45;
  if (slug === "libft") r = 55;
  else if (slug === "ft_transcendence") r = 80;
  else if (/^(CPP|Java) Module/i.test(name) && !/^Java Module 09/i.test(name)) r = 32;
  return { r, w: 2 * r, h: 2 * r, shape: "circle" };
}

// ---- Mode 1: intra's own layout (imported project_data.json) ----
interface IntraNode { state: string; final_mark: number | null; kind: string; name: string; x: number; y: number; slug: string; by: { parent_id: number; points: [number, number][] }[]; duration?: string; rules?: string }

/** `planned`: slugs on the calculator list — highlighted as the next steps. */
function buildIntra(data: IntraNode[], me: TrackerMe | null, sim: Set<string>, planned: Set<string>): Graph {
  const mine = new Map((me?.projects ?? []).map((p) => [p.slug, p]));
  const raw = data.filter((n) => !(n.x === 0 && n.y === 0) && !EXCLUDED.has(norm(n.slug)));
  const lib = raw.find((n) => norm(n.slug) === "libft");
  const center = lib ? { x: lib.x, y: lib.y } : { x: 3000, y: 3000 };
  const dist = (p: Pt) => Math.hypot(p.x - center.x, p.y - center.y);
  const fromIntra = (n: IntraNode): Status => {
    if (n.state === "done") return (n.final_mark ?? 100) >= 50 ? "validated" : "failed";
    if (n.state === "fail") return "failed";
    if (n.state === "in_progress") return "in_progress";
    if (n.state === "available") return "available";
    return "locked";
  };
  const nodes: GNode[] = raw.map((n) => {
    const slug = norm(n.slug);
    const kind = n.kind === "piscine" ? "piscine" : n.kind === "exam" || n.kind === "rush" || /^Exam Rank/i.test(n.name) ? "exam" : "project";
    const real = liveStatus(mine, slug) ?? fromIntra(n);
    const simulated = sim.has(slug) && real !== "validated";
    return {
      slug, name: n.name, x: n.x, y: n.y, ...sizeOf(slug, n.name, kind), sim: simulated,
      status: simulated ? "validated" : real, next: planned.has(slug), delay: 0.15 + (dist(n) / 1000) * 0.9,
      core: n.by.length === 0 && dist(n) < 1060, sector: OWNER.owner.get(slug), mark: n.final_mark ?? mine.get(slug)?.finalMark ?? null,
      rules: n.rules, duration: n.duration,
    };
  });
  const bySlug = new Map(nodes.map((n) => [n.slug, n]));
  const edges: Edge[] = raw.flatMap((n) => {
    const node = bySlug.get(norm(n.slug))!;
    return n.by.map((b) => ({ points: b.points.map(([x, y]) => ({ x, y })), lit: node.status !== "locked", delay: node.delay - 0.2 }));
  });
  // Rings: the distinct distances of the Common Core nodes from Libft.
  const ds = nodes.filter((n) => n.core && dist(n) > 40).map((n) => ({ d: dist(n), done: n.status === "validated" })).sort((a, b) => a.d - b.d);
  const rings: { r: number; done: boolean }[] = [];
  let group: typeof ds = [];
  const flush = () => { if (group.length) rings.push({ r: group.reduce((a, g) => a + g.d, 0) / group.length, done: group.filter((g) => g.done).length * 2 >= group.length }); group = []; };
  for (const d of ds) { if (group.length && d.d - group[group.length - 1].d > 35) flush(); group.push(d); }
  flush();
  const certs: CertBox[] = [], labels: SectorLabel[] = []; // certifications are a layer, not boxes
  return { source: "intra", nodes, edges, certs, labels, rings, center, unit: 100, bounds: boundsOf(nodes, certs, labels, 160) };
}

// ---- Mode 2: computed layout ----
// Common Core at intra's own coordinates (centre = Libft at 3001,3000).
interface CoreNode { slug: string; name: string; at: [number, number]; kind?: "exam" | "cpp" }
const core = (slug: string, name: string, x: number, y: number, kind?: CoreNode["kind"]): CoreNode => ({ slug, name, at: [x, y], kind });
const CORE: CoreNode[] = [
  core("libft", "Libft", 3001, 3000),
  core("born2beroot", "Born2beroot", 2857, 2918), core("ft_printf", "ft_printf", 3145, 2918), core("get_next_line", "get_next_line", 3001, 3169),
  core("push_swap", "push_swap", 2794, 2740), core("pipex", "pipex", 3138, 2701), core("minitalk", "minitalk", 3223, 2753),
  core("so_long", "so_long", 3332, 2990), core("fdf", "FdF", 3322, 3090), core("fract-ol", "fract-ol", 3282, 3179),
  core("exam-rank-02", "Exam Rank 02", 3016, 3334, "exam"),
  core("exam-rank-03", "Exam Rank 03", 3043, 2504, "exam"), core("philosophers", "Philosophers", 2550, 3212), core("minishell", "minishell", 3409, 3289),
  core("cub3d", "cub3d", 2403, 2714), core("minirt", "miniRT", 2453, 2626), core("netpractice", "NetPractice", 2670, 3575),
  core("exam-rank-04", "Exam Rank 04", 3576, 3334, "exam"),
  core("cpp-module-00", "CPP Module 00", 3377, 2487, "cpp"), core("cpp-module-01", "CPP Module 01", 3402, 2402, "cpp"),
  core("cpp-module-02", "CPP Module 02", 3332, 2353, "cpp"), core("cpp-module-03", "CPP Module 03", 3262, 2402, "cpp"),
  core("cpp-module-04", "CPP Module 04", 3290, 2487, "cpp"),
  core("webserv", "webserv", 2630, 2258), core("ft_irc", "ft_irc", 2543, 2308), core("inception", "Inception", 3457, 3692),
  core("exam-rank-05", "Exam Rank 05", 3721, 2587, "exam"),
  core("cpp-module-05", "CPP Module 05", 2312, 3332, "cpp"), core("cpp-module-06", "CPP Module 06", 2339, 3247, "cpp"),
  core("cpp-module-07", "CPP Module 07", 2267, 3195, "cpp"), core("cpp-module-08", "CPP Module 08", 2197, 3247, "cpp"),
  core("cpp-module-09", "CPP Module 09", 2222, 3332, "cpp"),
  core("ft_transcendence", "ft_transcendence", 3766, 3639), core("exam-rank-06", "Exam Rank 06", 2062, 3344, "exam"),
];
const CENTER = { x: 3001, y: 3000 };
const RING_R = [0, 166, 332, 498, 663, 830, 997];
// What completes each ring (inner arrays = choose one).
const RING_NEEDS: string[][][] = [
  [["libft"]],
  [["born2beroot"], ["ft_printf"], ["get_next_line"]],
  [["push_swap"], ["pipex", "minitalk"], ["so_long", "fdf", "fract-ol"], ["exam-rank-02"]],
  [["philosophers"], ["minishell"], ["exam-rank-03"]],
  [["cub3d", "minirt"], ["netpractice"], ["exam-rank-04"], ...[0, 1, 2, 3, 4].map((k) => [`cpp-module-0${k}`])],
  [["webserv", "ft_irc"], ["inception"], ["exam-rank-05"], ...[5, 6, 7, 8, 9].map((k) => [`cpp-module-0${k}`])],
  [["ft_transcendence"], ["exam-rank-06"]],
];
// Advanced projects at intra's positions (from project_data.json + the intra screenshot).
interface LayoutNode { slug: string; name: string; x: number; y: number; kind: "project" | "piscine" | "exam"; alias?: string; big?: boolean }
// Intra's own wiring: each line starts at a project and ends at its parent, a junction or the ring.
interface LayoutEdge { child: string; points: [number, number][] }
const LAYOUT = layoutJson as unknown as { nodes: LayoutNode[]; edges: LayoutEdge[] };
const NODE_OF = new Map(LAYOUT.nodes.filter((l) => l.alias).map((l) => [l.alias!, l.slug]));
const ALIAS_OF = new Map(LAYOUT.nodes.filter((l) => l.alias).map((l) => [l.slug, l.alias!]));
/** Catalog project behind a graph node (Java Module 09 stands for the Java piscine). */
const catalogSlug = (nodeSlug: string) => ALIAS_OF.get(nodeSlug) ?? nodeSlug;
const SLUG_OF_ID = new Map(catalog.projects.filter((p) => p.id != null).map((p) => [p.id as number, p.slug]));
const SIM_KEY = "37c-holygraph-sim";
const LAYER_KEY = "37c-holygraph-layer";

function buildComputed(me: TrackerMe | null, sim: Set<string>, planned: Set<string>): Graph {
  const mine = new Map((me?.projects ?? []).map((p) => [p.slug, p]));
  const validated = new Set((me?.projects ?? []).filter((p) => p.validated).map((p) => p.slug));
  // Past the Common Core (an advanced project is validated) ⇒ the mandatory core is done even if intra omits it.
  const done = new Set(validated);
  if ([...validated].some((s) => catalogBySlug[s])) for (const ring of RING_NEEDS) for (const g of ring) if (g.length === 1) done.add(g[0]);
  const realDone = new Set(done);
  for (const s of sim) { done.add(s); done.add(catalogSlug(s)); }
  const isSim = (nodeSlug: string) => sim.has(nodeSlug) && !realDone.has(catalogSlug(nodeSlug));
  const statusOf = (slug: string, core: boolean): Status => {
    if (done.has(slug)) return "validated";
    const live = liveStatus(mine, slug);
    if (live) return live;
    if (core) return "available";
    const c = catalogBySlug[slug];
    return c && missingPrerequisites(c, done).length === 0 ? "available" : "locked";
  };
  const nodes: GNode[] = [];
  const pos = new Map<string, GNode>();
  const add = (n: GNode) => { nodes.push(n); pos.set(n.slug, n); };

  for (const c of CORE) {
    const [x, y] = c.at;
    const sz = sizeOf(c.slug, c.name, c.kind === "exam" ? "exam" : "project");
    add({ slug: c.slug, name: c.name, x, y, ...sz, sim: isSim(c.slug), status: statusOf(c.slug, true), next: planned.has(c.slug), delay: 0.15 + (Math.hypot(x - CENTER.x, y - CENTER.y) / 1000) * 0.9, core: true, mark: mine.get(c.slug)?.finalMark });
  }
  const rings = [1, 2, 3, 4, 5, 6].map((k) => ({ r: RING_R[k], done: RING_NEEDS[k].every((g) => g.some((s) => done.has(s))) }));

  // Advanced projects at their intra positions.
  for (const l of LAYOUT.nodes) {
    if (EXCLUDED.has(l.slug)) continue;
    const slug = l.alias ?? l.slug; // Java Module 09 stands for the Java piscine
    const sz = l.big ? { r: 62, w: 124, h: 124, shape: "circle" as const } : sizeOf(l.slug, l.name, l.kind);
    add({
      slug: l.slug, name: l.name, x: l.x, y: l.y, ...sz, sim: isSim(l.slug), status: statusOf(slug, false), next: planned.has(slug),
      delay: 0.9 + (Math.hypot(l.x - CENTER.x, l.y - CENTER.y) / 1000) * 0.6, core: false, sector: OWNER.owner.get(slug), mark: mine.get(slug)?.finalMark,
    });
  }
  // Lines exactly as intra draws them (trunks, junctions, hubs) — lit once the project is reachable.
  const edges: Edge[] = LAYOUT.edges.flatMap((e) => {
    const n = pos.get(e.child);
    if (!n) return [];
    return [{ points: e.points.map(([x, y]) => ({ x, y })), lit: n.status !== "locked", delay: n.delay - 0.2 }];
  });
  const certs: CertBox[] = [], labels: SectorLabel[] = []; // certifications are a layer, not boxes
  return { source: "computed", nodes, edges, certs, labels, rings, center: CENTER, unit: 100, bounds: boundsOf(nodes, certs, labels, 160) };
}

/** Name inside the node, shrunk to fit like on intra. */
function NodeLabel({ n }: { n: GNode }) {
  const fs = Math.max(n.r * 0.2, Math.min(n.r * 0.42, (n.w - n.r * 0.25) / (n.name.length * 0.56)));
  return <text y={fs * 0.36} textAnchor="middle" fontSize={fs} className={`hg-text hg-text--${n.status}`}>{n.name}</text>;
}
/** Highlight that follows the node's shape: a ring for projects, a box for piscines, a pill for exams. */
function Halo({ n, gap, className }: { n: GNode; gap: number; className: string }) {
  if (n.shape === "circle") return <circle r={n.r + gap} className={className} />;
  const w = n.w + 2 * gap, h = n.h + 2 * gap;
  return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={n.shape === "pill" ? h / 2 : 6} className={className} />;
}

function NodeShape({ n, selected }: { n: GNode; selected: boolean }) {
  const cls = `hg-node hg-node--${n.status} ${n.sim ? "hg-node--sim" : ""} ${selected ? "hg-node--sel" : ""}`;
  if (n.shape === "pill") return <rect x={-n.w / 2} y={-n.h / 2} width={n.w} height={n.h} rx={n.h / 2} className={cls} />;
  if (n.shape === "rect") return <rect x={-n.w / 2} y={-n.h / 2} width={n.w} height={n.h} rx={4} className={cls} />;
  return <circle r={n.r} className={cls} />;
}

/** Keep only what the graph needs from intra's file (drops long descriptions). */
function parseIntra(text: string): IntraNode[] {
  const data = JSON.parse(text);
  if (!Array.isArray(data) || !data.length || typeof data[0]?.x !== "number" || !data[0]?.slug) throw new Error("This doesn't look like intra's project_data.json.");
  return data.map((n: IntraNode) => ({
    state: n.state, final_mark: n.final_mark, kind: n.kind, name: n.name, x: n.x, y: n.y, slug: n.slug,
    by: (n.by ?? []).map((b) => ({ parent_id: b.parent_id, points: b.points })), duration: n.duration, rules: n.rules,
  }));
}

type Selection = { kind: "node"; slug: string } | null;
interface View { x: number; y: number; w: number; h: number }

export default function HolyGraphPage() {
  const { me, error, loading, refresh } = useTracker();
  const [certsDone, setCertsDone] = useStoredState<Record<string, boolean>>(CERTS_DONE_KEY, {});
  const [intra, setIntra] = useStoredState<{ loadedAt: string; nodes: IntraNode[] } | null>(INTRA_KEY, null);
  const [useIntra, setUseIntra] = useStoredState<boolean>(`${INTRA_KEY}-on`, true);
  const [layer, setLayer] = useStoredState<string>(LAYER_KEY, "");
  const [layerCat, setLayerCat] = useStoredState<"track" | "cert" | "rncp">(`${LAYER_KEY}-kind`, "track");
  const [simList, setSimList] = useStoredState<string[]>(SIM_KEY, []);
  const sim = useMemo(() => new Set(simList), [simList]);
  const toggleSim = (nodeSlug: string) => setSimList((l) => (l.includes(nodeSlug) ? l.filter((x) => x !== nodeSlug) : [...l, nodeSlug]));
  const [importOpen, setImportOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [sel, setSel] = useState<Selection>(null);
  const [anchor, setAnchor] = useState<Pt | null>(null);
  const [run, setRun] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [calcRows] = useStoredState<CalcRow[]>("37c-calculator-rows", []);
  const planned = useMemo(() => new Set(calcRows.flatMap((r) => (r.slug ? [r.slug] : []))), [calcRows]);
  const g = useMemo(() => (intra && useIntra ? buildIntra(intra.nodes, me, sim, planned) : buildComputed(me, sim, planned)), [intra, useIntra, me, sim, planned]);
  // Simulated validations → XP and the level they would bring.
  const simNodes = g.nodes.filter((n) => n.sim);
  const validatedNow = useMemo(() => new Set((me?.projects ?? []).filter((p) => p.validated).map((p) => p.slug)), [me]);
  const simXp = simNodes.reduce((a, n) => a + (catalogBySlug[catalogSlug(n.slug)] ? remainingXp(catalogBySlug[catalogSlug(n.slug)], validatedNow) : 0), 0);
  const simLevel = projectedLevel(me?.level ?? 0, simXp);
  const simPlan: Plan = useMemo(() => {
    const plan: Plan = {};
    for (const n of g.nodes) if (n.sim) { const id = catalogBySlug[catalogSlug(n.slug)]?.id; if (id != null) plan[id] = 100; }
    return plan;
  }, [g]);

  const load = (text: string) => {
    try {
      setIntra({ loadedAt: new Date().toISOString(), nodes: parseIntra(text) });
      setUseIntra(true); setImportOpen(false); setPaste(""); setImportError(null); setSel(null);
    } catch (e) { setImportError(e instanceof Error ? e.message : "Couldn't read that JSON."); }
  };

  // ---- Zoom & pan (viewBox) ----
  const boundsKey = JSON.stringify(g.bounds); // statuses change with the simulation; the layout does not
  const full: View = useMemo(() => { const b = JSON.parse(boundsKey) as Graph["bounds"]; return { x: b.minX, y: b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY }; }, [boundsKey]);
  const gRef = useRef(g);
  gRef.current = g;
  const [view, setView] = useState<View>(full);
  useEffect(() => setView(full), [full]);
  // Layer (domain, certification or RNCP title): its projects ringed in yellow, the view fitted to them.
  const [layerKind, layerId] = layer.includes(":") ? layer.split(":") : ["cert", layer];
  const cert = layerKind === "cert" ? career.certifications.find((c) => c.id === layerId) ?? null : null;
  const track = layerKind === "track" ? TRACKS.find((t) => t.id === layerId) ?? null : null;
  const rncp = layerKind === "rncp" ? RNCP_TITLES.find((t) => t.key === layerId) ?? null : null;
  const needed = useMemo(() => {
    let slugs: string[] = [];
    if (cert) slugs = cert.after;
    else if (track) slugs = trackProjects(track);
    else if (rncp) slugs = rncpProjects(rncp);
    return new Set(slugs.map((s) => NODE_OF.get(s) ?? s));
  }, [cert, track, rncp]);
  useEffect(() => {
    const g = gRef.current;
    const ns = g.nodes.filter((n) => needed.has(n.slug));
    if (!ns.length) { setView(full); return; }
    const pad = g.unit * 3;
    const minX = Math.min(...ns.map((n) => n.x)) - pad, maxX = Math.max(...ns.map((n) => n.x)) + pad;
    const minY = Math.min(...ns.map((n) => n.y)) - pad, maxY = Math.max(...ns.map((n) => n.y)) + pad;
    const w = Math.max(maxX - minX, full.w * 0.35), h = Math.max(maxY - minY, full.h * 0.35);
    setView({ x: (minX + maxX) / 2 - w / 2, y: (minY + maxY) / 2 - h / 2, w, h });
  }, [needed, full]);
  const zoom = full.w / view.w;
  const toSvg = (cx: number, cy: number): Pt => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return { x: view.x + view.w / 2, y: view.y + view.h / 2 };
    const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const zoomAt = (k: number, at?: Pt) => {
    setSel(null);
    setView((v) => {
      const nw = Math.min(full.w * 1.2, Math.max(full.w / 12, v.w / k));
      const f = nw / v.w;
      const p = at ?? { x: v.x + v.w / 2, y: v.y + v.h / 2 };
      return { x: p.x - (p.x - v.x) * f, y: p.y - (p.y - v.y) * f, w: nw, h: v.h * f };
    });
  };
  const scale = () => {
    const r = svgRef.current?.getBoundingClientRect();
    return r ? Math.min(r.width / view.w, r.height / view.h) : 1;
  };
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // plain wheel keeps scrolling the page
      e.preventDefault();
      const m = svg.getScreenCTM();
      const at = m ? new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()) : undefined;
      zoomAt(Math.exp(-e.deltaY * 0.0025), at ? { x: at.x, y: at.y } : undefined);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  });
  const pointers = useRef(new Map<number, Pt>());
  const drag = useRef({ moved: 0, pinch: 0 });
  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag.current.moved = 0;
    if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()];
      drag.current.pinch = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()];
      const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      if (drag.current.pinch) zoomAt(d / drag.current.pinch, toSvg((p1.x + p2.x) / 2, (p1.y + p2.y) / 2));
      drag.current.pinch = d;
      drag.current.moved += 10;
      return;
    }
    drag.current.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.current.moved > 4) {
      const el = e.currentTarget as Element;
      if (!el.hasPointerCapture(e.pointerId)) el.setPointerCapture(e.pointerId);
      if (sel) setSel(null);
      const s = scale();
      setView((v) => ({ ...v, x: v.x - dx / s, y: v.y - dy / s }));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => { pointers.current.delete(e.pointerId); if (pointers.current.size < 2) drag.current.pinch = 0; };

  const select = (s: Selection, el: Element) => {
    if (drag.current.moved > 4) return; // that click ended a drag
    if (JSON.stringify(sel) === JSON.stringify(s)) { setSel(null); return; }
    const stage = stageRef.current;
    if (stage) {
      const r = el.getBoundingClientRect(), sr = stage.getBoundingClientRect();
      setAnchor({ x: r.left - sr.left + r.width / 2, y: r.top - sr.top + r.height / 2 });
    }
    setSel(s);
  };
  const onKey = (s: Selection) => (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); drag.current.moved = 0; select(s, e.currentTarget); } };
  const stageW = stageRef.current?.clientWidth ?? 1000, stageH = stageRef.current?.clientHeight ?? 800;
  const flip = anchor ? anchor.x >= stageW / 2 : false;
  const cardLeft = anchor ? Math.max(8, flip ? anchor.x - 26 - 310 : anchor.x + 26) : 0;
  const cardTop = anchor ? Math.max(8, Math.min(anchor.y - 70, stageH - 380)) : 0;

  const stroke = g.unit / 50; // line widths scale with the layout

  return (
    <div className="cg-page">
      <PageState loading={loading && !me} error={error} onRetry={refresh} />
      <div className="tr-stage hg-stage" ref={stageRef} onKeyDown={(e) => { if (e.key === "Escape") setSel(null); }}>
        <div className="tr-tools hg-tools">
          <div className="hg-tools-row">
            <select className="hg-layer-select hg-layer-kind" value={layerCat} aria-label="Layer type"
              onChange={(e) => { setLayerCat(e.target.value as typeof layerCat); setLayer(""); setSel(null); }}>
              <option value="track">Domain</option>
              <option value="cert">Certification</option>
              <option value="rncp">RNCP title</option>
            </select>
            <select className="hg-layer-select" value={layer.startsWith(`${layerCat}:`) ? layer : ""} aria-label="Layer"
              onChange={(e) => { setLayer(e.target.value); setSel(null); }}>
              <option value="">{{ track: "Please select a domain", cert: "Please select a certification", rncp: "Please select an RNCP title" }[layerCat]}</option>
              {layerCat === "track" && TRACKS.map((t) => <option key={t.id} value={`track:${t.id}`}>{t.title}</option>)}
              {layerCat === "cert" && career.certifications.map((c) => (
                <option key={c.id} value={`cert:${c.id}`}>{c.name}{c.optional ? " (optional)" : ""}{certsDone[c.id] ? " ✓" : ""}</option>
              ))}
              {layerCat === "rncp" && RNCP_TITLES.map((t) => <option key={t.key} value={`rncp:${t.key}`}>{t.label}</option>)}
            </select>
            <button className="cg-button" onClick={() => { setRun((r) => r + 1); setSel(null); }} title="Replay the animation"><FiRefreshCw /></button>
          </div>
          {simNodes.length > 0 && (
            <div className="hg-sim-bar">
              <span><b>Simulation</b> · {simNodes.length} project{simNodes.length > 1 ? "s" : ""} · level {(me?.level ?? 0).toFixed(2)} → <b>{simLevel.toFixed(2)}</b></span>
              <button className="cg-link" onClick={() => setSimList([])}>Clear</button>
            </div>
          )}
          {cert && (
            <CertPanel cert={cert} graph={g} done={!!certsDone[cert.id]} onClose={() => setLayer("")} toggleSim={toggleSim}
              onToggle={() => setCertsDone({ ...certsDone, [cert.id]: !certsDone[cert.id] })} />
          )}
          {track && <TrackPanel track={track} graph={g} onClose={() => setLayer("")} toggleSim={toggleSim} />}
          {rncp && <RncpPanel title={rncp} graph={g} me={me} plan={simPlan} level={simLevel} onClose={() => setLayer("")} toggleSim={toggleSim} />}
        </div>
        <div className="tr-zoom" role="group" aria-label="Zoom">
          <button className="c-icon-btn" onClick={() => zoomAt(1.4)} aria-label="Zoom in" title="Zoom in"><FiPlus /></button>
          <span className="tr-zoom-level">{Math.round(zoom * 100)}%</span>
          <button className="c-icon-btn" onClick={() => zoomAt(1 / 1.4)} aria-label="Zoom out" title="Zoom out"><FiMinus /></button>
          <button className="c-icon-btn" onClick={() => { setView(full); setSel(null); }} aria-label="Fit the whole graph" title="Fit"><FiMaximize /></button>
          <button className={`c-icon-btn ${intra && useIntra ? "hg-intra-on" : ""}`} onClick={() => setImportOpen((o) => !o)}
            aria-label="Intra graph file" title={intra && useIntra ? "Using your intra file — update or switch" : "Import your intra graph for the exact layout"}><FiUpload /></button>
        </div>
        {importOpen && (
          <div className="hg-import hg-import--float">
            <button className="c-icon-btn tr-card-close" onClick={() => setImportOpen(false)} aria-label="Close"><FiX /></button>
            <b>{intra ? "Your intra graph" : "Import your intra graph"}</b>
            {intra && (
              <div className="hg-import-row">
                <span className="cg-muted">File from {new Date(intra.loadedAt).toLocaleDateString("en-GB")}</span>
                <button className="cg-button" onClick={() => { setUseIntra(!useIntra); setSel(null); }}>{useIntra ? "Use computed layout" : "Use intra layout"}</button>
              </div>
            )}
            <ol>
              <li>Open <a className="cg-link" href={intraUrl(me)} target="_blank" rel="noopener noreferrer">your project_data.json <FiExternalLink /></a> while logged into intra.</li>
              <li>Save it (⌘S) and choose the file — or copy all and paste it below.</li>
            </ol>
            <label className="cg-button hg-file"><FiUpload /> Choose file
              <input type="file" accept="application/json,.json" onChange={async (e) => { const f = e.target.files?.[0]; if (f) load(await f.text()); }} />
            </label>
            <textarea className="hg-paste" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder='Paste the JSON here — it starts with [ { "state": …' rows={3} />
            <div className="hg-import-row">
              <button className="cg-button" disabled={!paste.trim()} onClick={() => load(paste)}>Load pasted JSON</button>
              {importError && <span className="ns-warn">{importError}</span>}
            </div>
          </div>
        )}

        <svg key={`${run}-${g.source}`} ref={svgRef} className="tr-svg" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          role="img" aria-label="Holy graph: Common Core rings in the centre, advanced projects around them"
          style={{ "--hg-w": stroke } as React.CSSProperties}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          onDoubleClick={(e) => zoomAt(1.8, toSvg(e.clientX, e.clientY))}
          onClick={(e) => { if (e.target === e.currentTarget && drag.current.moved <= 4) setSel(null); }}>
          {g.rings.map((r, k) => (
            <circle key={k} cx={g.center.x} cy={g.center.y} r={r.r} pathLength={1} className={`tr-draw hg-ring ${r.done ? "hg-ring--done" : ""}`} style={{ animationDelay: `${(k + 1) * 0.1}s` }} />
          ))}
          {g.edges.map((e, i) => (
            <polyline key={i} points={e.points.map((p) => `${p.x},${p.y}`).join(" ")} pathLength={1}
              className={`tr-draw hg-edge ${e.lit ? "hg-edge--lit" : ""}`} style={{ animationDelay: `${e.delay}s` }} />
          ))}
          {g.labels.map((l) => (
            <text key={l.title} x={l.x} y={l.y} textAnchor={l.anchor} fontSize={g.unit * 0.3} className="hg-sector tr-fade" style={{ animationDelay: "1.6s" }}>{l.title}</text>
          ))}
          {g.nodes.map((n) => {
            const selected = sel?.kind === "node" && sel.slug === n.slug;
            return (
              <g key={n.slug} transform={`translate(${n.x} ${n.y})`} className="hg-hit" role="button" tabIndex={0}
                aria-label={`${n.name} — ${STATUS_LABEL[n.status][0]}`} aria-pressed={selected}
                onClick={(e) => select({ kind: "node", slug: n.slug }, e.currentTarget)} onKeyDown={onKey({ kind: "node", slug: n.slug })}>
                <title>{`${n.name} — ${STATUS_LABEL[n.status][0]}`}</title>
                <g className="tr-pop hg-pop" style={{ animationDelay: `${n.delay}s` }}>
                  {needed.has(n.slug) && <Halo n={n} gap={n.r * 0.22} className="hg-layer" />}
                  {n.next && n.status !== "validated" && !needed.has(n.slug) && <Halo n={n} gap={n.r * 0.25} className="tr-next" />}
                  <g className="hg-body">
                    <NodeShape n={n} selected={selected} />
                    <NodeLabel n={n} />
                  </g>
                </g>
              </g>
            );
          })}
        </svg>

        {sel && anchor && (
          <div className="tr-card" style={{ left: cardLeft, top: cardTop }} role="dialog" aria-label="Details">
            <button className="c-icon-btn tr-card-close" onClick={() => setSel(null)} aria-label="Close"><FiX /></button>
            <Detail sel={sel} me={me} graph={g} toggleSim={toggleSim} simLevel={simLevel} />
          </div>
        )}
      </div>
    </div>
  );
}

function Dot({ s }: { s: Status }) {
  return <i className={`hg-key hg-key--sm hg-node--${s}`} />;
}

/** "What if I validate it?" — toggles a project in the simulation (real validations can't be undone here). */
function SimButton({ n, toggleSim }: { n: GNode; toggleSim: (slug: string) => void }) {
  if (n.status === "validated" && !n.sim) return null;
  return (
    <button className={`cg-button ${n.sim ? "" : "hg-sim-btn"}`} onClick={() => toggleSim(n.slug)}>
      {n.sim ? "Undo simulated validation" : "Simulate as validated → see my new level"}
    </button>
  );
}

function Detail({ sel, me, graph, toggleSim, simLevel }: {
  sel: Selection; me: TrackerMe | null; graph: Graph; toggleSim: (slug: string) => void; simLevel: number;
}) {
  const node = (s: string) => graph.nodes.find((n) => n.slug === s);
  const name = (s: string) => node(s)?.name ?? catalogBySlug[s]?.name ?? s;

  if (sel?.kind === "node") {
    const n = node(sel.slug)!;
    const p = catalogBySlug[catalogSlug(sel.slug)];
    const [label, tone] = n.sim ? ["Simulated", "plan" as const] : STATUS_LABEL[n.status];
    const head = (
      <>
        <div className="tr-detail-head"><Dot s={n.status} /><b>{n.name}</b></div>
        <div className="tr-chips">
          <Badge tone={tone}>{label}</Badge>
          {n.mark != null && <span className="cg-muted">mark {n.mark}</span>}
          {n.next && <Badge tone="plan">In your plan</Badge>}
          {p && !p.available_on_campus && <Badge tone="warn">Not on campus</Badge>}
          <span className="cg-muted">{p ? `${p.team === "solo" ? "Solo" : `Team ${p.team}`} · ${p.estimate ?? n.duration ?? "—"}` : n.duration ?? ""}</span>
        </div>
      </>
    );
    if (!p) {
      return (
        <div className="tr-detail">
          {head}
          <p className="cg-muted">{n.core ? "Common Core" : trackTitle(n.sector) ?? "Project"}</p>
          {n.rules && <p className="hg-rules">{n.rules}</p>}
          <SimButton n={n} toggleSim={toggleSim} />
        </div>
      );
    }
    const titles = p.id != null ? titlesOf.get(p.id) ?? [] : [];
    const unlocks = p.unlocks.filter((s) => catalogBySlug[s]);
    const needs = n.status === "locked" && !n.rules ? missingPrerequisites(p, new Set(graph.nodes.filter((x) => x.status === "validated").map((x) => x.slug))) : [];
    const certs = career.certifications.filter((c) => c.after.includes(sel.slug));
    return (
      <div className="tr-detail">
        {head}
        <dl className="tr-dl">
          <dt>Track</dt><dd>{trackTitle(n.sector) ?? "—"}</dd>
          <dt>XP</dt><dd>+{fmt(projectXp(p))}{n.status !== "validated" && me ? ` → level ${projectedLevel(simLevel, remainingXp(p, new Set((me?.projects ?? []).filter((x) => x.validated).map((x) => x.slug)))).toFixed(2)} if done next` : ""}</dd>
          {needs.length > 0 && <><dt>Needs</dt><dd>{needs.map((m) => m.split(" or ").map(name).join(" or ")).join(", ")}</dd></>}
          {titles.length > 0 && <><dt>RNCP</dt><dd className="tr-chips">{titles.map((t) => <Badge key={t} tone="ok">{TITLE_SHORT[t]}</Badge>)}</dd></>}
          {unlocks.length > 0 && <><dt>Unlocks</dt><dd>{unlocks.map(name).join(", ")}</dd></>}
          {certs.length > 0 && <><dt>Leads to</dt><dd className="tr-chips">{certs.map((c) => <Badge key={c.id} tone="warn">{CERT_SHORT[c.id] ?? c.name}</Badge>)}</dd></>}
        </dl>
        {n.rules && <p className="hg-rules">{n.rules}</p>}
        <SimButton n={n} toggleSim={toggleSim} />
        {p.url && <a className="cg-link" href={p.url} target="_blank" rel="noopener noreferrer">Open on intra →</a>}
      </div>
    );
  }

  return null;
}

/** The selected certification: which projects it needs and where you stand. */
function CertPanel({ cert, graph, done, onToggle, onClose, toggleSim }: {
  cert: Certification; graph: Graph; done: boolean; onToggle: () => void; onClose: () => void; toggleSim: (slug: string) => void;
}) {
  const rows = cert.after.map((slug) => rowOf(graph, slug));
  const ok = rows.filter((r) => r.status === "validated").length;
  let state = <Badge tone="todo">{rows.length - ok} project{rows.length - ok > 1 ? "s" : ""} to validate</Badge>;
  if (done) state = <Badge tone="ok">Earned</Badge>;
  else if (ok === rows.length) state = <Badge tone="plan">Ready to book</Badge>;
  return (
    <div className="hg-cert-panel">
      <button className="c-icon-btn tr-card-close" onClick={onClose} aria-label="Clear the layer"><FiX /></button>
      <div className="tr-detail-head"><i className="hg-key hg-key--layer" /><b>{CERT_SHORT[cert.id] ?? cert.name}</b></div>
      <div className="cg-muted">{cert.name} · {cert.provider}</div>
      <div className="tr-chips">{state}<span className="cg-muted">{ok} / {rows.length} validated</span>{cert.optional && <Badge tone="todo">Optional</Badge>}</div>
      <ul className="hg-need">
        {rows.map((r) => (
          <SimRow key={r.slug} r={r} toggleSim={toggleSim} />
        ))}
      </ul>
      <button className="cg-button" onClick={onToggle}>{done ? "Mark as not earned" : "Mark as earned"}</button>
    </div>
  );
}

/** The selected domain: its projects stage by stage and where you stand. */
function TrackPanel({ track, graph, onClose, toggleSim }: { track: Track; graph: Graph; onClose: () => void; toggleSim: (slug: string) => void }) {
  const row = (slug: string) => rowOf(graph, slug);
  const extra = (EXTRA[track.id] ?? []).filter((s) => !track.stages.some((st) => st.projects.includes(s)));
  const stages = [...track.stages, ...(extra.length ? [{ title: "More", projects: extra }] : [])]
    .map((st) => ({ title: st.title, rows: st.projects.filter((s) => !EXCLUDED.has(s) && !catalogBySlug[s]?.deprecated).map(row) }))
    .filter((st) => st.rows.length);
  const all = stages.flatMap((st) => st.rows);
  const ok = all.filter((r) => r.status === "validated").length;
  return (
    <div className="hg-cert-panel">
      <button className="c-icon-btn tr-card-close" onClick={onClose} aria-label="Clear the layer"><FiX /></button>
      <div className="tr-detail-head"><i className="hg-key hg-key--layer" /><b>{track.title}</b></div>
      {track.tagline && <div className="cg-muted">{track.tagline}</div>}
      <div className="tr-chips"><Badge tone={ok === all.length ? "ok" : "plan"}>{ok} / {all.length} validated</Badge>{track.rncp && <span className="cg-muted">{track.rncp}</span>}</div>
      <div className="hg-stages">
        {stages.map((st) => (
          <div key={st.title}>
            <div className="hg-stage-title">{st.title}</div>
            <ul className="hg-need">
              {st.rows.map((r) => (
                <SimRow key={r.slug} r={r} toggleSim={toggleSim} />
              ))}
            </ul>
          </div>
        ))}
      </div>
      <Link className="cg-link" href="/tracks">Open the {track.title} track →</Link>
    </div>
  );
}

interface Row { slug: string; node?: string; name: string; status: Status; sim: boolean; onGraph: boolean }
function rowOf(graph: Graph, slug: string, fallbackName?: string): Row {
  const n = graph.nodes.find((x) => x.slug === (NODE_OF.get(slug) ?? slug));
  return { slug, node: n?.slug, name: n?.name ?? catalogBySlug[slug]?.name ?? fallbackName ?? slug, status: n?.status ?? "locked", sim: !!n?.sim, onGraph: !!n };
}
/** A project line in a layer panel: status + a checkbox to simulate its validation. */
function SimRow({ r, toggleSim }: { r: Row; toggleSim: (slug: string) => void }) {
  const real = r.status === "validated" && !r.sim;
  return (
    <li className={r.sim ? "hg-row--sim" : ""}>
      <Dot s={r.status} /><span>{r.name}</span>
      <span className="cg-muted">{r.sim ? "simulated" : r.onGraph ? STATUS_LABEL[r.status][0] : "not on graph"}</span>
      <input type="checkbox" className="hg-sim-check" checked={r.status === "validated"} disabled={real || !r.node}
        title={real ? "Validated on intra" : "Simulate as validated"} aria-label={`Simulate ${r.name} as validated`}
        onChange={() => r.node && toggleSim(r.node)} />
    </li>
  );
}

/** The selected RNCP title: each block's progress (with the simulation) and the level it needs. */
function RncpPanel({ title, graph, me, plan, level, onClose, toggleSim }: {
  title: RncpTitle; graph: Graph; me: TrackerMe | null; plan: Plan; level: number; onClose: () => void; toggleSim: (slug: string) => void;
}) {
  const blocks = title.blocks.map((b) => ({ b, prog: blockProgress(b, me, plan) }));
  const blocksDone = blocks.filter((x) => x.prog.done).length;
  const levelOk = level >= title.level;
  const complete = blocksDone === blocks.length && levelOk;
  return (
    <div className="hg-cert-panel">
      <button className="c-icon-btn tr-card-close" onClick={onClose} aria-label="Clear the layer"><FiX /></button>
      <div className="tr-detail-head"><i className="hg-key hg-key--layer" /><b>{title.label}</b></div>
      <div className="tr-chips">
        <Badge tone={complete ? "ok" : "plan"}>{blocksDone} / {blocks.length} blocks</Badge>
        <Badge tone={levelOk ? "ok" : "todo"}>level {level.toFixed(2)} / {title.level}</Badge>
        <span className="cg-muted">+ {title.events} events · {title.experiences} experiences</span>
      </div>
      <div className="hg-stages">
        {blocks.map(({ b, prog }) => (
          <details key={b.id} className="hg-block">
            <summary>
              <span className={prog.done ? "hg-block-ok" : ""}>{prog.done ? "✓ " : ""}{blockLabel(b.name)}</span>
              <span className="cg-muted">{fmt(prog.xp)} / {fmt(b.min_xp)} XP · {prog.count} / {b.min_projects}</span>
            </summary>
            <ul className="hg-need">
              {b.projects.map((p) => {
                const slug = SLUG_OF_ID.get(p.id);
                return <SimRow key={p.id} r={slug ? rowOf(graph, slug, p.name) : { slug: String(p.id), name: p.name, status: "locked", sim: false, onGraph: false }} toggleSim={toggleSim} />;
              })}
            </ul>
          </details>
        ))}
      </div>
      <Link className="cg-link" href="/rncp">Plan it in RNCP →</Link>
    </div>
  );
}
