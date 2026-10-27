// Reads a local 42 workspace folder: project folders, their git state, and subject PDFs.
// Opt-in for self-hosting on your own machine: it is off unless WORKSPACE_DIR is set, because it reads
// (and "Start locally" writes) the server's filesystem. Never set it on a shared deployment.
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import catalogJson from "@/data/projects.json";

const run = promisify(execFile);

export const WORKSPACE_ENABLED = !!process.env.WORKSPACE_DIR;
export const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR || path.join(process.cwd(), ".."));
export const SUBJECTS_DIR = path.join(WORKSPACE_DIR, "subjects");
const APP_DIR = path.resolve(process.cwd());
// In Docker the app runs from /app, so the project folder inside the workspace is skipped by name.
const APP_FOLDER = process.env.APP_FOLDER || path.basename(APP_DIR);
/** Where the workspace is on the Mac (differs from WORKSPACE_DIR inside Docker). */
export const HOST_WORKSPACE_DIR = path.resolve(process.env.HOST_WORKSPACE_DIR || WORKSPACE_DIR);
const SKIP = new Set([".git", ".history", "node_modules", ".next", "__pycache__", ".venv", "venv", ".DS_Store"]);

// ------------------------------------------------------------------ matching
const key = (s: string) =>
  s.toLowerCase().replace(/\.pdf$/, "").replace(/^42cursus-/, "").replace(/picine/g, "piscine").replace(/[^a-z0-9]/g, "");

/** Local names that don't normalize to a catalog slug or name. */
const ALIASES: Record<string, string> = {
  override: "override", boot2root: "boot2root", lemin: "lem_in", ftnm: "nm", ftstrace: "strace", ftmd5: "ft_ssl_md5",
  ftssl: "ft_ssl_md5", ftsslbase64des: "ft_ssl_des", ftsslgenrsarsarsautl: "ft_ssl_rsa",
  driverandkeyboard: "drivers-and-interrupts", linuxkernelprocessandmemory: "process-and-memory",
  lkfilesystem: "filesystem", kfs10: "kfs-x", toberestful: "restful", microservices: "ft_microservices",
  littlepenguin: "little-penguin-1", fixme: "fix-me", swiftyprotein: "swifty-proteins", snowcrash1337: "snow-crash",
  piscinemobile: "mobile", piscinedjango: "piscine-django", piscineds: "piscine-data-science",
  piscinedatascience: "piscine-data-science", piscinesec: "cybersecurity", piscinecybersecurity: "cybersecurity",
  unitypiscine: "unity", raytracer: "rt", tweets: "tweet", piscineobject: "piscine-object",
  cybersecurityarachnidaweb: "cybersecurity-arachnida-web", cybersecurityftonion: "cybersecurity-ft_onion-web",
};

const index = new Map<string, string>();
for (const p of (catalogJson as { projects: { slug: string; name: string; modules?: { slug: string; name: string }[] }[] }).projects) {
  for (const entry of [p, ...(p.modules ?? [])]) {
    index.set(key(entry.slug), entry.slug);
    index.set(key(entry.name), entry.slug);
  }
}

export function matchSlug(name: string): string | null {
  const k = key(name);
  return ALIASES[k] ?? index.get(k) ?? index.get(k.replace(/^ft/, "")) ?? null;
}

// ------------------------------------------------------------------ scanning
export interface LocalGit { remote: string | null; branch: string | null; lastCommitAt: string | null; lastCommit: string | null; dirty: number }
export interface LocalFolder { name: string; path: string; hostPath: string; slug: string | null; lastModified: string | null; files: number; git: LocalGit | null; children: LocalFolder[] }
export interface LocalSubject { file: string; slug: string | null }

async function latestMtime(dir: string, depth: number): Promise<{ mtime: number; files: number }> {
  let mtime = 0, files = 0;
  let entries: import("node:fs").Dirent[] = [];
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return { mtime, files }; }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (depth > 0) {
        const sub = await latestMtime(full, depth - 1);
        mtime = Math.max(mtime, sub.mtime); files += sub.files;
      }
    } else if (e.isFile()) {
      files++;
      try { mtime = Math.max(mtime, (await fs.stat(full)).mtimeMs); } catch { /* vanished */ }
    }
  }
  return { mtime, files };
}

async function gitInfo(dir: string): Promise<LocalGit | null> {
  try { await fs.access(path.join(dir, ".git")); } catch { return null; }
  const git = (...args: string[]) => run("git", ["-C", dir, ...args], { timeout: 5000 }).then((r) => r.stdout.trim()).catch(() => "");
  const [remote, branch, log, status] = await Promise.all([
    git("remote", "get-url", "origin"), git("rev-parse", "--abbrev-ref", "HEAD"),
    git("log", "-1", "--format=%cI%x09%s"), git("status", "--porcelain"),
  ]);
  const [lastCommitAt, lastCommit] = log ? log.split("\t") : [null, null];
  return {
    remote: remote ? remote.replace(/^git@github\.com:/, "https://github.com/").replace(/\.git$/, "") : null,
    branch: branch || null, lastCommitAt: lastCommitAt || null, lastCommit: lastCommit || null,
    dirty: status ? status.split("\n").length : 0,
  };
}

async function describe(dir: string, name: string, withChildren: boolean): Promise<LocalFolder> {
  const [{ mtime, files }, git] = await Promise.all([latestMtime(dir, 4), gitInfo(dir)]);
  let children: LocalFolder[] = [];
  if (withChildren) {
    const subs = (await fs.readdir(dir, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith("."));
    children = (await Promise.all(subs.map((e) => describe(path.join(dir, e.name), e.name, false))))
      .filter((c) => c.slug);
  }
  return { name, path: dir, hostPath: path.join(HOST_WORKSPACE_DIR, path.relative(WORKSPACE_DIR, dir)), slug: matchSlug(name), lastModified: mtime ? new Date(mtime).toISOString() : null, files, git, children };
}

export async function scanWorkspace(): Promise<{ enabled: true; dir: string; hostDir: string; folders: LocalFolder[]; subjects: LocalSubject[] }> {
  const entries = await fs.readdir(WORKSPACE_DIR, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith(".") && !SKIP.has(e.name) && !e.name.endsWith(".app")
    && e.name !== APP_FOLDER && path.join(WORKSPACE_DIR, e.name) !== APP_DIR && path.join(WORKSPACE_DIR, e.name) !== SUBJECTS_DIR);
  const folders = await Promise.all(dirs.map((e) => describe(path.join(WORKSPACE_DIR, e.name), e.name, true)));
  let subjects: LocalSubject[] = [];
  try {
    subjects = (await fs.readdir(SUBJECTS_DIR)).filter((f) => f.toLowerCase().endsWith(".pdf"))
      .map((file) => ({ file, slug: matchSlug(file) }));
  } catch { /* no subjects folder */ }
  folders.sort((a, b) => (b.lastModified ?? "").localeCompare(a.lastModified ?? ""));
  return { enabled: true, dir: WORKSPACE_DIR, hostDir: HOST_WORKSPACE_DIR, folders, subjects };
}

/** Resolve a path and make sure it stays inside the workspace. */
export function insideWorkspace(p: string): string | null {
  const full = path.resolve(WORKSPACE_DIR, p);
  return full === WORKSPACE_DIR || full.startsWith(WORKSPACE_DIR + path.sep) ? full : null;
}

