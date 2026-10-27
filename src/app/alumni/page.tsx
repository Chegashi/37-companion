"use client";
// Alumni — the campus's 42 alumni ranked like the Rank page (podium + cards), with filters for promo,
// the year they became alumni and the sort, and where your current level would place you among them.
import React, { useEffect, useMemo, useState } from "react";
import { BsGridFill, BsLayoutSidebar } from "react-icons/bs";
import { RankComponent } from "@/component/dashboard/dashboard";
import type { UserData } from "@/component/navbar/navbar.types";
import type { Alumnus } from "@/utils/campus";
import { CampusList } from "@/app/progress/progress.types";
import { useStoredState, useTracker } from "@/component/tracker/useTracker";

type SortKey = "level" | "recent" | "fastest";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "level", label: "Highest level" },
  { key: "recent", label: "Newest alumni" },
  { key: "fastest", label: "Fastest to alumni" },
];
const yearOf = (iso: string | null) => (iso ? iso.slice(0, 4) : "");
const monthsToAlumni = (a: Alumnus) =>
  a.beginAt && a.alumnizedAt ? Math.max(0, Math.round((new Date(a.alumnizedAt).getTime() - new Date(a.beginAt).getTime()) / (30.44 * 86_400_000))) : Infinity;
const toCard = (a: Alumnus, campusId: number): UserData => ({
  fullname: a.displayName, level: a.level, email: "", login: a.login, kind: "student", image: a.image, staff: false,
  correction_point: a.correctionPoints, pool_month: a.poolMonth ?? "", pool_year: a.poolYear ?? "", location: a.location,
  wallet: a.wallet, campus_id: campusId, campus_name: "",
});

export default function AlumniPage() {
  const { me } = useTracker();
  const [campus, setCampus] = useState<number | null>(null);
  const [alumni, setAlumni] = useState<Alumnus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useStoredState<SortKey>("37c-alumni-sort", "level");
  const [view, setView] = useStoredState<"grid" | "list">("37c-alumni-view", "grid");
  const [promo, setPromo] = useState("all");
  const [since, setSince] = useState("all");
  const [query, setQuery] = useState("");

  const campusId = campus ?? me?.campusId ?? null;
  useEffect(() => {
    if (!campusId) return;
    setAlumni(null); setError(null);
    fetch(`/api/alumni?campus=${campusId}`).then(async (r) => {
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      setAlumni(body.alumni);
    }).catch((e: Error) => setError(e.message));
  }, [campusId]);
  useEffect(() => { setPromo("all"); setSince("all"); }, [campusId]);

  const promos = useMemo(() => [...new Set((alumni ?? []).map((a) => a.poolYear ?? ""))].filter(Boolean).sort().reverse(), [alumni]);
  const sinceYears = useMemo(() => [...new Set((alumni ?? []).map((a) => yearOf(a.alumnizedAt)))].filter(Boolean).sort().reverse(), [alumni]);

  // Ranked within the promo/year filter; search only narrows the view, so ranks stay put.
  const ranked = useMemo(() => {
    const list = (alumni ?? []).filter((a) => (promo === "all" || a.poolYear === promo) && (since === "all" || yearOf(a.alumnizedAt) === since));
    const by: Record<SortKey, (a: Alumnus, b: Alumnus) => number> = {
      level: (a, b) => b.level - a.level,
      recent: (a, b) => (b.alumnizedAt ?? "").localeCompare(a.alumnizedAt ?? ""),
      fastest: (a, b) => monthsToAlumni(a) - monthsToAlumni(b),
    };
    return list.sort(by[sort]);
  }, [alumni, promo, since, sort]);
  const rankOf = useMemo(() => new Map(ranked.map((a, i) => [a.login, i + 1])), [ranked]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? ranked.filter((a) => a.login.toLowerCase().includes(q) || a.displayName.toLowerCase().includes(q)) : ranked;
  }, [ranked, query]);
  const podium = (rank: number) => (sort === "level" && !query ? (["gold", "silver", "bronze"] as const)[rank - 1] : undefined);

  // Where your level would sit among these alumni (by level).
  const myPlace = me && ranked.length ? ranked.filter((a) => a.level > me.level).length + 1 : null;
  const avg = ranked.length ? ranked.reduce((s, a) => s + a.level, 0) / ranked.length : 0;
  const card = (a: Alumnus, grid: boolean) => {
    const rank = rankOf.get(a.login) ?? 0;
    return <RankComponent userData={toCard(a, campusId ?? 0)} rank={rank} isGridView={grid} podiumPosition={podium(rank)} />;
  };
  const top = podium(1) ? shown.slice(0, 3) : [];
  const rest = podium(1) ? shown.slice(3) : shown;
  const select = "w-full px-2 py-1.5 bg-[#dce8f8] border border-[#a0a6b0] rounded-md theme-text text-[12px]";

  return (
    <div className="xp-ranking-layout">
      <aside className="xp-ranking-sidebar">
        <section className="xp-filter-panel">
          <h2>Filters</h2>
          <div className="xp-filter-body flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-[12px]">Campus
              <select className={select} value={campusId ?? ""} onChange={(e) => setCampus(Number(e.target.value))}>
                {CampusList.filter((c) => c.id !== 0).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px]">Promo (pool year)
              <select className={select} value={promo} onChange={(e) => setPromo(e.target.value)}>
                <option value="all">All promos</option>
                {promos.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px]">Alumni since
              <select className={select} value={since} onChange={(e) => setSince(e.target.value)}>
                <option value="all">Any year</option>
                {sinceYears.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px]">Sort
              <select className={select} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
          </div>
        </section>
      </aside>

      <div className="xp-ranking-search">
        {alumni && <p className="xp-your-rank" role="status">
          <strong>{ranked.length} alumni · average level {avg.toFixed(2)}</strong>
          {myPlace && me && <span>Your level {me.level.toFixed(2)} would rank #{myPlace} among them.</span>}
        </p>}
        <div className="flex flex-row items-center gap-2">
          <input aria-label="Search alumni" type="text" placeholder="Search by name or username..." value={query} onChange={(e) => setQuery(e.target.value)}
            className="flex-1 min-w-0 px-3 sm:px-4 py-2 bg-[#dce8f8] border border-[#a0a6b0] rounded-md theme-text focus:outline-none text-[11px] font-medium placeholder:text-[#3e3d35]" />
          <div className="flex rounded-lg overflow-hidden border border-[#a0a6b0] shrink-0">
            {([["list", <BsLayoutSidebar key="l" className="w-4 h-4 sm:mr-1 inline" />, "List"], ["grid", <BsGridFill key="g" className="w-4 h-4 sm:mr-1 inline" />, "Grid"]] as const).map(([mode, icon, label]) => (
              <button key={mode} onClick={() => setView(mode)} aria-pressed={view === mode} title={`${label} view`}
                className={`px-3 sm:px-4 py-2 text-[10px] font-medium bg-[#dce8f8] border-r border-[#a0a6b0] ${view === mode ? "text-[#151515]" : "text-[#3e3d35] hover:text-[#151515]"}`}>
                {icon}<span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="xp-ranking-results flex flex-col gap-4 p-3 sm:p-4 w-full overflow-y-auto overflow-x-hidden flex-1 min-h-0 pb-20 sm:pb-8">
        {error && <p className="xp-your-rank" role="alert">{error}</p>}
        {!alumni && !error && <p className="text-[12px] theme-text-muted text-center">Loading the campus alumni from the 42 API — the first load takes a few seconds.</p>}
        {alumni && shown.length === 0 && <p className="text-[12px] theme-text-muted text-center">No alumni match these filters.</p>}
        {view === "grid" ? (
          <>
            {top.length > 0 && (
              <div className="hidden md:flex justify-center items-start gap-5 max-w-[900px] mx-auto w-full">
                {[1, 0, 2].map((i) => top[i] && (
                  <div key={top[i].login} className="flex-1 max-w-[290px]" style={{ paddingTop: i === 0 ? 0 : 28 }}>{card(top[i], true)}</div>
                ))}
              </div>
            )}
            <div className="w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
              {top.map((a) => <div key={a.login} className="md:hidden">{card(a, true)}</div>)}
              {rest.map((a) => <div key={a.login}>{card(a, true)}</div>)}
            </div>
          </>
        ) : (
          <div className="w-full flex flex-col gap-2">{shown.map((a) => <div key={a.login}>{card(a, false)}</div>)}</div>
        )}
      </div>
    </div>
  );
}
