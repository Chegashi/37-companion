import { NextRequest, NextResponse } from "next/server";
import * as jose from "jose";

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

// Fixed-window counters, per process (one app container). Keyed by route + caller.
const hits = new Map<string, { count: number; resetAt: number }>();
let lastSweep = Date.now();

/**
 * Who is calling: the 42 login from a valid session cookie, else the client IP. A whole campus often
 * shares one public IP, so signed-in students are counted one by one rather than per IP.
 */
async function callerOf(request: NextRequest): Promise<string> {
  const cookie = request.cookies.get("auth_code")?.value;
  if (cookie) {
    try {
      const { payload } = await jose.jwtVerify(cookie, new TextEncoder().encode(process.env.SECRET_KEY as string));
      if (typeof payload.login === "string") return `login:${payload.login}`;
    } catch { /* invalid session: fall back to the IP */ }
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
  return `ip:${ip}`;
}

/** Returns a 429 response when the caller went over `config` on this route, otherwise null. */
export async function rateLimit(
  request: NextRequest,
  config: RateLimitConfig = RateLimitPresets.STANDARD
): Promise<NextResponse | null> {
  const now = Date.now();
  if (now - lastSweep > 5 * 60_000) {
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    lastSweep = now;
  }
  const key = `${request.nextUrl.pathname}|${await callerOf(request)}`;
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + config.windowMs });
    return null;
  }
  entry.count++;
  if (entry.count <= config.maxRequests) return null;
  const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
  return NextResponse.json(
    { error: "Too many requests — slow down a little.", retryAfter, showPopup: true },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

export const RateLimitPresets = {
  STRICT: { maxRequests: 30, windowMs: 60000 },
  STANDARD: { maxRequests: 40, windowMs: 60000 },
  RELAXED: { maxRequests: 60, windowMs: 60000 },
  AUTH: { maxRequests: 10, windowMs: 60000 },
  WRITE: { maxRequests: 15, windowMs: 60000 },
};
