import { NextRequest, NextResponse } from "next/server";
import { rateLimit, RateLimitPresets } from "@/utils/rateLimit";
import { appToken, cached, errorStatus, intraGet, intraGetAll, userToken } from "@/utils/intra";
import { levelForXp, xpForLevel } from "@/utils/levels";

interface ProjectUser {
  final_mark: number | null;
  "validated?": boolean | null;
  marked_at: string | null;
  cursus_ids: number[];
  project: { id: number; name: string; slug: string; parent_id: number | null };
}

interface Me {
  id: number;
  cursus_users: { cursus_id: number; level: number }[];
  campus_users: { campus_id: number; is_primary: boolean }[];
  projects_users: ProjectUser[];
}

export interface HistoryPoint {
  date: string;
  level: number;
  name: string;
  slug: string;
  finalMark: number;
  xp: number;
}

export interface LevelHistory {
  level: number;
  points: HistoryPoint[];
}

const CURSUS_42 = 21;

type Session = { project_id: number; cursus_id: number | null; difficulty: number | null };

/** XP of every 42cursus project at a campus, in a few paged requests. Cached for a day.
 *  Student tokens get 403 on project_sessions, so these use the app's own token. */
function campusXp(campusId: number): Promise<Record<number, number>> {
  return cached(`campus-xp:${campusId}`, 24 * 3600_000, async () => {
    const sessions = await intraGetAll<Session>(await appToken(), "/v2/project_sessions",
      { "filter[campus_id]": campusId, "filter[cursus_id]": CURSUS_42 });
    const xp: Record<number, number> = {};
    for (const s of sessions) if (s.difficulty != null) xp[s.project_id] = s.difficulty;
    return xp;
  });
}

/** One project's XP, for projects the campus list doesn't cover (deprecated or moved ones). */
function projectXp(projectId: number): Promise<number> {
  return cached(`project-xp:${projectId}`, 24 * 3600_000, async () => {
    const sessions = await intraGet<{ cursus_id: number | null; difficulty: number | null }[]>(
      await appToken(), `/v2/projects/${projectId}/project_sessions`, { "page[size]": 100 });
    const pick = sessions.find((s) => s.cursus_id === CURSUS_42) ?? sessions.find((s) => s.cursus_id == null) ?? sessions[0];
    return pick?.difficulty ?? 0;
  });
}

/**
 * Level after each validated project, like the intra "experiences" page.
 * The 42 experiences endpoint isn't open to apps, so this walks back from the current level,
 * removing each project's XP (difficulty × mark). Recent points match the intra closely; older ones are approximate.
 */
export const GET = async (request: NextRequest) => {
  const limited = await rateLimit(request, RateLimitPresets.STRICT);
  if (limited) return limited;
  try {
    const token = await userToken(request);
    const me = await intraGet<Me>(token, "/v2/me");
    const data = await cached<LevelHistory>(`history:${me.id}`, 10 * 60_000, async () => {
      const level = me.cursus_users.find((c) => c.cursus_id === CURSUS_42)?.level ?? 0;
      const validated = me.projects_users
        .filter((p) => p["validated?"] && p.marked_at && p.project.parent_id == null && p.cursus_ids.includes(CURSUS_42))
        .sort((a, b) => b.marked_at!.localeCompare(a.marked_at!));
      const campusId = me.campus_users.find((c) => c.is_primary)?.campus_id ?? me.campus_users[0]?.campus_id;
      const known = campusId ? await campusXp(campusId) : {};
      const points: HistoryPoint[] = [];
      let xp = xpForLevel(level);
      // Sequential: the 42 API allows 2 requests per second.
      for (const p of validated) {
        const difficulty = known[p.project.id] ?? await projectXp(p.project.id);
        const gained = Math.round(difficulty * (p.final_mark ?? 0) / 100);
        points.push({
          date: p.marked_at!,
          level: levelForXp(Math.max(xp, 0)),
          name: p.project.name,
          slug: p.project.slug.replace(/^42cursus-/, ""),
          finalMark: p.final_mark ?? 0,
          xp: gained,
        });
        xp -= gained;
      }
      return { level, points };
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error("tracker/history:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: errorStatus(error) });
  }
};
