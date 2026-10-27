import { NextRequest, NextResponse } from "next/server";
import { rateLimit, RateLimitPresets } from "@/utils/rateLimit";
import { errorStatus, userToken } from "@/utils/intra";
import { campusAlumni } from "@/utils/campus";

/** GET /api/alumni?campus=<id> → { alumni } — the campus's 42 alumni with their cursus level. */
export const GET = async (request: NextRequest) => {
  const limited = await rateLimit(request, RateLimitPresets.STRICT);
  if (limited) return limited;
  try {
    const token = await userToken(request);
    const campus = Number(request.nextUrl.searchParams.get("campus"));
    if (!campus) return NextResponse.json({ error: "campus is required" }, { status: 400 });
    return NextResponse.json({ alumni: await campusAlumni(token, campus) });
  } catch (error) {
    console.error("alumni:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: errorStatus(error) });
  }
};
