// Calendar — the events each user adds on /calendar, stored per 42 login in Postgres
// so they follow the user across browsers and devices.
import { NextRequest, NextResponse } from "next/server";
import { pool as shared } from "@/utils/db";
import { z } from "zod";
import { sessionLogin } from "@/utils/intra";
import { rateLimit, RateLimitPresets } from "@/utils/rateLimit";
import { CAL_CATS } from "./calendar.types";

let ready: Promise<unknown> | null = null;
const db = () => {
  ready ??= shared.query(`CREATE TABLE IF NOT EXISTS calendar_state (
    login TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`).catch((e) => { ready = null; throw e; });
  return shared;
};

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const Event = z.object({
  id: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(120),
  cat: z.enum(CAL_CATS),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: time,
  end: time,
  repeat: z.enum(["none", "daily", "weekdays", "weekly"]),
  notes: z.string().max(2000).optional(),
});
const Body = z.object({ data: z.object({ events: z.array(Event).max(1000) }) });

export async function GET(request: NextRequest) {
  const limited = await rateLimit(request, RateLimitPresets.RELAXED);
  if (limited) return limited;
  const login = await sessionLogin(request);
  if (!login) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const client = db();
    await ready;
    const { rows } = await client.query("SELECT data, updated_at FROM calendar_state WHERE login = $1", [login]);
    return NextResponse.json({ login, data: rows[0]?.data ?? null, updatedAt: rows[0]?.updated_at ?? null });
  } catch (e) {
    console.error("calendar GET", e);
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  const limited = await rateLimit(request, RateLimitPresets.RELAXED);
  if (limited) return limited;
  const login = await sessionLogin(request);
  if (!login) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const body = Body.safeParse(raw);
  if (!body.success) return NextResponse.json({ error: "Invalid calendar data" }, { status: 400 });
  try {
    const client = db();
    await ready;
    const { rows } = await client.query(
      `INSERT INTO calendar_state (login, data, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (login) DO UPDATE SET data = EXCLUDED.data, updated_at = now() RETURNING updated_at`,
      [login, JSON.stringify(body.data.data)],
    );
    return NextResponse.json({ ok: true, updatedAt: rows[0].updated_at });
  } catch (e) {
    console.error("calendar PUT", e);
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
