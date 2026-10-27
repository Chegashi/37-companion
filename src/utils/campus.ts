// Campus-wide student data from the 42 API, shared by the campus pages (leaderboard, alumni, moves).
import { cached, intraGet, intraGetAll } from "@/utils/intra";

interface CursusUser {
  level: number;
  blackholed_at: string | null;
  end_at: string | null;
  user: {
    id: number; login: string; displayname?: string; usual_full_name?: string | null;
    correction_point?: number; wallet?: number; pool_month?: string | null; pool_year?: string | null;
    location?: string | null; "staff?"?: boolean; "alumni?"?: boolean;
    image?: { versions?: { small?: string }; link?: string };
  };
}

export interface Student {
  id: number; login: string; displayName: string; image: string; level: number; blackholedAt: string | null;
  correctionPoints: number; wallet: number; poolMonth: string | null; poolYear: string | null; location: string | null;
  coalition: string | null;
}
export interface Coalition { id: number; name: string; color: string; image: string | null; score: number }

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
export const promoKey = (s: Pick<Student, "poolMonth" | "poolYear">) =>
  s.poolYear && s.poolMonth ? `${s.poolYear}-${String(MONTHS.indexOf(s.poolMonth.toLowerCase()) + 1).padStart(2, "0")}` : null;

/** Active, non-staff 42cursus students of a campus (cached 6 h — it is ~10–20 API pages). */
export function campusStudents(token: string, campus: number): Promise<Student[]> {
  return cached(`students:${campus}`, 6 * 3600_000, async () => {
    const [users, coalitions] = await Promise.all([
      intraGetAll<CursusUser>(token, "/v2/cursus/21/cursus_users", { "filter[campus_id]": campus, "filter[active]": "true" }, 40),
      campusCoalitions(token, campus).catch(() => ({ coalitions: [], byUser: new Map<number, string>() })),
    ]);
    return users
      .filter((u) => !u.end_at && !u.user["staff?"] && !u.user["alumni?"])
      .map((u) => ({
        id: u.user.id,
        login: u.user.login,
        displayName: u.user.usual_full_name || u.user.displayname || u.user.login,
        image: u.user.image?.versions?.small || u.user.image?.link || "/nopic.svg",
        level: u.level,
        blackholedAt: u.blackholed_at,
        correctionPoints: u.user.correction_point ?? 0,
        wallet: u.user.wallet ?? 0,
        poolMonth: u.user.pool_month ?? null,
        poolYear: u.user.pool_year ?? null,
        location: u.user.location ?? null,
        coalition: coalitions.byUser.get(u.user.id) ?? null,
      }));
  });
}

/** The campus's 42cursus coalitions and who belongs to which. */
export function campusCoalitions(token: string, campus: number) {
  return cached(`coalitions:${campus}`, 6 * 3600_000, async () => {
    const blocs = await intraGet<{ coalitions: { id: number; name: string; color: string; image_url: string | null; score: number }[] }[]>(
      token, "/v2/blocs", { "filter[campus_id]": campus, "filter[cursus_id]": 21 });
    const coalitions: Coalition[] = (blocs[0]?.coalitions ?? []).map((c) => ({ id: c.id, name: c.name, color: c.color, image: c.image_url, score: c.score }));
    const byUser = new Map<number, string>();
    for (const c of coalitions) {
      const members = await intraGetAll<{ user_id: number }>(token, `/v2/coalitions/${c.id}/coalitions_users`, {}, 30);
      for (const m of members) byUser.set(m.user_id, c.name);
    }
    return { coalitions, byUser };
  });
}

export interface Alumnus {
  id: number; login: string; displayName: string; image: string; level: number;
  poolMonth: string | null; poolYear: string | null; location: string | null; wallet: number; correctionPoints: number;
  alumnizedAt: string | null; beginAt: string | null;
}

/** A campus's alumni (users flagged alumni by 42) with their 42cursus level (cached 6 h). */
export function campusAlumni(token: string, campus: number): Promise<Alumnus[]> {
  return cached(`alumni:${campus}`, 6 * 3600_000, async () => {
    type AlumniUser = CursusUser["user"] & { kind?: string; alumnized_at?: string | null; image?: { versions?: { medium?: string; small?: string }; link?: string } };
    const users = (await intraGetAll<AlumniUser>(token, `/v2/campus/${campus}/users`, { "filter[alumni?]": "true" }, 30))
      .filter((u) => !u["staff?"] && u.kind === "student");
    // Levels come from the 42cursus record, 100 users per request; alumni without one (old cursus) are left out.
    const cursus = new Map<number, { level: number; begin_at: string | null }>();
    for (let i = 0; i < users.length; i += 100) {
      const ids = users.slice(i, i + 100).map((u) => u.id).join(",");
      const rows = await intraGet<{ level: number; begin_at: string | null; user: { id: number } }[]>(
        token, "/v2/cursus/21/cursus_users", { "filter[user_id]": ids, "page[size]": 100 });
      for (const r of rows) cursus.set(r.user.id, r);
    }
    return users.filter((u) => cursus.has(u.id)).map((u) => ({
      id: u.id,
      login: u.login,
      displayName: u.usual_full_name || u.displayname || u.login,
      image: u.image?.versions?.medium || u.image?.link || "/nopic.svg",
      level: cursus.get(u.id)!.level,
      poolMonth: u.pool_month ?? null,
      poolYear: u.pool_year ?? null,
      location: u.location ?? null,
      wallet: u.wallet ?? 0,
      correctionPoints: u.correction_point ?? 0,
      alumnizedAt: u.alumnized_at ?? null,
      beginAt: cursus.get(u.id)!.begin_at,
    }));
  });
}

export interface CampusMove {
  id: number; login: string; displayName: string; image: string; level: number | null;
  poolMonth: string | null; poolYear: string | null; location: string | null; wallet: number; correctionPoints: number;
  /** "in": now based on this campus, came from another; "out": was here, now based elsewhere. */
  direction: "in" | "out";
  /** Every campus they were registered at, oldest first; the last one is where they are now. */
  path: { campusId: number; campus: string; at: string }[];
  movedAt: string;
}

/**
 * Who switched campus, seen from one campus. 42 keeps one campus_users record per campus a user joined
 * (the current one is primary), so anyone with two or more records moved. Arrivals are searched among the
 * campus's current students and alumni; departures are the campus's non-primary records (cached 12 h).
 */
export function campusMoves(token: string, campus: number): Promise<CampusMove[]> {
  return cached(`moves:${campus}`, 12 * 3600_000, async () => {
    type CampusUser = { user_id: number; campus_id: number; is_primary: boolean; created_at: string };
    const [students, alumni, leftRecords] = await Promise.all([
      campusStudents(token, campus),
      campusAlumni(token, campus),
      intraGetAll<CampusUser>(token, "/v2/campus_users", { "filter[campus_id]": campus, "filter[is_primary]": "false" }, 20),
    ]);
    const known = new Map<number, Omit<CampusMove, "direction" | "path" | "movedAt">>();
    for (const s of [...students, ...alumni]) known.set(s.id, s);
    const ids = [...new Set([...known.keys(), ...leftRecords.map((r) => r.user_id)])];

    // Every campus record of those users, 100 users per request.
    const records = new Map<number, CampusUser[]>();
    for (let i = 0; i < ids.length; i += 100) {
      const rows = await intraGetAll<CampusUser>(token, "/v2/campus_users", { "filter[user_id]": ids.slice(i, i + 100).join(",") }, 5);
      for (const r of rows) records.set(r.user_id, [...(records.get(r.user_id) ?? []), r]);
    }
    const movers = [...records.entries()].filter(([, rs]) => new Set(rs.map((r) => r.campus_id)).size > 1);

    // Profiles and levels for the people who left (they aren't in this campus's lists).
    const missing = movers.map(([id]) => id).filter((id) => !known.has(id));
    for (let i = 0; i < missing.length; i += 100) {
      const batch = missing.slice(i, i + 100).join(",");
      type U = CursusUser["user"] & { kind?: string; image?: { versions?: { medium?: string }; link?: string } };
      const [users, cursus] = await Promise.all([
        intraGet<U[]>(token, "/v2/users", { "filter[id]": batch, "page[size]": 100 }),
        intraGet<{ level: number; user: { id: number } }[]>(token, "/v2/cursus/21/cursus_users", { "filter[user_id]": batch, "page[size]": 100 }),
      ]);
      const level = new Map(cursus.map((c) => [c.user.id, c.level]));
      for (const u of users) {
        if (u["staff?"] || u.kind !== "student") continue;
        known.set(u.id, {
          id: u.id, login: u.login, displayName: u.usual_full_name || u.displayname || u.login,
          image: u.image?.versions?.medium || u.image?.link || "/nopic.svg", level: level.get(u.id) ?? null,
          poolMonth: u.pool_month ?? null, poolYear: u.pool_year ?? null, location: u.location ?? null,
          wallet: u.wallet ?? 0, correctionPoints: u.correction_point ?? 0,
        });
      }
    }

    const campusIds = [...new Set(movers.flatMap(([, rs]) => rs.map((r) => r.campus_id)))];
    const names = new Map((await intraGet<{ id: number; name: string }[]>(token, "/v2/campus", { "filter[id]": campusIds.join(","), "page[size]": 100 }))
      .map((c) => [c.id, c.name]));

    return movers.flatMap(([id, rs]) => {
      const person = known.get(id);
      if (!person) return [];
      // Oldest first, with the primary (current) campus last.
      const sorted = [...rs].sort((a, b) => Number(a.is_primary) - Number(b.is_primary) || a.created_at.localeCompare(b.created_at));
      const now = sorted[sorted.length - 1];
      const path = sorted.map((r) => ({ campusId: r.campus_id, campus: names.get(r.campus_id) ?? `Campus ${r.campus_id}`, at: r.created_at }));
      const here = sorted.find((r) => r.campus_id === campus);
      const direction: CampusMove["direction"] = now.campus_id === campus ? "in" : "out";
      // In: when they joined this campus. Out: when they joined the campus after this one.
      const movedAt = direction === "in" ? now.created_at : (sorted.find((r) => here && r.created_at > here.created_at) ?? now).created_at;
      return [{ ...person, direction, path, movedAt }];
    });
  });
}
