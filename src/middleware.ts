import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";

/** Pages that need a session; the API routes check the session themselves. */
const PROTECTED = [
  "/dashboard",
  "/calendar",
  "/progress",
  "/alumni",
  "/moves",
  "/calculator",
  "/evals",
  "/peerfinder",
  "/rncp",
  "/projects",
  "/clusters",
  "/leaderboard",
  "/tracks",
  "/holygraph",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const cookie = (await cookies()).get("auth_code");
  if (pathname === "/") {
    if (cookie?.value) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && !cookie?.value) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Skip API routes, Next internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.[a-z0-9]+$).*)"],
};
