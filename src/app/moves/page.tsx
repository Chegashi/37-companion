"use client";
// Campus moves — who switched campus, seen from one campus: people who came from another campus and people
// who left for one, with the full path and date, in the same cards as the Rank page.
import React, { useEffect, useMemo, useState } from "react";
import { BsGridFill, BsLayoutSidebar } from "react-icons/bs";
import { RankComponent } from "@/component/dashboard/dashboard";
import type { UserData } from "@/component/navbar/navbar.types";
import type { CampusMove } from "@/utils/campus";
import { CampusList } from "@/app/progress/progress.types";
import { useStoredState, useTracker } from "@/component/tracker/useTracker";

type Direction = "all" | "in" | "out";
type SortKey = "recent" | "level";
const monthYear = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
// The other campuses in a person's path (where they came from or went to).
const othersOf = (m: CampusMove, here: number | null) => [...new Set(m.path.filter((p) => p.campusId !== here).map((p) => p.campus))];
const toCard = (m: CampusMove, campusId: number): UserData => ({
  fullname: m.displayName, level: m.level ?? 0, email: "", login: m.login, kind: "student", image: m.image, staff: false,
  correction_point: m.correctionPoints, pool_month: m.poolMonth ?? "", pool_year: m.poolYear ?? "", location: m.location,
  wallet: m.wallet, campus_id: campusId, campus_name: "",
});

export default function MovesPage() {
  const { me } = useTracker();
  const [campus, setCampus] = useState<number | null>(null);
  const [moves, setMoves] = useState<CampusMove[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<Direction>("all");
  const [other, setOther] = useState("all");
  const [year, setYear] = useState("all");
  const [sort, setSort] = useStoredState<SortKey>("37c-moves-sort", "recent");
  const [view, setView] = useStoredState<"grid" | "list">("37c-moves-view", "grid");
  const [query, setQuery] = useState("");

  const campusId = campus ?? me?.campusId ?? null;
  useEffect(() => {
    if (!campusId) return;
    setMoves(null); setError(null); setOther("all"); setYear("all");
    fetch(`/api/moves?campus=${campusId}`).then(async (r) => {
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      setMoves(body.moves);
    }).catch((e: Error) => setError(e.message));
  }, [campusId]);

  const otherCampuses = useMemo(() => [...new Set((moves ?? []).flatMap((m) => othersOf(m, campusId)))].sort(), [moves, campusId]);
  const years = useMemo(() => [...new Set((moves ?? []).map((m) => m.movedAt.slice(0, 4)))].sort().reverse(), [moves]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (moves ?? [])
      .filter((m) => (direction === "all" || m.direction === direction) && (other === "all" || othersOf(m, campusId).includes(other)) && (year === "all" || m.movedAt.startsWith(year)))
      .filter((m) => !q || m.login.toLowerCase().includes(q) || m.displayName.toLowerCase().includes(q))
      .sort(sort === "level" ? (a, b) => (b.level ?? 0) - (a.level ?? 0) : (a, b) => b.movedAt.localeCompare(a.movedAt));
  }, [moves, campusId, direction, other, year, sort, query]);
  const counts = { in: (moves ?? []).filter((m) => m.direction === "in").length, out: (moves ?? []).filter((m) => m.direction === "out").length };

  const select = "w-full px-2 py-1.5 bg-[#dce8f8] border border-[#a0a6b0] rounded-md theme-text text-[12px]";
  const card = (m: CampusMove, i: number, grid: boolean) => (
    <div key={m.login} className="flex flex-col gap-1">
      <RankComponent userData={toCard(m, campusId ?? 0)} rank={i + 1} isGridView={grid} />
      <p className={`mv-path mv-path--${m.direction}`} title={m.path.map((p) => `${p.campus} (${monthYear(p.at)})`).join(" → ")}>
        <b>{m.direction === "in" ? "Joined" : "Left"}</b> {m.path.map((p) => p.campus).join(" → ")} · {monthYear(m.movedAt)}
      </p>
    </div>
  );

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
            <label className="flex flex-col gap-1 text-[12px]">Direction
              <select className={select} value={direction} onChange={(e) => setDirection(e.target.value as Direction)}>
                <option value="all">Both ({counts.in + counts.out})</option>
                <option value="in">Came here ({counts.in})</option>
                <option value="out">Left ({counts.out})</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px]">Other campus
              <select className={select} value={other} onChange={(e) => setOther(e.target.value)}>
                <option value="all">Any campus</option>
                {otherCampuses.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px]">Year of the move
              <select className={select} value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="all">Any year</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px]">Sort
              <select className={select} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="recent">Most recent move</option>
                <option value="level">Highest level</option>
              </select>
            </label>
          </div>
        </section>
      </aside>

      <div className="xp-ranking-search">
        {moves && <p className="xp-your-rank" role="status">
          <strong>{counts.in} came here · {counts.out} left</strong>
          <span>Showing {list.length}. A move is a second campus record on the intra, so it includes people who did the piscine on another campus.</span>
        </p>}
        <div className="flex flex-row items-center gap-2">
          <input aria-label="Search people" type="text" placeholder="Search by name or username..." value={query} onChange={(e) => setQuery(e.target.value)}
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
        {!moves && !error && <p className="text-[12px] theme-text-muted text-center">Checking every student&apos;s campus records on the 42 API — the first load can take up to a minute, then it&apos;s cached.</p>}
        {moves && list.length === 0 && <p className="text-[12px] theme-text-muted text-center">Nobody matches these filters.</p>}
        {view === "grid"
          ? <div className="w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">{list.map((m, i) => card(m, i, true))}</div>
          : <div className="w-full flex flex-col gap-2">{list.map((m, i) => card(m, i, false))}</div>}
      </div>
    </div>
  );
}
