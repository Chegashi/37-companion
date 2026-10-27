"use client";
// Port of 42evaluators' leaderboard: sortable, filterable campus table with toggleable columns.
import React, { useEffect, useMemo, useState } from "react";
import clustersJson from "@/data/clusters.json";
import { useStoredState, useTracker } from "@/component/tracker/useTracker";
import { Badge, PageState } from "@/component/tracker/ui";
import type { Coalition, Student } from "@/utils/campus";

const PER_PAGE = 50;
const campuses = [...new Map((clustersJson as { campus: { id: number; name: string } }[]).map((c) => [c.campus.id, c.campus])).values()]
  .sort((a, b) => a.name.localeCompare(b.name));

type SortKey = "level" | "correctionPoints" | "wallet" | "blackholedAt" | "displayName";
const COLUMNS: { key: string; label: string; sort?: SortKey }[] = [
  { key: "displayName", label: "Full name", sort: "displayName" },
  { key: "level", label: "Level", sort: "level" },
  { key: "correctionPoints", label: "Correction pts", sort: "correctionPoints" },
  { key: "wallet", label: "Wallet", sort: "wallet" },
  { key: "promo", label: "Pool" },
  { key: "coalition", label: "Coalition" },
  { key: "location", label: "Seat" },
  { key: "blackholedAt", label: "Blackhole", sort: "blackholedAt" },
];

const promoOf = (s: Student) => (s.poolYear && s.poolMonth ? `${s.poolMonth.slice(0, 3)} ${s.poolYear}` : "–");
const weeksLeft = (iso: string | null) => (iso ? Math.round((new Date(iso).getTime() - Date.now()) / (7 * 86_400_000)) : null);

export default function LeaderboardPage() {
  const { me } = useTracker();
  const [campus, setCampus] = useState<number | null>(null);
  const [data, setData] = useState<{ students: Student[]; coalitions: Coalition[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useStoredState<SortKey>("37c-lb-sort", "level");
  const [shown, setShown] = useStoredState<string[]>("37c-lb-columns", ["displayName", "level", "correctionPoints", "wallet", "promo", "coalition"]);
  const [promo, setPromo] = useState("all");
  const [coalition, setCoalition] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [highlight, setHighlight] = useState<string | null>(null);

  const campusId = campus ?? me?.campusId ?? null;
  useEffect(() => {
    if (!campusId) return;
    setData(null);
    fetch(`/api/leaderboard?campus=${campusId}`).then(async (r) => {
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      setData(body); setError(null);
    }).catch((e: Error) => setError(e.message));
  }, [campusId]);

  const promos = useMemo(() => [...new Set((data?.students ?? []).map(promoOf))].filter((p) => p !== "–")
    .sort((a, b) => new Date(`1 ${b}`).getTime() - new Date(`1 ${a}`).getTime()), [data]);
  const colorOf = useMemo(() => new Map((data?.coalitions ?? []).map((c) => [c.name, c.color])), [data]);

  // Ranked by the sort column within the promo/coalition filter; search only narrows the view.
  const ranked = useMemo(() => {
    const list = (data?.students ?? []).filter((s) => (promo === "all" || promoOf(s) === promo) && (coalition === "all" || s.coalition === coalition));
    const val = (s: Student) => (sort === "blackholedAt" ? -(s.blackholedAt ? new Date(s.blackholedAt).getTime() : Infinity) : s[sort]);
    return list.sort((a, b) => {
      const x = val(a), y = val(b);
      return typeof x === "string" ? x.localeCompare(y as string) : (y as number) - (x as number);
    }).map((s, i) => ({ s, rank: i + 1 }));
  }, [data, promo, coalition, sort]);
  const q = query.trim().toLowerCase();
  const visible = q ? ranked.filter(({ s }) => s.login.includes(q) || s.displayName.toLowerCase().includes(q)) : ranked;
  const pages = Math.max(1, Math.ceil(visible.length / PER_PAGE));
  const rows = visible.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  useEffect(() => setPage(1), [query, promo, coalition, sort, campusId]);

  const jumpToMe = () => {
    const i = ranked.findIndex(({ s }) => s.login === me?.login);
    if (i < 0) return;
    setQuery(""); setPage(Math.floor(i / PER_PAGE) + 1); setHighlight(me!.login);
  };
  const toggle = (key: string) => setShown((cols) => (cols.includes(key) ? cols.filter((c) => c !== key) : [...cols, key]));
  const cols = COLUMNS.filter((c) => shown.includes(c.key));
  const myRank = ranked.find(({ s }) => s.login === me?.login)?.rank;

  return (
    <div className="cg-page">
      <div className="cg-toolbar">
        <select aria-label="Campus" value={campusId ?? ""} onChange={(e) => setCampus(Number(e.target.value))}>
          {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="Pool" value={promo} onChange={(e) => setPromo(e.target.value)}>
          <option value="all">All pools</option>
          {promos.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        {(data?.coalitions.length ?? 0) > 0 && (
          <select aria-label="Coalition" value={coalition} onChange={(e) => setCoalition(e.target.value)}>
            <option value="all">All coalitions</option>
            {data!.coalitions.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        )}
        <input aria-label="Search" placeholder="Search login or name…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {myRank && <button className="cg-button" onClick={jumpToMe}>Jump to me (#{myRank})</button>}
        <details className="cg-columns">
          <summary className="cg-button">Columns</summary>
          <div className="cg-panel">
            {COLUMNS.map((c) => (
              <label key={c.key}><input type="checkbox" checked={shown.includes(c.key)} onChange={() => toggle(c.key)} /> {c.label}</label>
            ))}
          </div>
        </details>
        <span className="cg-muted">{visible.length} students · refreshed every 6 h</span>
      </div>
      <PageState loading={!data && !error} error={error} />
      {!data && !error && <p className="cg-muted">The first load downloads every student of the campus from the 42 API — about 10–20 seconds.</p>}

      {data && (
        <div className="cg-panel">
          <div className="overflow-x-auto">
            <table className="cg-table">
              <thead>
                <tr>
                  <th>#</th><th>Student</th>
                  {cols.map((c) => (
                    <th key={c.key}>
                      {c.sort ? <button className="cg-sort" aria-pressed={sort === c.sort} onClick={() => setSort(c.sort!)}>{c.label}{sort === c.sort ? " ↓" : ""}</button> : c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ s, rank }) => (
                  <tr key={s.id} className={s.login === me?.login || s.login === highlight ? "cg-row--me" : undefined}>
                    <td className="cg-rank">{rank}</td>
                    <td>
                      <a className="flex items-center gap-3" href={`https://profile.intra.42.fr/users/${s.login}`} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.image} alt="" width={34} height={34} style={{ borderRadius: 9, objectFit: "cover", width: 34, height: 34 }} loading="lazy" />
                        <b>{s.login}</b>
                      </a>
                    </td>
                    {cols.map((c) => (
                      <td key={c.key}>
                        {c.key === "displayName" && <span className="cg-muted">{s.displayName}</span>}
                        {c.key === "level" && <b>{s.level.toFixed(2)}</b>}
                        {c.key === "correctionPoints" && s.correctionPoints}
                        {c.key === "wallet" && `${s.wallet} ₳`}
                        {c.key === "promo" && <span className="cg-muted">{promoOf(s)}</span>}
                        {c.key === "coalition" && (s.coalition
                          ? <span className="cg-badge" style={{ color: colorOf.get(s.coalition), background: `${colorOf.get(s.coalition)}22` }}>{s.coalition}</span>
                          : "–")}
                        {c.key === "location" && (s.location ? <Badge tone="ok">{s.location}</Badge> : <span className="cg-muted">offline</span>)}
                        {c.key === "blackholedAt" && (() => {
                          const w = weeksLeft(s.blackholedAt);
                          if (w == null) return "–";
                          return <Badge tone={w < 0 ? "warn" : w < 8 ? "wip" : "todo"}>{w < 0 ? "blackholed" : `${w} wk`}</Badge>;
                        })()}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cg-toolbar" style={{ padding: 12, justifyContent: "center" }}>
            <button className="cg-button" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
            <span className="cg-muted">Page {page} / {pages}</span>
            <button className="cg-button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
