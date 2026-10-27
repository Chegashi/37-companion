"use client";
import React, { useMemo, useState } from "react";
import {
  RNCP_TITLES, catalog, catalogBySlug, missingPrerequisites, projectXp, remainingXp, roadmap, validatedSlugs, type CatalogProject,
} from "@/component/tracker/data";
import { useStoredState, useTracker } from "@/component/tracker/useTracker";
import { useWorkspace } from "@/component/tracker/useWorkspace";
import { LocalCell } from "@/component/tracker/LocalCell";
import { Badge, PageState, StatusBadge, fmt, type Status } from "@/component/tracker/ui";

type Sort = "xp" | "xph" | "name" | "hours";
type Row = { p: CatalogProject; status: Status; xp: number };
type Show = "all" | "registered" | "open" | "validated";
const phaseOf = new Map(roadmap.phases.flatMap((ph) => ph.projects.map((p) => [p.slug, ph.short ?? ph.title] as const)));

export default function ProjectsPage() {
  const { me, error, loading, refresh } = useTracker();
  const ws = useWorkspace();
  const [query, setQuery] = useState("");
  const [savedShow, setShow] = useStoredState<Show>("37c-projects-show", "all");
  // Older saves ("both") fall back to every section.
  const show: Show = ["registered", "open", "validated"].includes(savedShow) ? savedShow : "all";
  const [title, setTitle] = useStoredState<string>("37c-projects-title", "any");
  const [sort, setSort] = useStoredState<Sort>("37c-projects-sort", "xph");
  const [open, setOpen] = useState<string | null>(null);

  const validated = useMemo(() => validatedSlugs(me), [me]);
  const mine = useMemo(() => new Map((me?.projects ?? []).map((p) => [p.slug, p])), [me]);
  const ongoing = useMemo(() => new Set((me?.projects ?? []).filter((p) => !p.validated && p.status !== "finished").map((p) => p.slug)), [me]);

  // The Java piscine has no intra parent: its last module proves completion.
  const isValidated = (p: CatalogProject) => validated.has(p.slug) || (p.id == null && !!p.modules?.length && validated.has(p.modules[p.modules.length - 1].slug));
  const statusOf = (p: CatalogProject): Status => {
    if (isValidated(p)) return "validated";
    const m = mine.get(p.slug);
    if (!m) return "todo";
    if (m.status === "finished") return "failed";
    return ["in_progress", "waiting_for_correction"].includes(m.status) ? "in_progress" : "todo";
  };
  /** Open to you: not validated, prerequisites met, registration open on your campus, nothing ongoing blocks it. */
  const isOpen = (p: CatalogProject) => !isValidated(p) && missingPrerequisites(p, validated).length === 0
    && p.subscribable && p.available_on_campus && !p.deprecated && !p.blocked_while_ongoing.some((s) => ongoing.has(s));

  const q = query.trim().toLowerCase();
  const titleIds = title === "any" ? null
    : new Set(RNCP_TITLES.find((t) => t.key === title)?.blocks.flatMap((b) => b.projects.map((x) => x.id)));
  const rows = catalog.projects
    .filter((p) => !/^(part-time|work-experience-i$)/.test(p.slug))
    .filter((p) => !q || `${p.name} ${p.slug} ${p.objectives.join(" ")} ${p.description}`.toLowerCase().includes(q))
    .filter((p) => !titleIds || (p.id != null && titleIds.has(p.id)))
    .map((p): Row => {
      const status = statusOf(p);
      // Earned XP for validated work; what is left to earn otherwise (validated piscine modules excluded).
      return { p, status, xp: status === "validated" ? projectXp(p) : remainingXp(p, validated) };
    })
    .sort((a, b) => {
      if (sort === "name") return a.p.name.localeCompare(b.p.name);
      if (sort === "xp") return b.xp - a.xp;
      if (sort === "hours") return (a.p.estimate_hours ?? 1e9) - (b.p.estimate_hours ?? 1e9);
      const r = (x: Row) => (x.p.estimate_hours ? x.xp / x.p.estimate_hours : 0);
      return r(b) - r(a);
    });
  const done = rows.filter((r) => r.status === "validated");
  // Registered = already subscribed on intra (in progress or waiting for correction).
  const registered = rows.filter((r) => r.status === "in_progress");
  const available = rows.filter((r) => r.status !== "in_progress" && isOpen(r.p));
  const hidden = rows.length - done.length - registered.length - available.length;

  type Kind = "registered" | "open" | "validated";
  const table = (list: Row[], kind: Kind) => (
    <div className="overflow-x-auto">
      <table className="cg-table">
        <thead>
          <tr><th>Project</th><th>Status</th><th>{kind === "validated" ? "XP" : "XP left"}</th><th>Estimate</th><th>XP/h</th><th>RNCP</th><th>Roadmap</th></tr>
        </thead>
        <tbody>
          {list.map(({ p, status, xp }) => (
            <React.Fragment key={p.slug}>
              <tr onClick={() => setOpen(open === p.slug ? null : p.slug)} style={{ cursor: "pointer" }}>
                <td>
                  <b>{p.name}</b>
                  {p.team !== "solo" && <span className="cg-muted"> · {p.team} people</span>}
                  {ws.folderOf(p.slug) && <div><Badge tone="plan">📁 started locally</Badge></div>}
                </td>
                <td><StatusBadge status={status} mark={mine.get(p.slug)?.finalMark} /></td>
                <td>{fmt(xp)}</td>
                <td className="cg-muted">{p.estimate ?? "–"}</td>
                <td>{p.estimate_hours ? fmt(xp / p.estimate_hours) : "–"}</td>
                <td className="cg-muted">{p.rncp_blocks.map((b) => b.replace(/^RNCP(\d) /, "R$1 ")).join(", ") || "–"}</td>
                <td>{phaseOf.has(p.slug) ? <Badge tone="plan">{phaseOf.get(p.slug)}</Badge> : ""}</td>
              </tr>
              {open === p.slug && (
                <tr>
                  <td colSpan={7}>
                    <div className="flex flex-col gap-2 py-1">
                      {p.description && <p>{p.description}</p>}
                      {p.objectives.length > 0 && <p className="cg-muted">Skills: {p.objectives.join(" · ")}</p>}
                      {p.requires.length > 0 && <p className="cg-muted">Requires: {p.requires.map((alts) => alts.map((s) => catalogBySlug[s]?.name ?? s).join(" or ")).join(" + ")}</p>}
                      {p.unlocks.length > 0 && <p className="cg-muted">Unlocks: {p.unlocks.map((s) => catalogBySlug[s]?.name ?? s).join(", ")}</p>}
                      {p.blocked_while_ongoing.length > 0 && <p className="cg-muted">Can&apos;t register while ongoing: {p.blocked_while_ongoing.join(", ")}</p>}
                      {p.modules && <p className="cg-muted">Modules: {p.modules.map((m) => `${validated.has(m.slug) ? "✓ " : ""}${m.name} (${fmt(m.xp)} XP)`).join(" · ")}</p>}
                      <div className="cg-toolbar">
                        <LocalCell slug={p.slug} ws={ws} allowStart={status !== "validated"} />
                        {p.url && <a className="cg-link" href={p.url} target="_blank" rel="noopener noreferrer">Open on intra</a>}
                        {p.subject_pdf.map((pdf) => <a key={pdf} className="cg-link" href={pdf} target="_blank" rel="noopener noreferrer">Subject PDF</a>)}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );

  const section = (kind: Kind, list: Row[], title: string, hint: string) => (
    <section className="cg-panel">
      <div className={`cg-panel-title${kind === "validated" ? " cg-panel-title--done" : ""}`}>
        <span>{title}</span>
        <span>{list.length} projects · {fmt(list.reduce((a, r) => a + r.xp, 0))} XP{kind === "validated" ? " earned" : " to earn"}</span>
      </div>
      <div className="cg-panel-body">
        <p className="cg-muted">{hint}</p>
        {(["solo", "team"] as const).map((group) => {
          const part = list.filter((r) => (group === "solo") === (r.p.team === "solo"));
          return (
            <div key={group} className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2" style={{ font: "600 13.5px var(--font-display)" }}>
                <Badge tone={group === "solo" ? "todo" : "team"}>{group === "solo" ? "Solo" : "Team"}</Badge>
                <span className="cg-muted">{part.length} project{part.length === 1 ? "" : "s"}</span>
              </h3>
              {part.length > 0 ? table(part, kind) : <p className="cg-muted">None{q || titleIds ? " match your filters" : ""}.</p>}
            </div>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className="cg-page">
      <PageState loading={loading && !me} error={error} onRetry={refresh} />
      <div className="cg-toolbar">
        <input aria-label="Search projects" placeholder="Search name, skill, description…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ minWidth: 240 }} />
        <select aria-label="Show" value={show} onChange={(e) => setShow(e.target.value as Show)}>
          <option value="all">Registered + open + validated</option>
          <option value="registered">Registered only</option>
          <option value="open">Open to register only</option>
          <option value="validated">Validated only</option>
        </select>
        <select aria-label="RNCP title" value={title} onChange={(e) => setTitle(e.target.value)}>
          <option value="any">Any RNCP title</option>
          {RNCP_TITLES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="xph">Sort: XP per hour</option><option value="xp">Sort: XP</option>
          <option value="hours">Sort: shortest</option><option value="name">Sort: name</option>
        </select>
        <span className="cg-muted">{hidden} locked projects hidden (prerequisites missing, registration closed, no campus session or deprecated) · catalog {new Date(catalog.generated_at).toLocaleDateString()} (<code>npm run fetch:projects</code>)</span>
      </div>
      {!me && !loading && <p className="cg-muted">Your intra data is needed to know what you validated and what is open to you.</p>}
      {(show === "all" || show === "registered") && section("registered", registered, "Registered — available now", "You are registered on intra: in progress or waiting for correction. Finish these before registering for more.")}
      {(show === "all" || show === "open") && section("open", available, "Open to register", "Not registered yet: prerequisites met, registration open on your campus, and nothing ongoing blocks it. Failed projects you can retry are here too.")}
      {(show === "all" || show === "validated") && section("validated", done, "Validated", "Validated on intra — this XP is already in your level.")}
    </div>
  );
}
