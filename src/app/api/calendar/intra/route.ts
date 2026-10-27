import { NextRequest, NextResponse } from "next/server";
import { rateLimit, RateLimitPresets } from "@/utils/rateLimit";
import { cached, errorStatus, intraGet, intraGetAll, userToken } from "@/utils/intra";
import type { IntraItem } from "../calendar.types";

interface IntraEvent { id: number; name: string; kind: string; location: string | null; begin_at: string; end_at: string }
type Person = { login: string } | string;
interface ScaleTeam {
  id: number;
  begin_at: string | null;
  corrector: Person;
  correcteds: Person[] | string;
  scale?: { duration?: number } | null;
  team?: { name?: string } | null;
}

const MAX_RANGE = 62 * 86_400_000;
const loginOf = (p: Person) => (typeof p === "string" ? null : p.login);

/**
 * GET /api/calendar/intra?from=<ISO>&to=<ISO> → { items } — the campus events the user is subscribed to
 * and their scheduled evaluations (as evaluator or evaluated) in that range, read live from intra.
 */
export const GET = async (request: NextRequest) => {
  const limited = await rateLimit(request, RateLimitPresets.STRICT);
  if (limited) return limited;
  const from = new Date(request.nextUrl.searchParams.get("from") ?? "");
  const to = new Date(request.nextUrl.searchParams.get("to") ?? "");
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from || to.getTime() - from.getTime() > MAX_RANGE)
    return NextResponse.json({ error: "from and to must be ISO dates less than 62 days apart" }, { status: 400 });
  try {
    const token = await userToken(request);
    const me = await intraGet<{ id: number; login: string }>(token, "/v2/me");
    const range = `${from.toISOString()},${to.toISOString()}`;
    const items = await cached<IntraItem[]>(`calendar:${me.id}:${range}`, 5 * 60_000, async () => {
      const [events, evals] = await Promise.all([
        intraGetAll<IntraEvent>(token, `/v2/users/${me.id}/events`, { "range[begin_at]": range }, 5),
        intraGetAll<ScaleTeam>(token, "/v2/me/scale_teams", { "range[begin_at]": range }, 5),
      ]);
      return [
        ...events.map((e): IntraItem => ({
          id: `event-${e.id}`, kind: "event", title: e.name, begin: e.begin_at, end: e.end_at, location: e.location, detail: e.kind,
        })),
        ...evals.filter((s) => s.begin_at).map((s): IntraItem => {
          const evaluating = loginOf(s.corrector) === me.login;
          const begin = new Date(s.begin_at!);
          const others = evaluating && Array.isArray(s.correcteds) ? s.correcteds.map(loginOf).filter(Boolean).join(", ") : null;
          const corrector = !evaluating ? loginOf(s.corrector) : null;
          return {
            id: `eval-${s.id}`,
            kind: "eval",
            title: `${evaluating ? "Evaluate" : "Evaluated"}: ${s.team?.name ?? "project"}`,
            begin: begin.toISOString(),
            end: new Date(begin.getTime() + (s.scale?.duration || 1800) * 1000).toISOString(),
            location: null,
            detail: others ? `Team: ${others}` : corrector ? `Evaluator: ${corrector}` : null,
          };
        }),
      ];
    });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("calendar/intra:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: errorStatus(error) });
  }
};
