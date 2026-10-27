"use client";
// Official side of the RNCP titles: the Credly badge ladder and each title's France Compétences fiche.
import React from "react";
import { CERTS, LEVEL_BADGES, levelBadgeFor, officialFor } from "@/component/tracker/certifications";
import { Panel } from "@/component/tracker/ui";

/** The 42 Cursus badges from level 9 to 21+: reached ones in colour, your level and the plan marked. */
export function LevelBadgeLadder({ level, planned }: { level: number; planned: number }) {
  const now = levelBadgeFor(level), next = LEVEL_BADGES.find((b) => b.level! > Math.floor(level));
  return (
    <Panel title="42 Cursus badges (Credly)" right={<a className="cg-link" href={CERTS.sources.credly} target="_blank" rel="noopener noreferrer">All 42 badges ↗</a>}>
      <p className="cg-muted">
        42 issues the Cursus badge of the level you graduate at.{" "}
        {now ? <>At {level.toFixed(2)} yours would be <b>{now.rank} · level {now.level}{now.plus ? "+" : ""}</b>.</> : <>The first one is level 9.</>}
        {next && <> Next: <b>{next.rank} · level {next.level}</b> ({(next.level! - level).toFixed(2)} levels away).</>}
      </p>
      <div className="of-ladder">
        {LEVEL_BADGES.map((b) => {
          const reached = Math.floor(level) >= b.level!, withPlan = !reached && Math.floor(planned) >= b.level!;
          return (
            <a key={b.id} href={b.url} target="_blank" rel="noopener noreferrer"
              className={`of-step${reached ? " of-step--done" : withPlan ? " of-step--plan" : ""}${now?.id === b.id ? " of-step--now" : ""}`}
              title={`${b.name}${reached ? " — reached" : withPlan ? " — reached with your plan" : ""}\nSkills: ${b.skills.join(", ")}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.image} alt={b.name} loading="lazy" />
              <span>{b.level}{b.plus ? "+" : ""}</span>
              <em>{b.rank}</em>
            </a>
          );
        })}
      </div>
      <div className="of-legend"><i className="of-dot of-dot--done" /> reached <i className="of-dot of-dot--plan" /> with your plan ({planned.toFixed(2)}) <i className="of-dot" /> later</div>
    </Panel>
  );
}

/** Small badge image + name for a title card. */
export function TitleBadge({ titleKey, done }: { titleKey: string; done: boolean }) {
  const o = officialFor(titleKey);
  if (!o?.badge) return null;
  return (
    <a className={`of-mini${done ? " of-mini--done" : ""}`} href={o.badge.url} target="_blank" rel="noopener noreferrer" title={o.badge.name}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={o.badge.image} alt="" loading="lazy" />
      <span>RNCP {o.fiche.code} · {o.fiche.title}</span>
    </a>
  );
}

/** The official fiche of a title: rule, the 4 blocks you need, jobs, ROME codes, statistics, the badge. */
export function OfficialTitle({ titleKey }: { titleKey: string }) {
  const o = officialFor(titleKey);
  if (!o) return null;
  const { fiche, badge, blocks } = o;
  const optionBlock = blocks.find((b) => b.option != null);
  return (
    <Panel title={`Official certification — RNCP ${fiche.code}`}
      right={<a className="cg-link" href={fiche.url} target="_blank" rel="noopener noreferrer">France Compétences ↗</a>}>
      <div className="of-head">
        {badge && (
          <a href={badge.url} target="_blank" rel="noopener noreferrer" className="of-badge" title="The Credly badge 42 issues for this title">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={badge.image} alt={badge.name} loading="lazy" />
          </a>
        )}
        <div>
          <b className="of-title">{fiche.title}{optionBlock && <> — option {o.option}: {optionBlock.title}</>}</b>
          <div className="cg-muted">Level {fiche.level} ({fiche.eqf}) · registered until {fiche.expiry.replace(/-/g, "/")} · certifier: 42</div>
          {badge && <div className="of-chips">{badge.skills.map((s) => <span key={s} className="cg-badge cg-badge--plan">{s}</span>)}</div>}
        </div>
      </div>

      <div className="of-rule">
        <b>To obtain it</b>
        <ul>
          <li>The 3 common blocks <em>and</em> the block of your option ({blocks.map((b) => b.code.replace(`RNCP${fiche.code}`, "")).join(" + ")}).</li>
          <li>Professional experience: 2 internships, or 1 internship + a 1–2 year apprenticeship (alternance).</li>
          <li>Each block is assessed by: {[...new Set(blocks.map((b) => b.evaluation))].join(" · ")}.</li>
        </ul>
        <p className="cg-muted">On intra, these blocks are reached through your projects — the project blocks above.</p>
      </div>

      {blocks.map((b) => (
        <details key={b.code} className="of-block">
          <summary>
            <code>{b.code.replace(`RNCP${fiche.code}`, "")}</code> {b.title}
            {b.option != null ? <span className="cg-badge cg-badge--plan">option {b.option}</span> : <span className="cg-badge cg-badge--todo">common</span>}
            <span className="cg-muted">{b.competences.length} competences</span>
          </summary>
          <ol>{b.competences.map((c, i) => <li key={i}>{c}</li>)}</ol>
          <p className="cg-muted">Assessment: {b.evaluation}</p>
        </details>
      ))}

      <div className="of-grid">
        <div>
          <b>Jobs it leads to</b>
          <div className="of-chips">{fiche.jobs.map((j) => <span key={j} className="cg-badge cg-badge--ok">{j}</span>)}</div>
          <div className="cg-muted" style={{ marginTop: 6 }}>ROME: {fiche.rome.map((r) => `${r.code} ${r.label}`).join(" · ")}</div>
        </div>
        {fiche.stats.length > 0 && (
          <div>
            <b>Results of the title</b>
            <table className="cg-table of-stats">
              <thead><tr><th>Year</th><th>Certified</th><th>Employed at 6 months</th><th>In the target job at 6 months</th><th>In the job at 2 years</th></tr></thead>
              <tbody>
                {fiche.stats.map((s) => (
                  <tr key={s.year}><td>{s.year}</td><td>{s.certified ?? "—"}</td><td>{s.insertion_6m != null ? `${s.insertion_6m}%` : "—"}</td><td>{s.in_job_6m != null ? `${s.in_job_6m}%` : "—"}</td><td>{s.in_job_2y != null ? `${s.in_job_2y}%` : "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="cg-muted">
        Sources: <a className="cg-link" href={fiche.url} target="_blank" rel="noopener noreferrer">France Compétences</a>
        {fiche.info_url && <> · <a className="cg-link" href={fiche.info_url} target="_blank" rel="noopener noreferrer">42.fr</a></>}
        {" "}· <a className="cg-link" href={CERTS.sources.credly} target="_blank" rel="noopener noreferrer">Credly</a> · synced {new Date(CERTS.fetched_at).toLocaleDateString()} — <code>make certifications</code> to refresh.
      </p>
    </Panel>
  );
}
