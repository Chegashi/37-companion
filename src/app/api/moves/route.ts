import { NextRequest, NextResponse } from "next/server";
import { rateLimit, RateLimitPresets } from "@/utils/rateLimit";
import { appToken, errorStatus, userToken } from "@/utils/intra";
import { campusMoves } from "@/utils/campus";

/** GET /api/moves?campus=<id> → { moves } — who switched campus, into or out of this one. */
export const GET = async (request: NextRequest) => {
  const limited = await rateLimit(request, RateLimitPresets.STRICT);
  if (limited) return limited;
  try {
    await userToken(request); // must be logged in
    // /v2/campus_users answers 403 to a student token, so the whole lookup runs with the app's token.
    const token = await appToken();
    const campus = Number(request.nextUrl.searchParams.get("campus"));
    if (!campus) return NextResponse.json({ error: "campus is required" }, { status: 400 });
    return NextResponse.json({ moves: await campusMoves(token, campus) });
  } catch (error) {
    console.error("moves:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: errorStatus(error) });
  }
};
