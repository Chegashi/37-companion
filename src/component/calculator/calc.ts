// Level calculator logic (after 42calculator.fr): each row adds its XP to the running total,
// so every row's "level after" depends on the rows above it — reorder and everything updates.
import { levelForXp, xpForLevel } from "@/utils/levels";

export const COALITION_BONUS = 1.042;

export interface CalcRow {
  key: string;
  name: string;
  slug: string | null; // null = custom project
  baseXp: number;
  mark: number; // 0–125
  bonus: boolean;
  /** Piscine modules left out of this row (already validated, or not planned); undefined = never set. */
  skipped?: string[];
}

export interface CalcResult extends CalcRow { gained: number; levelBefore: number; levelAfter: number }

export const gainedXp = (r: Pick<CalcRow, "baseXp" | "mark" | "bonus">) =>
  r.baseXp * (r.mark / 100) * (r.bonus ? COALITION_BONUS : 1);

export function computeLevels(startLevel: number, rows: CalcRow[]) {
  let xp = xpForLevel(startLevel);
  const results: CalcResult[] = rows.map((r) => {
    const levelBefore = levelForXp(xp);
    const gained = gainedXp(r);
    xp += gained;
    return { ...r, gained, levelBefore, levelAfter: levelForXp(xp) };
  });
  return { results, totalXp: xp - xpForLevel(startLevel), endLevel: levelForXp(xp) };
}

export function move<T>(list: T[], from: number, to: number): T[] {
  if (from === to || to < 0 || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** A project appears once: catalog projects by slug, custom ones by normalized name. */
export const rowIdentity = (r: Pick<CalcRow, "slug" | "name">) =>
  r.slug ?? `custom:${r.name.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

/** Keep the first row of each project (with its mark / bonus), drop later duplicates. */
export function dedupeRows<T extends Pick<CalcRow, "slug" | "name">>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => { const id = rowIdentity(r); if (seen.has(id)) return false; seen.add(id); return true; });
}

/** The calculator's result. From your live level (no custom start), projects validated on intra add no XP. */
export function simulate(rows: CalcRow[], startLevel: number | null, liveLevel: number, validated: Set<string>) {
  const start = startLevel ?? liveLevel;
  const counted = rows.map((r) => (startLevel == null && r.slug != null && validated.has(r.slug) ? { ...r, baseXp: 0 } : r));
  return { start, ...computeLevels(start, counted) };
}
