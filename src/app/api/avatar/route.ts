import { NextRequest, NextResponse } from "next/server";
import { appToken, sessionLogin } from "@/utils/intra";

/** Proxy a 42 profile picture: cdn.intra.42.fr answers 403 unless the request carries an API token. */
export async function GET(request: NextRequest) {
  if (!(await sessionLogin(request))) return new NextResponse(null, { status: 401 });

  let url: URL;
  try {
    url = new URL(request.nextUrl.searchParams.get("u") ?? "");
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  // Only 42 user pictures, so this can't be used as an open proxy.
  if (url.protocol !== "https:" || url.hostname !== "cdn.intra.42.fr" || !url.pathname.startsWith("/users/")) {
    return new NextResponse(null, { status: 400 });
  }

  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${await appToken()}` }, cache: "no-store" });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return NextResponse.redirect(new URL("/nopic.svg", request.url));
    return new NextResponse(res.body, {
      headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400" },
    });
  } catch {
    return NextResponse.redirect(new URL("/nopic.svg", request.url));
  }
}
