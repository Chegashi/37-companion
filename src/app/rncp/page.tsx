"use client";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  RNCP_TITLES, EXPERIENCE_SLUGS, blockLabel, groupProjects, blockProgress, catalog, catalogBySlug, monthLabel,
  plannedXp, projectXp, projectedLevel, roadmap, planFromRows, intraIdOf, inRncp, rncpBlocksOf, validatedSlugs, type Plan, type RncpTitle,
} from "@/component/tracker/data";
import { simulate, type CalcRow } from "@/component/calculator/calc";
import { LevelBadgeLadder, OfficialTitle, TitleBadge } from "@/component/rncp/Official";
import { levelForXp, xpForLevel } from "@/utils/levels";
import { useStoredState, useTracker } from "@/component/tracker/useTracker";
import { Badge, Bar, PageState, Panel, Stat, StatusBadge, fmt } from "@/component/tracker/ui";
import type { TrackerMe } from "@/app/api/tracker/me/tracker.types";

function experienceCount(me: TrackerMe | null, plan: Plan) {
  const validated = (me?.projects ?? []).filter((p) => p.validated && EXPERIENCE_SLUGS.includes(p.slug));
  const planned = EXPERIENCE_SLUGS.map((s) => catalogBySlug[s]?.id)
    .filter((id): id is number => id != null && plan[id] != null && !validated.some((v) => v.id === id));
  return { validated: validated.length, planned: planned.length };
}

function titleStatus(title: RncpTitle, me: TrackerMe | null, plan: Plan, level: number) {
  const blocks = title.blocks.map((b) => blockProgress(b, me, plan));
  const exp = experienceCount(me, plan);
  const groups = groupProjects(me, plan);
  const checks = [
    { label: `Level ${title.level}`, ok: level >= title.level, value: level.toFixed(2) },
    { label: `${title.events} events`, ok: (me?.events ?? 0) >= title.events, value: String(me?.events ?? "–") },
    { label: `${title.experiences} full-time experiences`, ok: exp.validated + exp.planned >= title.experiences, value: `${exp.validated}${exp.planned ? ` + ${exp.planned} planned` : ""}` },
    { label: "2 post-CC group projects", ok: groups.validated.length + groups.planned.length >= 2, value: `${groups.validated.length}${groups.planned.length ? ` + ${groups.planned.length} planned` : ""}` },
    ...blocks.map((b) => ({ label: blockLabel(b.block.name), ok: b.done, value: `${fmt(b.xp)} / ${fmt(b.block.min_xp)} XP · ${b.count}/${b.block.min_projects}` })),
  ];
  return { blocks, checks, done: checks.every((c) => c.ok) };
}

// Schedule exactly the projects the user selected (the plan), in prerequisite order, then
// pack them into months from how long each takes. No preset roadmap data is used here.
const EXPERIENCE = new Set(EXPERIENCE_SLUGS);
function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
/** Your share of a project's hours: team projects count half; experiences run in parallel (0). */
function effortHours(slug: string | null): number {
  const p = slug ? catalogBySlug[slug] : undefined;
  if (slug && EXPERIENCE.has(slug)) return 0;
  const h = p?.estimate_hours ?? 98;
  return p && p.team !== "solo" ? Math.round(h / 2) : h;
}
function schedulePlan(plan: Plan, me: TrackerMe | null, hoursPerMonth: number) {
  const startLevel = me?.level ?? 0;
  const byId = new Map<number, { name: string; slug: string | null; xp: number }>();
  for (const p of catalog.projects) if (p.id != null) byId.set(p.id, { name: p.name, slug: p.slug, xp: projectXp(p) });
  for (const t of RNCP_TITLES) for (const b of t.blocks) for (const p of b.projects) if (!byId.has(p.id)) byId.set(p.id, { name: p.name, slug: null, xp: p.xp });
  const validated = new Set((me?.projects ?? []).filter((p) => p.validated).map((p) => p.slug));

  const items = Object.keys(plan).map(Number).map((id) => {
    const info = byId.get(id) ?? { name: `#${id}`, slug: null, xp: 0 };
    return { id, name: info.name, slug: info.slug, mark: plan[id], baseXp: info.xp, blocks: rncpBlocksOf(id), hours: effortHours(info.slug) };
  });
  const inPlan = new Set(items.map((i) => i.slug).filter(Boolean) as string[]);
  const ready = (slug: string | null, done: Set<string>) => {
    const reqs = (slug && catalogBySlug[slug]?.requires) || [];
    // A prerequisite group blocks only if one of its options is also in the plan and not yet placed.
    return reqs.every((alts) => alts.some((a) => validated.has(a) || done.has(a)) || !alts.some((a) => inPlan.has(a)));
  };
  // Topological order: experiences first, then quickest-available first.
  const done = new Set(validated);
  const remaining = [...items];
  const order: typeof items = [];
  while (remaining.length) {
    let avail = remaining.filter((it) => ready(it.slug, done));
    if (avail.length === 0) avail = remaining; // break any cycle / external prereq
    avail.sort((a, b) => (EXPERIENCE.has(a.slug ?? "") ? -1 : 0) - (EXPERIENCE.has(b.slug ?? "") ? -1 : 0) || a.hours - b.hours);
    const next = avail[0];
    order.push(next);
    if (next.slug) done.add(next.slug);
    remaining.splice(remaining.indexOf(next), 1);
  }
  // Pack into months by effort, and track the level reached after each project.
  let month = new Date().toISOString().slice(0, 7);
  let used = 0;
  let xp = xpForLevel(startLevel);
  return order.map((it) => {
    if (used > 0 && used + it.hours > hoursPerMonth * 1.15) { month = addMonths(month, 1); used = 0; }
    used += it.hours;
    xp += Math.round((it.baseXp * it.mark) / 100);
    return { ...it, month, levelAfter: levelForXp(xp) };
  });
}


export default function RncpPage() {
  const { me, error, loading, refresh } = useTracker();
  const [myPlan, setPlan] = useStoredState<Plan>("37c-rncp-plan", {});
  const [active, setActive] = useState<string>("overview");
  const [hoursPerMonth, setHoursPerMonth] = useStoredState<number>("37c-rncp-hpm", 140);
  // The level calculator's list (same browser storage) can stand in for the plan: "what does this simulation give me?"
  const [calcRows] = useStoredState<CalcRow[]>("37c-calculator-rows", []);
  const [calcStart] = useStoredState<number | null>("37c-calculator-start", null);
  const [source, setSource] = useState<"plan" | "calculator">("plan");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("from") === "calculator") setSource("calculator");
  }, []);
  const simulating = source === "calculator";
  const calcPlan = useMemo(() => planFromRows(calcRows), [calcRows]);
  const plan = simulating ? calcPlan : myPlan;

  const level = me?.level ?? 0;
  const calcSim = useMemo(() => simulate(calcRows, calcStart, level, validatedSlugs(me)), [calcRows, calcStart, level, me]);
  const extraXp = useMemo(() => (simulating ? calcSim.totalXp : plannedXp(plan, me)), [simulating, calcSim, plan, me]);
  const futureLevel = simulating ? calcSim.endLevel : projectedLevel(level, extraXp);
  const statuses = useMemo(() => RNCP_TITLES.map((t) => ({ title: t, ...titleStatus(t, me, plan, futureLevel) })), [me, plan, futureLevel]);
  // Where you stand today (validated only), to show what the simulation changes.
  const baseline = useMemo(() => RNCP_TITLES.map((t) => titleStatus(t, me, {}, level)), [me, level]);
  const calcMatches = useMemo(() => calcRows.map((r) => {
    const id = intraIdOf(r);
    return { row: r, blocks: inRncp(id) ? rncpBlocksOf(id!) : [], failed: r.mark < 50 };
  }), [calcRows]);
  const ordered = useMemo(() => schedulePlan(plan, me, hoursPerMonth), [plan, me, hoursPerMonth]);
  const totalHours = ordered.reduce((a, o) => a + o.hours, 0);

  const toggle = (id: number) => !simulating && setPlan((p) => {
    const next = { ...p };
    if (next[id] != null) delete next[id]; else next[id] = 100;
    return next;
  });
  const setMark = (id: number, mark: number) => !simulating && setPlan((p) => ({ ...p, [id]: Math.max(50, Math.min(125, mark)) }));
  const planRoadmap = () => setPlan((p) => {
    const next = { ...p };
    for (const phase of roadmap.phases.filter((ph) => !ph.optional))
      for (const item of phase.projects) {
        const id = catalogBySlug[item.slug]?.id;
        if (id != null && next[id] == null) next[id] = 100;
      }
    return next;
  });

  const current = statuses.find((s) => s.title.key === active);

  return (
    <div className="cg-page">
      <PageState loading={loading && !me} error={error} onRetry={refresh} />
      <div className="cg-row">
        <Stat value={level.toFixed(2)} label="Current level" />
        <Stat value={futureLevel.toFixed(2)} label={`Level with ${simulating ? "simulation" : "plan"} (+${fmt(extraXp)} XP)`} />
        <Stat value={me?.events ?? "–"} label="Pedagogical events" />
        <Stat value={`${statuses.filter((s) => s.done).length} / 4`} label={`Titles complete (with ${simulating ? "simulation" : "plan"})`} />
      </div>
      <div className="cg-tabs" role="toolbar" aria-label="Plan source">
        <button className="cg-tab" aria-pressed={!simulating} onClick={() => setSource("plan")}>My plan ({Object.keys(myPlan).length})</button>
        <button className="cg-tab" aria-pressed={simulating} onClick={() => setSource("calculator")}>Calculator simulation ({calcRows.length})</button>
      </div>
      {simulating && (
        <Panel title="Calculator simulation — impact on RNCP" right={<Link className="cg-button" href="/calculator">← Back to the calculator</Link>}>
          {calcRows.length === 0 ? (
            <p className="cg-muted">Your calculator list is empty — add projects in the <Link className="cg-link" href="/calculator">calculator</Link> first.</p>
          ) : (
            <>
              <p className="cg-muted">
                {calcMatches.filter((m) => m.blocks.length > 0 && !m.failed).length} of {calcRows.length} simulated projects count toward an RNCP block.
                Level {calcSim.start.toFixed(2)} → <b>{calcSim.endLevel.toFixed(2)}</b>. Read-only here — edit the list in the calculator, or copy it into your plan.
              </p>
              <div className="overflow-x-auto">
                <table className="cg-table">
                  <thead><tr><th>Title</th><th>Level</th><th>Blocks done</th><th>Title</th></tr></thead>
                  <tbody>
                    {statuses.map((s, i) => {
                      const before = baseline[i], need = s.title.level;
                      const blocksBefore = before.blocks.filter((b) => b.done).length, blocksAfter = s.blocks.filter((b) => b.done).length;
                      return (
                        <tr key={s.title.key}>
                          <td>{s.title.label}</td>
                          <td>{level.toFixed(2)} → <b>{futureLevel.toFixed(2)}</b> <span className="cg-muted">/ {need}</span></td>
                          <td>{blocksBefore} → <b>{blocksAfter}</b> / {s.blocks.length}{blocksAfter > blocksBefore && <span className="cg-badge cg-badge--ok" style={{ marginLeft: 6 }}>+{blocksAfter - blocksBefore}</span>}</td>
                          <td>{s.done ? <span className="cg-badge cg-badge--ok">complete</span> : <span className="cg-muted">{s.checks.filter((c) => !c.ok).length} missing</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <table className="cg-table">
                <thead><tr><th>#</th><th>Simulated project</th><th>Mark</th><th>Counts toward</th></tr></thead>
                <tbody>
                  {calcMatches.map((m, i) => (
                    <tr key={m.row.key}>
                      <td className="cg-rank">{i + 1}</td>
                      <td>{m.row.name}</td>
                      <td className="cg-muted">{m.row.mark}</td>
                      <td>{m.failed ? <span className="cg-muted">mark under 50 — not validated</span>
                        : m.blocks.length ? <span className="cg-badge cg-badge--plan">{m.blocks.join(" · ")}</span>
                        : <span className="cg-muted">not in any RNCP block (XP only)</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="cg-toolbar">
                <button className="cg-button" onClick={() => { setPlan((p) => ({ ...p, ...calcPlan })); setSource("plan"); }}>Copy into my plan</button>
              </div>
            </>
          )}
        </Panel>
      )}
      {!simulating && <div className="cg-toolbar">
        <button className="cg-button" onClick={() => setPlan({})}>Clear plan</button>
        <button className="cg-button" onClick={planRoadmap} title="Optional: start from a suggested selection you can then edit">Suggest a selection</button>
        <button className="cg-button" onClick={refresh}>Refresh from intra</button>
        <span className="cg-muted">Click projects in each title below until the blocks turn green — that selection is your plan.</span>
      </div>}
      <div className="cg-tabs" role="toolbar" aria-label="RNCP titles">
        <button className="cg-tab" aria-pressed={active === "overview"} onClick={() => setActive("overview")}>Overview</button>
        {statuses.map((s) => (
          <button key={s.title.key} className="cg-tab" aria-pressed={active === s.title.key} onClick={() => setActive(s.title.key)}>
            {s.title.label}{s.done ? " ✓" : ""}
          </button>
        ))}
      </div>

      {active === "overview" && ordered.length > 0 && (
        <Panel title={simulating ? "Calculator simulation — in prerequisite order" : "Your plan — do them in this order"} right={<span>{ordered.length} projects · ~{fmt(totalHours)} h</span>}>
          <div className="cg-toolbar">
            <span className="cg-muted">Order = your selection in prerequisite order. Months are computed from each project’s estimated time.</span>
            <label className="cg-muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              Your pace: <input type="number" min={20} max={400} step={10} value={hoursPerMonth} onChange={(e) => setHoursPerMonth(Math.max(20, Math.min(400, Number(e.target.value) || 140)))} style={{ width: 64 }} /> h/month
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="cg-table">
              <thead><tr><th>#</th><th>Month</th><th>Project</th><th>~h</th><th>Mark</th><th>Level after</th><th>Counts toward</th><th aria-label="Remove" /></tr></thead>
              <tbody>
                {ordered.map((o, i) => (
                  <tr key={o.id}>
                    <td className="cg-rank">{i + 1}</td>
                    <td className="cg-muted">{o.month ? monthLabel(o.month) : "—"}</td>
                    <td>{o.slug && catalogBySlug[o.slug]?.url ? <a className="cg-link" href={catalogBySlug[o.slug]!.url!} target="_blank" rel="noopener noreferrer">{o.name}</a> : o.name}</td>
                    <td className="cg-muted">{o.hours || "—"}</td>
                    <td><input type="number" min={50} max={125} value={o.mark} disabled={simulating} onChange={(e) => setMark(o.id, Number(e.target.value))} style={{ width: 60 }} aria-label={`Mark for ${o.name}`} /></td>
                    <td><b className="calc-level">{o.levelAfter.toFixed(2)}</b>{Math.floor(o.levelAfter) > Math.floor(i === 0 ? (me?.level ?? 0) : ordered[i - 1].levelAfter) && <span className="cg-badge cg-badge--ok" style={{ marginLeft: 6 }}>lvl {Math.floor(o.levelAfter)}</span>}</td>
                    <td className="cg-muted">{o.blocks.join(" · ") || "—"}</td>
                    <td>{!simulating && <button className="cg-icon-btn" onClick={() => toggle(o.id)} aria-label={`Remove ${o.name} from plan`}>✕</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {active === "overview" && (
        <div className="cg-grid">
          {statuses.map((s) => (
            <Panel key={s.title.key} title={s.title.label} tone={s.done ? "done" : undefined} right={<button className="cg-button" onClick={() => setActive(s.title.key)}>Open</button>}>
              <TitleBadge titleKey={s.title.key} done={s.done} />
              {s.checks.map((c) => (
                <div key={c.label} className="flex justify-between gap-2">
                  <span><span className={`cg-check cg-check--${c.ok ? "ok" : "no"}`} aria-label={c.ok ? "done" : "not done"}>✓</span>{c.label}</span><span className="cg-muted">{c.value}</span>
                </div>
              ))}
            </Panel>
          ))}
        </div>
      )}
      {active === "overview" && <LevelBadgeLadder level={level} planned={futureLevel} />}

      {current && (
        <>
          <div className="cg-row">
            {current.checks.slice(0, 4).map((c) => <Badge key={c.label} tone={c.ok ? "ok" : "warn"}>{c.ok ? "✓" : "✗"} {c.label}: {c.value}</Badge>)}
          </div>
          <div className="cg-grid">
            {current.blocks.map((b) => {
              const validatedXp = b.rows.filter((r) => r.state === "validated").reduce((a, r) => a + r.xp, 0);
              return (
                <Panel key={b.block.id} title={blockLabel(b.block.name)} tone={b.done ? "done" : undefined}
                  right={<span>{fmt(b.xp)} / {fmt(b.block.min_xp)} XP · {b.count}/{b.block.min_projects}</span>}>
                  <Bar done={validatedXp} planned={b.xp - validatedXp} max={Math.max(b.block.min_xp, 1)} />
                  <table className="cg-table">
                    <tbody>
                      {b.rows.map((r) => (
                        <tr key={r.project.id}>
                          <td>
                            <label className="flex items-center gap-2">
                              <input type="checkbox" disabled={simulating || r.state === "validated"} checked={r.state === "validated" || r.state === "planned"} onChange={() => toggle(r.project.id)} />
                              {r.project.name}
                            </label>
                          </td>
                          <td className="cg-muted">{fmt(r.project.xp)}</td>
                          <td>
                            {r.state === "planned" ? (
                              <input aria-label={`Expected mark for ${r.project.name}`} disabled={simulating} type="number" min={50} max={125} value={r.mark ?? 100} onChange={(e) => setMark(r.project.id, Number(e.target.value))} style={{ width: 64 }} />
                            ) : <StatusBadge status={r.state} mark={r.mark} />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Panel>
              );
            })}
          </div>
          <OfficialTitle titleKey={current.title.key} />
        </>
      )}
    </div>
  );
}
