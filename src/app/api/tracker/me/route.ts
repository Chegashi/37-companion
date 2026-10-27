import { NextRequest, NextResponse } from "next/server";
import { rateLimit, RateLimitPresets } from "@/utils/rateLimit";
import { cached, errorStatus, intraGet, intraGetAll, userToken } from "@/utils/intra";
import type { TrackerMe } from "./tracker.types";

interface ProjectUser {
  final_mark: number | null;
  status: string;
  "validated?": boolean | null;
  marked_at: string | null;
  cursus_ids: number[];
  project: { id: number; name: string; slug: string; parent_id: number | null };
}

interface Me {
  id: number;
  login: string;
  image?: { link?: string; versions?: { medium?: string } };
  cursus_users: { cursus_id: number; level: number; blackholed_at: string | null }[];
  campus_users: { campus_id: number; is_primary: boolean }[];
  projects_users: ProjectUser[];
}

const CURSUS_42 = 21;

/** Snapshot of the logged-in user's cursus: level, project statuses and event count. */
export const GET = async (request: NextRequest) => {
  const limited = await rateLimit(request, RateLimitPresets.STRICT);
  if (limited) return limited;
  try {
    const token = await userToken(request);
    const me = await intraGet<Me>(token, "/v2/me");
    const data = await cached<TrackerMe>(`tracker:${me.id}`, 5 * 60_000, async () => {
      // Pedagogical events count toward RNCP (same filter as the RNCP planner).
      const events = await intraGetAll<{ kind: string }>(token, `/v2/users/${me.id}/events`);
      const cursus = me.cursus_users.find((c) => c.cursus_id === CURSUS_42);
      return {
        id: me.id,
        login: me.login,
        image: me.image?.versions?.medium || me.image?.link || null,
        campusId: me.campus_users.find((c) => c.is_primary)?.campus_id ?? me.campus_users[0]?.campus_id ?? null,
        level: cursus?.level ?? 0,
        blackholedAt: cursus?.blackholed_at ?? null,
        events: events.filter((e) => e.kind !== "extern" && e.kind !== "association").length,
        projects: me.projects_users
          .filter((p) => p.cursus_ids.includes(CURSUS_42))
          .map((p) => ({
            id: p.project.id,
            slug: p.project.slug.replace(/^42cursus-/, ""),
            name: p.project.name,
            status: p.status,
            finalMark: p.final_mark,
            validated: p["validated?"] === true,
            markedAt: p.marked_at,
          })),
      };
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error("tracker/me:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: errorStatus(error) });
  }
};
