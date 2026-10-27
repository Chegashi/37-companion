"use client";
// Evaluation sheets (scraped from 42evalhub.com): browse every sheet, read it in the app, and
// tick each point off yourself before you book a correction — so nothing at the bottom of the
// subject gets forgotten. The ticks live in this browser only.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import evalsJson from "@/data/evals.json";
import { EVAL_INDEX, evalHref, projectSlugOf, statusOf, type EvalIndexEntry, type EvalStatus, type EvalQuestion, type EvalSheet } from "@/component/evals/evals";
import { catalogBySlug } from "@/component/tracker/data";
import { useStoredState, useTracker } from "@/component/tracker/useTracker";
import { Bar, PageState, Panel, Stat, StatusBadge } from "@/component/tracker/ui";

const DATA = evalsJson as unknown as { source: string; scraped_at: string; sheets: EvalSheet[] };
const SHEETS = new Map(DATA.sheets.map((s) => [s.slug, s]));
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Your self-check: sheet slug → "section.question" → value (yes/no = 1/0, rating = 0…max). */
type Checks = Record<string, Record<string, number>>;
/** List filter by your intra status; "open" (the default) hides what you already validated. */
type StatusFilter = "open" | "in_progress" | "failed" | "validated" | "all";
const STATUS_FILTERS: { key: StatusFilter; label: string; match: (s: EvalStatus) => boolean }[] = [
  { key: "open", label: "Not validated yet", match: (s) => s !== "validated" },
  { key: "in_progress", label: "In progress", match: (s) => s === "in_progress" },
  { key: "failed", label: "Failed", match: (s) => s === "failed" },
  { key: "validated", label: "Validated", match: (s) => s === "validated" },
  { key: "all", label: "All", match: () => true },
];
const qid = (si: number, qi: number) => `${si}.${qi}`;

function score(sheet: EvalSheet, checks: Record<string, number> = {}) {
  let done = 0, total = 0, bonusDone = 0, bonusTotal = 0;
  sheet.sections.forEach((sec, si) => sec.questions.forEach((q, qi) => {
    const v = checks[qid(si, qi)];
    const ok = v != null && (q.kind === "yesno" ? v === 1 : v === (q.max ?? 5));
    if (sec.bonus) { bonusTotal++; if (ok) bonusDone++; } else { total++; if (ok) done++; }
  }));
  return { done, total, bonusDone, bonusTotal };
}

/** The sheet in the URL (?sheet=…), kept in sync with back / forward. */
function useSheetParam() {
  const [slug, setSlug] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setSlug(new URLSearchParams(window.location.search).get("sheet"));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const open = useCallback((next: string | null) => {
    window.history.pushState({}, "", next ? evalHref(next) : "/evals");
    setSlug(next);
    window.scrollTo({ top: 0 });
  }, []);
  return [slug, open] as const;
}

function Body({ q }: { q: EvalQuestion }) {
  return (
    <>
      {q.body.map((b, i) =>
        b.type === "ul" ? <ul key={i} className="ev-list">{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
        : b.type === "pre" ? <pre key={i} className="ev-pre">{b.text}</pre>
        : <p key={i} className="ev-text">{b.text}</p>)}
    </>
  );
}

function Answer({ q, value, onChange }: { q: EvalQuestion; value: number | undefined; onChange: (v: number | undefined) => void }) {
  if (q.kind === "yesno") {
    return (
      <div className="ev-answer" role="group" aria-label={`Self-check: ${q.name}`}>
        <button className="ev-yes" aria-pressed={value === 1} onClick={() => onChange(value === 1 ? undefined : 1)}>Yes</button>
        <button className="ev-no" aria-pressed={value === 0} onClick={() => onChange(value === 0 ? undefined : 0)}>No</button>
      </div>
    );
  }
  const max = q.max ?? 5;
  return (
    <div className="ev-answer" role="group" aria-label={`Rate ${q.name} from 0 to ${max}`}>
      {Array.from({ length: max + 1 }, (_, v) => (
        <button key={v} className={v === max ? "ev-yes" : v === 0 ? "ev-no" : "ev-mid"} aria-pressed={value === v}
          onClick={() => onChange(value === v ? undefined : v)}>{v}</button>
      ))}
    </div>
  );
}

function SheetView({ sheet, checks, setChecks, validated, back }: {
  sheet: EvalSheet; checks: Record<string, number>; validated: boolean; back: () => void;
  setChecks: (next: Record<string, number>) => void;
}) {
  const s = score(sheet, checks);
  const project = catalogBySlug[projectSlugOf(sheet)];
  const intraUrl = project?.url ?? (sheet.intra_slug ? `https://projects.intra.42.fr/projects/${sheet.intra_slug}` : null);
  const set = (id: string, v: number | undefined) => {
    const next = { ...checks };
    if (v == null) delete next[id]; else next[id] = v;
    setChecks(next);
  };
  return (
    <>
      <div className="cg-toolbar">
        <button className="cg-button" onClick={back}>← All sheets</button>
        {intraUrl && <a className="cg-button" href={intraUrl} target="_blank" rel="noopener noreferrer">Project on intra ↗</a>}
        {sheet.attachments.filter((a) => a.url).map((a) => (
          <a key={a.url} className="cg-button" href={a.url!} target="_blank" rel="noopener noreferrer">{a.name} ↗</a>
        ))}
        {Object.keys(checks).length > 0 && <button className="cg-button" onClick={() => setChecks({})}>Reset my checks</button>}
        {validated && <span className="cg-badge cg-badge--ok">✓ validated on intra</span>}
      </div>
      <div className="cg-row">
        <Stat value={sheet.name} label={sheet.evaluate || (sheet.group === "common" ? "Common Core" : "Specialization")} />
        <Stat value={`${s.done} / ${s.total}`} label="Mandatory points you checked as OK" />
        {s.bonusTotal > 0 && <Stat value={`${s.bonusDone} / ${s.bonusTotal}`} label="Bonus points checked" />}
      </div>
      <Bar done={s.done} max={Math.max(s.total, 1)} />

      {(sheet.introduction || sheet.guidelines) && (
        <details className="cg-panel ev-intro">
          <summary>Introduction &amp; guidelines</summary>
          {sheet.introduction && <p className="ev-text">{sheet.introduction}</p>}
          {sheet.guidelines && <p className="ev-text">{sheet.guidelines}</p>}
        </details>
      )}

      {sheet.sections.map((sec, si) => sec.questions.length === 0 && !sec.note ? null : (
        <Panel key={si} title={<>{sec.title || `Section ${si + 1}`}{sec.bonus && <span className="cg-badge cg-badge--plan" style={{ marginLeft: 8 }}>bonus</span>}</>}
          right={<span className="cg-muted">{sec.questions.length} point{sec.questions.length === 1 ? "" : "s"}</span>}>
          {sec.note && <p className="ev-note">{sec.note}</p>}
          {sec.questions.map((q, qi) => {
            const id = qid(si, qi), v = checks[id];
            const state = v == null ? "" : (q.kind === "yesno" ? v === 1 : v === (q.max ?? 5)) ? " ev-q--ok" : v === 0 ? " ev-q--no" : " ev-q--mid";
            return (
              <div key={qi} className={`ev-q${state}`}>
                <div className="ev-q-head">
                  <h4>{q.name}</h4>
                  <Answer q={q} value={v} onChange={(nv) => set(id, nv)} />
                </div>
                <Body q={q} />
              </div>
            );
          })}
        </Panel>
      ))}
      <p className="cg-muted">Sheet from <a className="cg-link" href={DATA.source} target="_blank" rel="noopener noreferrer">42evalhub.com</a> · synced {new Date(DATA.scraped_at).toLocaleDateString()} — run <code>make evals</code> to refresh. Intra may have a newer version.</p>
    </>
  );
}

export default function EvalsPage() {
  const { me, loading, error } = useTracker();
  const [slug, open] = useSheetParam();
  const [checks, setChecks] = useStoredState<Checks>("37c-evals-check", {});
  const [group, setGroup] = useState<"all" | "common" | "specs">("all");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const statuses = useMemo(() => new Map(EVAL_INDEX.map((e) => [e.slug, statusOf(e, me?.projects ?? [])])), [me]);
  const status = (e: EvalIndexEntry) => statuses.get(e.slug) ?? "todo";
  const isValidated = (e: EvalIndexEntry) => status(e) === "validated";

  const sheet = slug ? SHEETS.get(slug) : undefined;
  if (sheet) {
    return (
      <div className="cg-page">
        <SheetView sheet={sheet} checks={checks[sheet.slug] ?? {}} validated={isValidated(sheet)} back={() => open(null)}
          setChecks={(next) => setChecks((c) => ({ ...c, [sheet.slug]: next }))} />
      </div>
    );
  }

  const q = norm(query);
  const inGroup = EVAL_INDEX.filter((e) => (group === "all" || e.group === group) && (!q || norm(e.name).includes(q) || norm(projectSlugOf(e)).includes(q)));
  const activeFilter = STATUS_FILTERS.find((f) => f.key === statusFilter)!;
  const list = inGroup.filter((e) => activeFilter.match(status(e)));
  const hiddenValidated = statusFilter === "open" ? inGroup.filter(isValidated).length : 0;
  const started = EVAL_INDEX.filter((e) => Object.keys(checks[e.slug] ?? {}).length > 0).length;

  return (
    <div className="cg-page">
      <PageState loading={loading && !me} error={error} />
      {slug && !sheet && <div className="calc-notice" role="status">No sheet called “{slug}” — pick one below.</div>}
      <div className="cg-row">
        <Stat value={EVAL_INDEX.length} label="Evaluation sheets" />
        <Stat value={EVAL_INDEX.reduce((a, e) => a + e.questions, 0)} label="Points to check" />
        <Stat value={started} label="Sheets you started checking" />
      </div>
      <div className="cg-toolbar">
        <div className="cg-tabs" role="toolbar" aria-label="Sheet group">
          {(["all", "common", "specs"] as const).map((g) => (
            <button key={g} className="cg-tab" aria-pressed={group === g} onClick={() => setGroup(g)}>
              {g === "all" ? "All" : g === "common" ? "Common Core" : "Specializations"} ({EVAL_INDEX.filter((e) => g === "all" || e.group === g).length})
            </button>
          ))}
        </div>
        <div className="cg-tabs" role="toolbar" aria-label="Your status">
          {STATUS_FILTERS.map((f) => (
            <button key={f.key} className="cg-tab" aria-pressed={statusFilter === f.key} onClick={() => setStatusFilter(f.key)}>
              {f.label} ({inGroup.filter((e) => f.match(status(e))).length})
            </button>
          ))}
        </div>
        <input aria-label="Search sheets" placeholder="Search a project…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ minWidth: 240 }} />
        <span className="cg-muted">Open a sheet and tick each point yourself before you book the correction.</span>
        {hiddenValidated > 0 && <button className="cg-link" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={() => setStatusFilter("all")}>{hiddenValidated} validated hidden — show all</button>}
      </div>
      <div className="cg-panel">
        <div className="overflow-x-auto">
          <table className="cg-table">
            <thead><tr><th>Project</th><th>Group</th><th>Points</th><th>Your check</th><th>Status</th></tr></thead>
            <tbody>
              {list.map((e) => {
                const full = SHEETS.get(e.slug)!;
                const s = score(full, checks[e.slug]);
                return (
                  <tr key={e.slug}>
                    <td><a className="cg-link" href={evalHref(e.slug)} onClick={(ev) => { ev.preventDefault(); open(e.slug); }}>{e.name}</a></td>
                    <td className="cg-muted">{e.group === "common" ? "Common Core" : "Specialization"}</td>
                    <td className="cg-muted">{e.questions}</td>
                    <td style={{ minWidth: 140 }}>{checks[e.slug] && Object.keys(checks[e.slug]).length ? <><Bar done={s.done} max={Math.max(s.total, 1)} /><span className="cg-muted">{s.done} / {s.total}</span></> : <span className="cg-muted">—</span>}</td>
                    <td>{status(e) !== "todo" ? <StatusBadge status={status(e)} /> : <span className="cg-muted">not started</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {list.length === 0 && inGroup.length > 0 && <p className="cg-muted" style={{ padding: 16 }}>No sheet is “{activeFilter.label.toLowerCase()}” here — <button className="cg-link" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={() => setStatusFilter("all")}>show all</button>.</p>}
        {inGroup.length === 0 && <p className="cg-muted" style={{ padding: 16 }}>No sheet matches “{query}”. The project may not be on <a className="cg-link" href={DATA.source} target="_blank" rel="noopener noreferrer">42evalhub</a> yet.</p>}
      </div>
    </div>
  );
}
