"use client";
import React from "react";

export function Panel({ title, right, tone, children }: { title: React.ReactNode; right?: React.ReactNode; tone?: "done" | "muted"; children: React.ReactNode }) {
  return (
    <section className="cg-panel">
      <div className={`cg-panel-title ${tone ? `cg-panel-title--${tone}` : ""}`}><span>{title}</span>{right}</div>
      <div className="cg-panel-body">{children}</div>
    </section>
  );
}

export function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return <div className="cg-stat"><b>{value}</b><span>{label}</span></div>;
}

/** Progress bar: `done` (validated) in green, `planned` stacked after it in blue. */
export function Bar({ done, planned = 0, max }: { done: number; planned?: number; max: number }) {
  const pct = (v: number) => `${Math.min(100, max > 0 ? (v / max) * 100 : 100)}%`;
  return (
    <div className="cg-bar" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={done + planned}>
      <i className="cg-bar-plan" style={{ width: pct(done + planned) }} />
      <i style={{ width: pct(done) }} />
    </div>
  );
}

export type Status = "validated" | "planned" | "in_progress" | "todo" | "failed";
const STATUS: Record<Status, [string, string]> = {
  validated: ["ok", "✓ validated"], planned: ["plan", "planned"], in_progress: ["wip", "in progress"],
  todo: ["todo", "to do"], failed: ["warn", "failed"],
};
export function StatusBadge({ status, mark }: { status: Status; mark?: number | null }) {
  const [tone, label] = STATUS[status];
  return <span className={`cg-badge cg-badge--${tone}`}>{label}{mark != null && status !== "todo" ? ` · ${mark}` : ""}</span>;
}

export function Badge({ tone, children, title }: { tone: "ok" | "plan" | "wip" | "todo" | "warn" | "team"; children: React.ReactNode; title?: string }) {
  return <span className={`cg-badge cg-badge--${tone}`} title={title}>{children}</span>;
}

export function PageState({ loading, error, onRetry }: { loading: boolean; error: string | null; onRetry?: () => void }) {
  if (error) return <div className="cg-error">Couldn&apos;t load your 42 data: {error}. {onRetry && <button className="cg-button" onClick={onRetry}>Retry</button>}</div>;
  if (loading) return <div className="cg-muted">Loading your 42 data…</div>;
  return null;
}

export const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
