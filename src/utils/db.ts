import { Pool } from "pg";

// One connection pool per server process, shared by every API route (a pool per request leaks
// connections under load). Kept on globalThis so hot reload in development doesn't open new ones.
const g = globalThis as typeof globalThis & { dbPool?: Pool };
export const pool = g.dbPool ?? new Pool({ connectionString: process.env.DATABASE_KEY || process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== "production") g.dbPool = pool;
