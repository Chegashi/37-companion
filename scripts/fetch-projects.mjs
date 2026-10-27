#!/usr/bin/env node
// Refresh src/data/projects.json — the catalog of every non-Common-Core 42cursus
// project available on your campus (XP, estimate, team size, prerequisites,
// RNCP blocks, description...). Port of fetch_42_advanced_projects.py.
//
//   INTRA_UID=... INTRA_SECRET_KEY=... node scripts/fetch-projects.mjs --campus 21
//   node scripts/fetch-projects.mjs --from-dump path/to/42_advanced_projects_api.json
//
// Credentials are the same 42 OAuth app as the website (.env.local).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src/data/projects.json");
const API = "https://api.intra.42.fr";
const CURSUS_42 = 21;

const OLD_COMMON_CORE = new Set([
  "libft", "ft_printf", "get_next_line", "born2beroot", "push_swap", "so_long", "fdf", "fract-ol",
  "minitalk", "pipex", "philosophers", "minishell", "netpractice", "cub3d", "minirt", "inception",
  "webserv", "ft_irc", "ft_transcendence", "old-irc", "old-philosophers",
]);
const OLD_COMMON_CORE_PATTERNS = [/^cpp-module-\d+$/, /^exam-rank-\d+$/];
const NEW_COMMON_CORE = new Set([
  "a-maze-ing", "call-me-maybe", "rag-against-the-machine", "the-answer-protocol", "tree_nity",
  "agent-smith", "codexion", "fly-in", "pac-man",
]);
const NEW_COMMON_CORE_PATTERNS = [/^42next-/, /^python-module-\d+$/];

// Modules folded into their piscine / parent so the catalog lists one entry per piscine.
const GROUPS = [
  [/^Data Science - /, "piscine-data-science"], [/^Deep Learning - /, "piscine-deep-learning"],
  [/^Django - /, "piscine-django"], [/^OCAML/, "piscine-ocaml"], [/^Piscine Object - /, "piscine-object"],
  [/^Python - /, "python-for-data-science"], [/^Mobile - /, "mobile"], [/^Unity - /, "unity"],
  [/^(\(Optional\) )?Cybersecurity - /, "cybersecurity"], [/^Java Module /, "piscine-java"],
  [/^RoR - /, "piscine-ror"], [/^Symfony - /, "piscine-symfony"], [/^Open Project - /, "open-project"],
  [/^Work Experience I - /, "work-experience-i"], [/^Work Experience II - /, "work-experience-ii"],
  [/^Startup Experience - /, "startup-experience"], [/^Part_Time I /, "part-time-i"],
  [/^Part_Time II /, "part-time-ii"],
  [/^(BrickDepth|ChromaCraft|CVForge|FaceSwap42|grAff-it|GraphForge|InterviewSim|LeakLab|PrompTrial|SpinDetect)$/,
    "ai-experimentation-rushes"],
];
const SYNTHETIC = {
  "piscine-java": "Piscine Java (Java Module 00-09)", "piscine-ror": "Piscine Ruby on Rails",
  "piscine-symfony": "Piscine Symfony", "part-time-i": "Part_Time I", "part-time-ii": "Part_Time II",
};
const RNCP_TITLES = {
  "6-web": "RNCP6 Web & mobile", "6-apps": "RNCP6 Applicative",
  "7-sec": "RNCP7 Security", "7-ai": "RNCP7 Data",
};

const norm = (slug) => slug.trim().replace(/^42cursus-/, "");

function commonCore(slug) {
  if (NEW_COMMON_CORE.has(slug) || NEW_COMMON_CORE_PATTERNS.some((r) => r.test(slug))) return true;
  const s = norm(slug);
  return OLD_COMMON_CORE.has(s) || OLD_COMMON_CORE_PATTERNS.some((r) => r.test(s));
}

function hours(estimate) {
  const m = /(\d+)\s*(hour|day)/.exec(estimate || "");
  if (!m) return null;
  return m[2] === "hour" ? Number(m[1]) : Number(m[1]) * 7;
}

// ---------------------------------------------------------------- API client
class Api {
  constructor(uid, secret, delay = 550) { this.uid = uid; this.secret = secret; this.delay = delay; }

  async auth() {
    const r = await fetch(`${API}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: this.uid, client_secret: this.secret }),
    });
    if (!r.ok) throw new Error(`oauth: ${r.status} ${await r.text()}`);
    this.token = (await r.json()).access_token;
  }

  async get(p, params = {}) {
    for (;;) {
      await new Promise((res) => setTimeout(res, this.delay));
      const url = new URL(API + p);
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
      const r = await fetch(url, { headers: { Authorization: `Bearer ${this.token}` } });
      if (r.status === 429) { await new Promise((res) => setTimeout(res, 1000 * Number(r.headers.get("Retry-After") || 2))); continue; }
      if (r.status === 403 || r.status === 404) return null;
      if (!r.ok) throw new Error(`${p}: ${r.status}`);
      return r.json();
    }
  }

  async getAll(p, params = {}) {
    const out = [];
    for (let page = 1; ; page++) {
      const batch = (await this.get(p, { ...params, "page[size]": 100, "page[number]": page })) || [];
      out.push(...batch);
      if (batch.length < 100) return out;
    }
  }
}

function summarizeRules(rules, names) {
  return [...(rules || [])]
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .filter((r) => r.rule?.kind !== "correction")
    .map((r) => ({
      kind: r.rule?.kind, name: r.rule?.name, required: r.required,
      values: (r.params || []).map((x) => x.value).filter((v) => v !== null && v !== "")
        .map((v) => (/^\d+$/.test(String(v)) ? names[Number(v)] ?? v : v)),
    }));
}

async function fromApi(campusId) {
  const uid = process.env.INTRA_UID || process.env.FT_UID;
  const secret = process.env.INTRA_SECRET_KEY || process.env.FT_SECRET;
  if (!uid || !secret) throw new Error("Set INTRA_UID and INTRA_SECRET_KEY (or FT_UID / FT_SECRET).");
  const api = new Api(uid, secret);
  await api.auth();

  console.log(`listing 42cursus projects (campus ${campusId})…`);
  const listed = await api.getAll(`/v2/cursus/${CURSUS_42}/projects`);
  const names = Object.fromEntries(listed.map((p) => [p.id, p.name]));
  const atCampus = listed.filter((p) => (p.campus || []).some((c) => c.id === campusId));

  console.log("listing campus project sessions…");
  const sessions = {};
  for (const s of await api.getAll("/v2/project_sessions", { "filter[campus_id]": campusId, "filter[cursus_id]": CURSUS_42 }))
    sessions[s.project_id] = s;

  const advanced = atCampus.filter((p) => !commonCore(p.slug));
  for (const p of advanced) {
    if (sessions[p.id]) continue;
    const all = (await api.get(`/v2/projects/${p.id}/project_sessions`)) || [];
    const fallback = all.filter((s) => s.cursus_id === CURSUS_42 || s.cursus_id == null);
    const pick = fallback.find((s) => s.campus_id == null) || fallback[0];
    if (pick) sessions[p.id] = pick;
  }
  console.log(`${listed.length} projects in 42cursus, ${advanced.length} advanced at campus ${campusId}`);

  return advanced.map((p) => {
    const s = sessions[p.id] || {};
    return {
      id: p.id, name: p.name, slug: p.slug, parent: p.parent?.name ?? null,
      xp: s.difficulty ?? p.difficulty ?? 0, estimate_time: s.estimate_time ?? null,
      solo: s.solo ?? null, is_subscriptable: s.is_subscriptable ?? null,
      objectives: s.objectives || [], description: s.description || "",
      rules: summarizeRules(s.project_sessions_rules, names),
      session_campus_id: s.campus_id ?? null,
      intra_url: `https://projects.intra.42.fr/projects/${p.slug}`,
    };
  });
}

// ------------------------------------------------------- normalize to catalog
function parseRules(rules) {
  const requires = [], blockedWhile = [];
  let team = null;
  for (const r of rules || []) {
    const v = (r.values || []).map(String);
    if (r.name === "Group size between n and m") team = `${v[0]}-${v[1]}`;
    if (r.kind !== "inscription") continue;
    if (r.name === "projects validated") for (const s of v.join(" ").split(/\s+/)) requires.push([norm(s)]);
    else if (r.name === "Minimum Project Validated") requires.push([...new Set(v[1].split(/\s+/).map(norm))]);
    else if (r.name === "%Projects not ongoing") blockedWhile.push(...v.join(" ").split(/\s+/).map(norm));
  }
  return { requires, blockedWhile, team };
}

function loadRncp() {
  const byId = {};
  for (const [file, title] of Object.entries(RNCP_TITLES)) {
    const blocks = JSON.parse(fs.readFileSync(path.join(ROOT, `src/data/rncp/${file}.json`), "utf8"));
    for (const b of blocks)
      for (const p of b.projects) (byId[p.id] ||= []).push(`${title}: ${b.name.replace("blocks.", "")}`);
  }
  return byId;
}

function toCatalog(raw, pdfs = {}) {
  const rncp = loadRncp();
  const entries = {}, modules = {};
  for (const p of raw) {
    const name = p.name.trim();
    const { requires, blockedWhile, team } = parseRules(p.rules);
    const e = {
      id: p.id, name, slug: norm(p.slug), url: p.intra_url, xp: p.xp ?? 0,
      estimate: p.estimate_time, estimate_hours: hours(p.estimate_time),
      team: p.solo || !team ? "solo" : team,
      requires, blocked_while_ongoing: blockedWhile,
      available_on_campus: p.session_campus_id != null,
      subscribable: p.is_subscriptable !== false,
      deprecated: /\[DEPRECATED\]/i.test(name),
      objectives: p.objectives || [], description: (p.description || "").replace(/\s+/g, " ").trim(),
      subject_pdf: pdfs[p.slug] || [], rncp_blocks: rncp[p.id] || [],
    };
    const group = GROUPS.find(([rx]) => rx.test(name))?.[1];
    if (group) (modules[group] ||= []).push({ id: e.id, name, slug: e.slug, xp: e.xp, estimate: e.estimate, requires: e.requires });
    else entries[e.slug] = e;
  }
  for (const [g, mods] of Object.entries(modules)) {
    entries[g] ||= {
      id: null, name: SYNTHETIC[g] || g, slug: g, url: null, xp: 0, estimate: null, estimate_hours: null,
      team: "solo", requires: [], blocked_while_ongoing: [], available_on_campus: true, subscribable: true,
      objectives: [], description: "", subject_pdf: [], rncp_blocks: [],
    };
    entries[g].modules = mods;
    entries[g].xp_with_modules = entries[g].xp + mods.reduce((a, m) => a + m.xp, 0);
  }
  for (const e of Object.values(entries))
    e.unlocks = Object.values(entries)
      .filter((o) => o.slug !== e.slug && o.requires.some((alt) => alt.includes(e.slug)))
      .map((o) => o.slug).sort();
  return Object.values(entries).sort((a, b) => a.name.localeCompare(b.name));
}

// ----------------------------------------------------------------------- main
const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };

const dump = arg("--from-dump");
const raw = dump ? JSON.parse(fs.readFileSync(dump, "utf8")).projects : await fromApi(Number(arg("--campus") || 21));
let pdfs = {};
const pdfFile = arg("--pdfs");
if (pdfFile) for (const p of JSON.parse(fs.readFileSync(pdfFile, "utf8")).projects) pdfs[p.url.split("/").pop()] = p.subject_pdf || [];

const projects = toCatalog(raw, pdfs);
fs.writeFileSync(OUT, JSON.stringify({ generated_at: new Date().toISOString(), cursus_id: CURSUS_42, count: projects.length, projects }, null, 2));
console.log(`wrote ${projects.length} projects → ${path.relative(ROOT, OUT)}`);
