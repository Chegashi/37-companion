import { NextRequest } from "next/server";
import * as jose from "jose";
import { DecryptionFunction } from "@/app/api/auth/type.auth";

const API = process.env.INTRA_TOKEN || "https://api.intra.42.fr";

export class IntraAuthError extends Error {}

/** The logged-in user's 42 access token (stored encrypted in the auth_code JWT cookie). */
export async function userToken(request: NextRequest): Promise<string> {
  const cookie = request.cookies.get("auth_code")?.value;
  if (!cookie) throw new IntraAuthError("Not authenticated");
  await jose.jwtVerify(cookie, new TextEncoder().encode(process.env.SECRET_KEY as string));
  const token = DecryptionFunction(jose.decodeJwt(cookie).token as string);
  if (!token) throw new IntraAuthError("Invalid session");
  return token;
}

/** The logged-in user's 42 login, from the signed session cookie (null when signed out). */
export async function sessionLogin(request: NextRequest): Promise<string | null> {
  const cookie = request.cookies.get("auth_code")?.value;
  if (!cookie) return null;
  try {
    const { payload } = await jose.jwtVerify(cookie, new TextEncoder().encode(process.env.SECRET_KEY as string));
    return typeof payload.login === "string" ? payload.login : null;
  } catch {
    return null;
  }
}

let app: { token: string; until: number } | null = null;

/** The app's own 42 token (client credentials), for endpoints a student token can't read (e.g. /v2/campus_users). */
export async function appToken(): Promise<string> {
  if (app && Date.now() < app.until) return app.token;
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: process.env.INTRA_UID ?? "", client_secret: process.env.INTRA_SECRET_KEY ?? "" }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`42 app token: ${res.status}`);
  const { access_token, expires_in } = await res.json() as { access_token: string; expires_in: number };
  app = { token: access_token, until: Date.now() + (expires_in - 60) * 1000 };
  return access_token;
}

export async function intraGet<T>(token: string, path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (res.status === 429 && attempt < 8) {
      await new Promise((r) => setTimeout(r, 1000 * Number(res.headers.get("Retry-After") || 1)));
      continue;
    }
    if (res.status === 401) throw new IntraAuthError("42 session expired — log in again");
    if (!res.ok) throw new Error(`42 API ${path}: ${res.status}`);
    return res.json() as Promise<T>;
  }
}

export async function intraGetAll<T>(token: string, path: string, params: Record<string, string | number> = {}, maxPages = 50): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const batch = await intraGet<T[]>(token, path, { ...params, "page[size]": 100, "page[number]": page });
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

const cache = new Map<string, { at: number; value: unknown }>();

/** Memoize an expensive 42 API aggregation for `ttlMs` (per key, in this server process). */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function errorStatus(error: unknown): number {
  return error instanceof IntraAuthError ? 401 : 502;
}
