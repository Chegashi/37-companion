"use client";
import React from "react";
import type { LevelHistory as History, HistoryPoint } from "@/app/api/tracker/history/route";

const W = 900;
const H = 240;
const PAD = { top: 12, right: 16, bottom: 28, left: 32 };

const day = (iso: string) => iso.slice(0, 10);

/** Step chart of the level over time, one dot per validated project. */
function Chart({ points, level, hover, setHover }: {
  points: HistoryPoint[]; level: number; hover: number | null; setHover: (i: number | null) => void;
}) {
  // Oldest first, starting from level 0 the day before the first project.
  const asc = [...points].reverse();
  const t0 = new Date(asc[0].date).getTime() - 30 * 86400_000;
  const t1 = Date.now();
  const maxLevel = Math.max(21, Math.ceil(level / 5) * 5);
  const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (l: number) => H - PAD.bottom - (l / maxLevel) * (H - PAD.top - PAD.bottom);

  let path = `M ${x(t0)} ${y(0)}`;
  let prev = 0;
  for (const p of asc) {
    const px = x(new Date(p.date).getTime());
    path += ` L ${px} ${y(prev)} L ${px} ${y(p.level)}`;
    prev = p.level;
  }
  path += ` L ${x(t1)} ${y(prev)}`;

  const years: number[] = [];
  for (let yr = new Date(t0).getFullYear() + 1; yr <= new Date(t1).getFullYear(); yr++) years.push(yr);
  const ticks = Array.from({ length: maxLevel / 5 + 1 }, (_, i) => i * 5);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Level history">
      {ticks.map((l) => (
        <g key={l}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(l)} y2={y(l)} stroke="var(--theme-border)" strokeWidth={0.5} />
          <text x={PAD.left - 6} y={y(l) + 3} textAnchor="end" fontSize={9} fill="var(--theme-text-muted)">{l}</text>
        </g>
      ))}
      {/* RNCP 7 level */}
      <line x1={PAD.left} x2={W - PAD.right} y1={y(21)} y2={y(21)} stroke="#e57373" strokeWidth={0.8} strokeDasharray="4 3" />
      <text x={W - PAD.right} y={y(21) - 3} textAnchor="end" fontSize={8} fill="#e57373">21 · RNCP 7</text>
      {years.map((yr) => {
        const tx = x(new Date(yr, 0, 1).getTime());
        return (
          <text key={yr} x={tx} y={H - 10} textAnchor="middle" fontSize={9} fill="var(--theme-text-muted)">{yr}</text>
        );
      })}
      <path d={path} fill="none" stroke="var(--theme-primary)" strokeWidth={1.8} />
      {asc.map((p, i) => {
        const idx = asc.length - 1 - i;
        return (
          <circle
            key={p.date + p.slug}
            cx={x(new Date(p.date).getTime())}
            cy={y(p.level)}
            r={hover === idx ? 5 : 3}
            fill={hover === idx ? "var(--theme-primary-dark)" : "var(--theme-primary)"}
            onMouseEnter={() => setHover(idx)}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: "pointer" }}
          >
            <title>{`${p.name} · ${p.level.toFixed(2)} · ${day(p.date)}`}</title>
          </circle>
        );
      })}
    </svg>
  );
}

/** "Level historics" from the intra: the level curve and the validated projects that moved it. */
export default function LevelHistory() {
  const [data, setData] = React.useState<History | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [hover, setHover] = React.useState<number | null>(null);
  const [all, setAll] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/tracker/history", { credentials: "include" })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
        setData(body);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  const shown = data ? (all ? data.points : data.points.slice(0, 12)) : [];

  return (
    <section className="relative border-4 border-[#a0a6b0] bg-[#ece9d8] p-3 sm:p-4 lg:p-6 min-w-0">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-[10px] font-bold text-[var(--theme-primary-muted)] uppercase tracking-wider">Level history</h3>
        {data && <span className="text-[9px] theme-text-muted">{data.points.length} validated projects</span>}
      </div>

      {error && <p className="text-[11px] theme-text-muted">Couldn&apos;t load your history: {error}</p>}
      {!data && !error && (
        <div className="flex flex-col gap-3">
          <div className="h-40 w-full skeleton-shimmer rounded-sm" />
          <p className="text-[9px] theme-text-muted">Reading your projects from the intra — the first load takes a little while.</p>
        </div>
      )}

      {data && data.points.length > 0 && (
        <>
          <Chart points={data.points} level={data.level} hover={hover} setHover={setHover} />

          <ol className="mt-4 border-l-4 border-[var(--theme-primary)] ml-[92px] sm:ml-[104px]">
            {shown.map((p, i) => (
              <li
                key={p.date + p.slug}
                className={`relative py-2 pl-3 ${hover === i ? "bg-[var(--theme-bg)]" : ""}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <span className="absolute -left-[100px] sm:-left-[112px] top-2.5 w-[84px] sm:w-[96px] border border-[#a0a6b0] text-center text-[10px] theme-text tabular-nums py-0.5">
                  {day(p.date)}
                </span>
                <p className="text-[12px] theme-text">
                  <span className="mr-1.5 px-1 font-mono text-[11px] text-[var(--theme-primary)] bg-[var(--theme-bg)]">{p.level.toFixed(2)}</span>
                  {p.name}
                </p>
                <p className="text-[10px] theme-text-muted ml-1">
                  Final mark: {p.finalMark}{p.xp > 0 && <> · +{p.xp.toLocaleString()} XP</>}
                </p>
              </li>
            ))}
          </ol>

          {data.points.length > 12 && (
            <button
              onClick={() => setAll(!all)}
              className="mt-3 border-2 border-[#a0a6b0] bg-[#ece9d8] px-3 py-1.5 text-[9px] font-bold theme-text uppercase tracking-wider active:translate-y-0.5"
            >
              {all ? "Show less" : `Show all ${data.points.length}`}
            </button>
          )}
          <p className="mt-3 text-[9px] theme-text-muted">
            Levels are rebuilt from each project&apos;s XP × mark, back from your current level: recent ones match the intra, older ones are close estimates.
          </p>
        </>
      )}
    </section>
  );
}
