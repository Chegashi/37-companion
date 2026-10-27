"use client";
// Level calculator — the 42calculator.fr experience (start level, mark, coalition bonus, level after
// each project) plus custom projects with your own XP and drag/↑↓ reordering.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { FiArrowDown, FiArrowUp, FiMenu, FiPlus, FiRotateCcw, FiTrash2 } from "react-icons/fi";
import { catalog, projectXp, remainingXp, roadmap, catalogBySlug, validatedSlugs, intraIdOf, inRncp, rncpBlocksOf, type CatalogProject } from "@/component/tracker/data";
import { useStoredState, useTracker } from "@/component/tracker/useTracker";
import { PageState, Stat, fmt } from "@/component/tracker/ui";
import { evalHref, sheetsFor } from "@/component/evals/evals";
import { dedupeRows, move, rowIdentity, simulate, type CalcRow } from "@/component/calculator/calc";

interface Option { name: string; slug: string; xp: number; kind: string }

let keySeq = 0;
const newKey = () => `${Date.now().toString(36)}-${(keySeq++).toString(36)}`;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const validXp = (v: string) => v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) > 0;

/** Modules that carry XP — piscines are validated day by day, so each one can be counted or left out. */
const xpModules = (slug: string | null) => (slug ? catalogBySlug[slug]?.modules?.filter((m) => m.xp > 0) : undefined) ?? [];
/** Base XP of a piscine row: the project's own XP plus every module that is not skipped. */
const moduleBaseXp = (p: CatalogProject, skipped: string[]) =>
  p.xp + xpModules(p.slug).filter((m) => !skipped.includes(m.slug)).reduce((sum, m) => sum + m.xp, 0);
/** "solo" when you can do the project alone (solo, or a team of 1–n), "team" when it needs 2+, null when unknown. */
const teamKind = (slug: string | null) => {
  const team = slug ? catalogBySlug[slug]?.team : undefined;
  if (!team) return null;
  return team === "solo" || team.startsWith("1-") ? "solo" : "team";
};
const teamLabel = (slug: string | null) => {
  const team = catalogBySlug[slug ?? ""]?.team;
  return team === "solo" ? "solo" : team?.startsWith("1-") ? `solo or team (${team.slice(2)} max)` : `team ${team}`;
};
/** "Cybersecurity - Stockholm - Malware" → "Stockholm - Malware" (the parent name is already on the row). */
const moduleLabel = (name: string) => {
  const label = name.replace(/^\(Optional\)\s*/, "").split(" - ").slice(1).join(" - ") || name;
  return /^\d+$/.test(label) ? `Day ${label}` : label;
};

/** Every project with XP: the advanced catalog (piscines with their modules) + Leets' full list (Common Core). */
function useProjectOptions(): Option[] {
  const [extra, setExtra] = useState<Option[]>([]);
  useEffect(() => {
    fetch("/Project_lvl.json").then((r) => r.json())
      .then((list: { name: string; slug: string; difficulty: number; kind: string }[]) =>
        setExtra(list.map((p) => ({ name: p.name, slug: p.slug.replace(/^42cursus-/, ""), xp: p.difficulty, kind: p.kind }))))
      .catch(() => {});
  }, []);
  return useMemo(() => {
    const seen = new Map<string, Option>();
    for (const p of catalog.projects) {
      const xp = projectXp(p);
      if (xp > 0) seen.set(norm(p.name), { name: p.name, slug: p.slug, xp, kind: p.modules ? "piscine" : "project" });
    }
    // "[DEPRECATED] Piscine OCaml" is the same piscine as "Piscine OCaml": offer it only when no current version exists.
    for (const p of extra) if (p.xp > 0 && !seen.has(norm(p.name)) && !seen.has(norm(p.name.replace(/^\[deprecated\]\s*/i, "")))) seen.set(norm(p.name), p);
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [extra]);
}

function AddProject({ options, onAdd, added }: { options: Option[]; onAdd: (row: Omit<CalcRow, "key">) => void; added: Set<string> }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [customXp, setCustomXp] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);

  // The list lives in a portal on <body> so no panel / scroll container can clip it.
  // It opens below the input, or above when there is more room there.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = boxRef.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom - 12, above = r.top - 12;
      const down = below >= 260 || below >= above;
      setPos({ left: r.left, width: r.width, ...(down ? { top: r.bottom + 6 } : { bottom: window.innerHeight - r.top + 6 }), maxHeight: Math.max(160, Math.min(440, down ? below : above)) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  const q = norm(query);
  const matches = q ? options.filter((o) => norm(o.name).includes(q) || norm(o.slug).includes(q)).slice(0, 40) : options.slice(0, 40);
  const exact = options.some((o) => norm(o.name) === q);
  const isAdded = (o: Option) => added.has(o.slug);
  const customTaken = added.has(rowIdentity({ slug: null, name: query.trim() }));
  const customMode = query.trim() !== "" && !exact;

  useEffect(() => {
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!boxRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  useEffect(() => setActive(0), [query]);
  useEffect(() => { menuRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }, [active]);

  const pick = (o: Option) => {
    onAdd({ name: o.name, slug: o.slug, baseXp: o.xp, mark: 100, bonus: false });
    setQuery(""); setCustomXp(""); setOpen(false);
  };
  const addCustom = () => {
    if (!query.trim() || !validXp(customXp) || customTaken) return;
    onAdd({ name: query.trim(), slug: null, baseXp: Number(customXp), mark: 100, bonus: false });
    setQuery(""); setCustomXp(""); setOpen(false);
  };

  return (
    <div className="calc-add" ref={boxRef}>
      <FiPlus className="calc-add-icon" />
      <input
        aria-label="Add a project" placeholder="Add a project — type a name…" value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === "Enter") { e.preventDefault(); if (matches[active] && !isAdded(matches[active])) pick(matches[active]); }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && pos && createPortal(
        <div ref={menuRef} className="calc-menu c-card" role="listbox"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}>
          {customMode && (
            <div className="calc-custom">
              <div><b>Add “{query.trim()}”</b> as a custom project{matches.length === 0 ? " — it isn't in the 42 list" : ""}</div>
              <div className="calc-custom-row">
                <input
                  aria-label="XP of the custom project" type="number" min={0} step={50} placeholder="XP, e.g. 9450"
                  value={customXp} onChange={(e) => setCustomXp(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
                />
                <button className="c-btn c-btn--primary" disabled={!validXp(customXp) || customTaken} onClick={addCustom}>{customTaken ? "Already added" : "Add"}</button>
              </div>
            </div>
          )}
          {matches.map((o, i) => (
            <button key={o.slug + o.name} role="option" aria-selected={i === active} aria-disabled={isAdded(o)} className="calc-option"
              disabled={isAdded(o)} onMouseEnter={() => setActive(i)} onClick={() => pick(o)}>
              <span>{o.name}{o.kind !== "project" && <em> · {o.kind}</em>}</span>
              <span className="calc-xp">{isAdded(o) ? "already added" : `${fmt(o.xp)} XP`}</span>
            </button>
          ))}
          {matches.length === 0 && !customMode && <div className="cg-muted" style={{ padding: 10 }}>Type a name to search or add a project.</div>}
        </div>,
        document.body,
      )}
    </div>
  );
}

export default function CalculatorPage() {
  const { me, loading, error } = useTracker();
  const options = useProjectOptions();
  const [rows, setRows] = useStoredState<CalcRow[]>("37c-calculator-rows", []);
  const [startLevel, setStartLevel] = useStoredState<number | null>("37c-calculator-start", null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const added = useMemo(() => new Set(rows.map(rowIdentity)), [rows]);

  // Lists saved before duplicates were blocked are cleaned once, when they load (first occurrence kept).
  // Not on every change, so renaming a custom row never deletes it while typing.
  const cleaned = useRef(false);
  useEffect(() => {
    if (cleaned.current || rows.length === 0) return;
    cleaned.current = true;
    const clean = dedupeRows(rows);
    if (clean.length < rows.length) {
      setRows(clean);
      setNotice(`Removed ${rows.length - clean.length} duplicate project${rows.length - clean.length > 1 ? "s" : ""} from your list.`);
    }
  }, [rows, setRows]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(null), 5000); return () => clearTimeout(t); }, [notice]);
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 1600); return () => clearTimeout(t); }, [flash]);
  const [over, setOver] = useState<number | null>(null);

  const start = startLevel ?? me?.level ?? 0;
  const validated = useMemo(() => validatedSlugs(me), [me]);
  // From your live level, a project validated on intra is already counted: it adds nothing again.
  const inLevel = (r: Pick<CalcRow, "slug">) => startLevel == null && r.slug != null && validated.has(r.slug);
  const { results, totalXp, endLevel } = useMemo(
    () => simulate(rows, startLevel, me?.level ?? 0, validated), [rows, startLevel, me, validated]);
  /** RNCP blocks each row counts toward (by row key) — empty when the project is in no RNCP title. */
  const rncpBlocks = useMemo(() => new Map(rows.map((r) => {
    const id = intraIdOf(r);
    return [r.key, inRncp(id) ? rncpBlocksOf(id!) : []];
  })), [rows]);
  const rncpCount = rows.filter((r) => (rncpBlocks.get(r.key)?.length ?? 0) > 0).length;

  const update = (i: number, patch: Partial<CalcRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  /** Modules already validated on intra are in your level already, so they start skipped. */
  const withModules = <T extends Omit<CalcRow, "key">>(row: T): T => {
    const p = row.slug ? catalogBySlug[row.slug] : undefined;
    const mods = xpModules(row.slug);
    if (!p || mods.length === 0) return row;
    const skipped = mods.filter((m) => validated.has(m.slug)).map((m) => m.slug);
    return { ...row, skipped, baseXp: moduleBaseXp(p, skipped) };
  };
  const toggleModule = (i: number, slug: string) => setRows((rs) => rs.map((r, j) => {
    const p = r.slug ? catalogBySlug[r.slug] : undefined;
    if (j !== i || !p) return r;
    const skipped = (r.skipped ?? []).includes(slug) ? (r.skipped ?? []).filter((s) => s !== slug) : [...(r.skipped ?? []), slug];
    return { ...r, skipped, baseXp: moduleBaseXp(p, skipped) };
  }));
  // Piscine rows saved before modules existed: skip what intra already validated, once.
  useEffect(() => {
    if (!me || !rows.some((r) => r.skipped === undefined && xpModules(r.slug).length > 0)) return;
    setRows((rs) => rs.map((r) => (r.skipped === undefined && xpModules(r.slug).length > 0 ? withModules(r) : r)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, rows]);

  const add = (row: Omit<CalcRow, "key">) => {
    row = withModules(row);
    if (inLevel(row)) { setNotice(`${row.name} is already validated on intra — its XP is in your level. Set a custom start level to simulate it again.`); return; }
    const at = rows.findIndex((r) => rowIdentity(r) === rowIdentity(row));
    if (at >= 0) { setNotice(`${row.name} is already in your list (#${at + 1}).`); setFlash(rows[at].key); return; }
    setRows((rs) => [...rs, { ...row, key: newKey() }]);
  };
  const addPhase = (id: number) => {
    const candidates = roadmap.phases.find((p) => p.id === id)!.projects
      .map((item) => catalogBySlug[item.slug])
      .filter((p) => p && remainingXp(p, validated) > 0);
    const fresh = candidates.filter((p) => !added.has(p.slug));
    setRows((rs) => dedupeRows([...rs, ...fresh.map((p) => withModules({ key: newKey(), name: p.name, slug: p.slug, baseXp: projectXp(p), mark: 100, bonus: false }))]));
    const skipped = candidates.length - fresh.length;
    setNotice(fresh.length === 0 ? "Every project of this domain is already in your list." : `Added ${fresh.length} project${fresh.length > 1 ? "s" : ""}${skipped ? `, skipped ${skipped} already in your list` : ""}.`);
  };

  const drop = (to: number) => {
    if (dragging != null) setRows((rs) => move(rs, dragging, to));
    setDragging(null); setOver(null);
  };

  return (
    <div className="cg-page">
      <PageState loading={loading && !me} error={error} />
      <div className="cg-row">
        <div className="cg-stat">
          <label className="calc-start">
            <input aria-label="Start level" type="number" step={0.01} min={0} max={30} value={Number(start.toFixed(2))}
              onChange={(e) => setStartLevel(e.target.value === "" ? 0 : Math.max(0, Math.min(30, Number(e.target.value))))} />
            {startLevel != null && me && (
              <button className="cg-icon-btn" onClick={() => setStartLevel(null)} title={`Back to your level (${me.level.toFixed(2)})`} aria-label="Use my level"><FiRotateCcw /></button>
            )}
          </label>
          <span>Start level{startLevel == null && me ? " (yours, live)" : ""}</span>
        </div>
        <Stat value={`+${fmt(totalXp)}`} label={`XP from ${rows.length} project${rows.length === 1 ? "" : "s"}`} />
        <Stat value={endLevel.toFixed(2)} label={`Final level (+${(endLevel - start).toFixed(2)})`} />
      </div>

      <div className="cg-toolbar">
        <span className="cg-muted">Quick add a domain of your roadmap:</span>
        {roadmap.phases.filter((p) => !p.optional).map((p) => (
          <button key={p.id} className="cg-button" onClick={() => addPhase(p.id)}>{p.short ?? p.title}</button>
        ))}
        {rows.length > 0 && <button className="cg-button" onClick={() => setRows([])}>Clear all</button>}
        {rows.length > 0 && (
          <Link className="cg-button" href="/rncp?from=calculator" title="Open the RNCP titles with this list as the plan">
            See impact on RNCP ({rncpCount} / {rows.length} in RNCP) →
          </Link>
        )}
        <span className="calc-legend"><i className="calc-team--solo" /> can be done solo <i className="calc-team--team" /> needs a team</span>
        <span className="cg-muted">Drag rows (or use ↑ ↓) to reorder — every level recalculates. Each project can be added once.</span>
      </div>
      {notice && <div className="calc-notice" role="status">{notice}</div>}

      <div className="cg-panel">
        <div className="overflow-x-auto">
          <table className="cg-table calc-table">
            <thead>
              <tr><th aria-label="Order" /><th>#</th><th>Project</th><th>Base XP</th><th>Mark</th><th>Coalition bonus</th><th>Gained XP</th><th>Level after</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={r.key}
                  className={`${teamKind(r.slug) ? `calc-row--${teamKind(r.slug)}` : ""} ${dragging === i ? "calc-dragging" : ""} ${over === i && dragging !== i ? "calc-over" : ""} ${flash === r.key ? "calc-flash" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setOver(i); }}
                  onDrop={(e) => { e.preventDefault(); drop(i); }}>
                  <td>
                    <span className="calc-handle" draggable onDragStart={() => setDragging(i)} onDragEnd={() => { setDragging(null); setOver(null); }}
                      title="Drag to reorder" aria-hidden="true"><FiMenu /></span>
                  </td>
                  <td className="cg-rank">{i + 1}</td>
                  <td>
                    <input className="calc-name" aria-label="Project name" value={r.name} onChange={(e) => update(i, { name: e.target.value })} />
                    {r.slug == null && <span className="cg-badge cg-badge--plan">custom</span>}
                    {sheetsFor(r).map((e) => (
                      <Link key={e.slug} className="cg-badge calc-eval" href={evalHref(e.slug)} title={`Evaluation sheet: ${e.name} (${e.questions} points)`}>eval{sheetsFor(r).length > 1 ? ` · ${e.name.replace(/^.*? - (\d+) - /, "$1 · ")}` : ""} ↗</Link>
                    ))}
                    {teamKind(r.slug) && <span className={`cg-badge calc-team calc-team--${teamKind(r.slug)}`}>{teamLabel(r.slug)}</span>}
                    {inLevel(r) && <span className="cg-badge cg-badge--ok" title="Its XP is already in your live level">validated on intra · not counted</span>}
                    {(rncpBlocks.get(r.key)?.length ?? 0) > 0 && (
                      <span className="cg-badge cg-badge--plan" title={`Counts toward: ${rncpBlocks.get(r.key)!.join(", ")}`}>RNCP · {rncpBlocks.get(r.key)!.join(" · ")}</span>
                    )}
                    {xpModules(r.slug).length > 0 && (() => {
                      const mods = xpModules(r.slug);
                      const skipped = r.skipped ?? [];
                      const done = mods.filter((m) => validated.has(m.slug)).length;
                      return (
                        <div className="calc-modules">
                          <span className="cg-muted">{mods.length - mods.filter((m) => skipped.includes(m.slug)).length} / {mods.length} modules counted{done ? ` · ${done} validated on intra` : ""}</span>
                          <div className="calc-chips">
                            {mods.map((m) => {
                              const on = !skipped.includes(m.slug), ok = validated.has(m.slug);
                              return (
                                <button key={m.slug} className={`calc-chip${on ? " calc-chip--on" : ""}${ok ? " calc-chip--ok" : ""}`} aria-pressed={on}
                                  title={`${m.name} · ${fmt(m.xp)} XP${ok ? " · validated on intra (already in your level)" : ""} — click to ${on ? "leave out" : "count"}`}
                                  onClick={() => toggleModule(i, m.slug)}>
                                  {ok && "✓ "}{moduleLabel(m.name)} <em>{fmt(m.xp)}</em>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td>
                    <input className="calc-num" aria-label={`Base XP of ${r.name}`} type="number" min={0} step={50} value={rows[i].baseXp} disabled={inLevel(r)}
                      onChange={(e) => update(i, { baseXp: Math.max(0, Number(e.target.value)) })} />
                  </td>
                  <td>
                    <input className="calc-num calc-mark" aria-label={`Mark for ${r.name}`} type="number" min={0} max={125} value={r.mark}
                      onChange={(e) => update(i, { mark: Math.max(0, Math.min(125, Number(e.target.value))) })} />
                  </td>
                  <td>
                    <button className="calc-switch" role="switch" aria-checked={r.bonus} aria-label={`Coalition bonus for ${r.name}`}
                      onClick={() => update(i, { bonus: !r.bonus })}><i /></button>
                  </td>
                  <td className="calc-gained">+{fmt(r.gained)}</td>
                  <td>
                    <b className="calc-level">{r.levelAfter.toFixed(2)}</b>
                    {Math.floor(r.levelAfter) > Math.floor(r.levelBefore) && <span className="cg-badge cg-badge--ok">lvl {Math.floor(r.levelAfter)}</span>}
                  </td>
                  <td>
                    <span className="cg-actions">
                      <button className="cg-icon-btn" disabled={i === 0} onClick={() => setRows((rs) => move(rs, i, i - 1))} aria-label="Move up"><FiArrowUp /></button>
                      <button className="cg-icon-btn" disabled={i === rows.length - 1} onClick={() => setRows((rs) => move(rs, i, i + 1))} aria-label="Move down"><FiArrowDown /></button>
                      <button className="cg-icon-btn calc-remove" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label={`Remove ${r.name}`}><FiTrash2 /></button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={6} className="cg-muted">Coalition bonus = ×1.042 · gained XP = base XP × mark / 100</td>
                  <td className="calc-gained">+{fmt(totalXp)}</td>
                  <td colSpan={2}><b className="calc-level calc-level--final">{endLevel.toFixed(2)}</b></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {rows.length === 0 && <p className="cg-muted" style={{ textAlign: "center", padding: "18px 0 0" }}>No projects yet — add one below, or use a roadmap phase.</p>}
        <div className="calc-add-wrap"><AddProject options={options} onAdd={add} added={added} /></div>
      </div>
    </div>
  );
}
