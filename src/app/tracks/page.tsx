"use client";
// Career tracks: one curriculum per path (security, full-stack, mobile, data, AI…),
// each project joined with live intra status, prerequisites and RNCP blocks.
import React, { useMemo } from "react";
import Link from "next/link";
import tracksJson from "@/data/tracks.json";
import { catalogBySlug, missingPrerequisites, projectXp, projectedLevel, remainingXp, validatedSlugs, type CatalogProject } from "@/component/tracker/data";
import { useStoredState, useTracker } from "@/component/tracker/useTracker";
import { useWorkspace } from "@/component/tracker/useWorkspace";
import { LocalCell } from "@/component/tracker/LocalCell";
import { Badge, Bar, PageState, Panel, Stat, StatusBadge, fmt, type Status } from "@/component/tracker/ui";
import { dedupeRows, type CalcRow } from "@/component/calculator/calc";

interface Track { id: string; title: string; tagline: string; careers: string[]; rncp: string; stages: { title: string; projects: string[] }[]; notes?: Record<string, string> }
const TRACKS = (tracksJson as unknown as { tracks: Track[] }).tracks;

export default function TracksPage() {
  const { me, error, loading, refresh } = useTracker();
  const ws = useWorkspace();
  const [selected, setSelected] = useStoredState<string>("37c-track", "overview");
  const validated = useMemo(() => validatedSlugs(me), [me]);
  const mine = useMemo(() => new Map((me?.projects ?? []).map((p) => [p.slug, p])), [me]);

  const statusOf = (slug: string): Status => {
    const p = mine.get(slug);
    if (!p) return "todo";
    if (p.validated) return "validated";
    if (p.status === "finished") return "failed";
    return ["in_progress", "waiting_for_correction"].includes(p.status) ? "in_progress" : "todo";
  };

  const summary = (t: Track) => {
    const projects = t.stages.flatMap((s) => s.projects).map((slug) => catalogBySlug[slug]).filter(Boolean) as CatalogProject[];
    const left = projects.filter((p) => !validated.has(p.slug));
    const xpLeft = left.reduce((a, p) => a + remainingXp(p, validated), 0);
    const hoursLeft = left.reduce((a, p) => a + (p.estimate_hours ?? 0), 0);
    const next = left.find((p) => missingPrerequisites(p, validated).length === 0 && p.subscribable);
    return { projects, left, done: projects.length - left.length, xpLeft, hoursLeft, next, solo: left.filter((p) => p.team === "solo").length };
  };

  const sendToCalculator = (t: Track) => {
    // Validated piscine modules start skipped, as when they are added on the calculator itself.
    const rows: CalcRow[] = summary(t).left.filter((p) => remainingXp(p, validated) > 0)
      .map((p, i) => ({ key: `${t.id}-${p.slug}-${Date.now().toString(36)}-${i}`, name: p.name, slug: p.slug, baseXp: remainingXp(p, validated), mark: 100, bonus: false,
        ...(p.modules?.some((m) => m.xp > 0) ? { skipped: p.modules.filter((m) => m.xp > 0 && validated.has(m.slug)).map((m) => m.slug) } : {}) }));
    try {
      const existing = JSON.parse(localStorage.getItem("37c-calculator-rows") || "[]") as CalcRow[];
      // Projects already in the calculator are kept as they are (with their mark), never duplicated.
      localStorage.setItem("37c-calculator-rows", JSON.stringify(dedupeRows([...existing, ...rows])));
    } catch { /* storage unavailable */ }
    window.location.href = "/calculator";
  };

  const track = TRACKS.find((t) => t.id === selected);

  return (
    <div className="cg-page">
      <PageState loading={loading && !me} error={error} onRetry={refresh} />
      <div className="cg-tabs" role="toolbar" aria-label="Tracks">
        <button className="cg-tab" aria-pressed={!track} onClick={() => setSelected("overview")}>All tracks</button>
        {TRACKS.map((t) => <button key={t.id} className="cg-tab" aria-pressed={selected === t.id} onClick={() => setSelected(t.id)}>{t.title}</button>)}
      </div>

      {!track && (
        <div className="cg-grid">
          {TRACKS.map((t) => {
            const s = summary(t);
            return (
              <Panel key={t.id} title={t.title} tone={s.left.length === 0 ? "done" : undefined}
                right={<span>{s.done}/{s.projects.length}</span>}>
                <p>{t.tagline}</p>
                <Bar done={s.done} max={s.projects.length} />
                <div className="cg-muted">{fmt(s.xpLeft)} XP left · ~{fmt(s.hoursLeft)} h · {s.solo} solo / {s.left.length - s.solo} team</div>
                <div className="cg-muted">{t.careers.join(" · ")}</div>
                <div className="cg-toolbar" style={{ justifyContent: "space-between" }}>
                  <span>{s.next ? <>Next: <b>{s.next.name}</b></> : s.left.length ? <span className="cg-muted">Next steps need prerequisites</span> : <Badge tone="ok">complete</Badge>}</span>
                  <button className="cg-button" onClick={() => setSelected(t.id)}>Open</button>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {track && (() => {
        const s = summary(track);
        return (
          <>
            <div className="cg-row">
              <Stat value={`${s.done} / ${s.projects.length}`} label="Projects validated" />
              <Stat value={fmt(s.xpLeft)} label="XP left in this track" />
              <Stat value={`~${fmt(s.hoursLeft)} h`} label="Estimated time left" />
              <Stat value={projectedLevel(me?.level ?? 0, s.xpLeft).toFixed(2)} label="Your level after the whole track" />
            </div>
            <div className="cg-toolbar">
              <span><b>{track.tagline}</b></span>
              <Badge tone="plan">{track.rncp}</Badge>
              <button className="cg-button" onClick={() => sendToCalculator(track)} disabled={s.left.length === 0}>Send remaining projects to the calculator</button>
              <Link className="cg-link" href="/projects">All projects →</Link>
            </div>
            <p className="cg-muted">Careers: {track.careers.join(" · ")}</p>
            {track.stages.map((stage, si) => {
              const projects = stage.projects.map((slug) => ({ slug, p: catalogBySlug[slug] }));
              const done = projects.filter(({ slug }) => validated.has(slug)).length;
              return (
                <Panel key={stage.title} title={`${si + 1}. ${stage.title}`} tone={done === projects.length ? "done" : undefined} right={<span>{done}/{projects.length}</span>}>
                  <div className="overflow-x-auto">
                    <table className="cg-table">
                      <thead><tr><th>Project</th><th>Status</th>{ws.enabled && <th>Local</th>}<th>XP</th><th>Estimate</th><th>Team</th><th>Counts toward</th><th>Notes</th></tr></thead>
                      <tbody>
                        {projects.map(({ slug, p }) => {
                          const status = statusOf(slug);
                          const missing = p && status !== "validated" ? missingPrerequisites(p, validated) : [];
                          return (
                            <tr key={slug}>
                              <td>{p?.url ? <a className="cg-link" href={p.url} target="_blank" rel="noopener noreferrer">{p.name}</a> : p?.name ?? slug}</td>
                              <td><StatusBadge status={status} mark={mine.get(slug)?.finalMark} /></td>
                              {ws.enabled && <td><LocalCell slug={slug} ws={ws} allowStart={status !== "validated"} /></td>}
                              <td>{p ? fmt(projectXp(p)) : "–"}</td>
                              <td className="cg-muted">{p?.estimate ?? "–"}</td>
                              <td>{p?.team === "solo" ? <Badge tone="todo">solo</Badge> : <Badge tone="team">{p?.team}</Badge>}</td>
                              <td className="cg-muted">{p?.rncp_blocks.map((b) => b.replace(/^RNCP(\d) /, "R$1 ")).join(", ") || "–"}</td>
                              <td className="cg-muted">
                                {missing.length > 0 && <div><Badge tone="warn">needs {missing.join(", ")}</Badge></div>}
                                {p && !p.available_on_campus && <div><Badge tone="wip">no campus session</Badge></div>}
                                {track.notes?.[slug] ?? p?.objectives.slice(0, 3).join(" · ")}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              );
            })}
          </>
        );
      })()}
    </div>
  );
}
