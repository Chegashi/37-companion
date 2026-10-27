import { NextRequest, NextResponse } from "next/server";
import { rateLimit, RateLimitPresets } from "@/utils/rateLimit";
import { errorStatus, userToken } from "@/utils/intra";
import { campusCoalitions, campusStudents } from "@/utils/campus";

/** GET /api/leaderboard?campus=<id> → { students, coalitions } (port of 42evaluators' leaderboard data). */
export const GET = async (request: NextRequest) => {
  const limited = await rateLimit(request, RateLimitPresets.STRICT);
  if (limited) return limited;
  try {
    const token = await userToken(request);
    const campus = Number(request.nextUrl.searchParams.get("campus"));
    if (!campus) return NextResponse.json({ error: "campus is required" }, { status: 400 });
    const [students, { coalitions }] = await Promise.all([
      campusStudents(token, campus),
      campusCoalitions(token, campus).catch(() => ({ coalitions: [] })),
    ]);
    return NextResponse.json({ students, coalitions });
  } catch (error) {
    console.error("leaderboard:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: errorStatus(error) });
  }
};
