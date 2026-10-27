// Official 42cursus experience table (GET /v2/cursus/21 → levels).
export const LEVELS_XP = [
  0, 462, 2688, 5885, 11777, 29217, 46255, 63559, 74340, 85483, 95000, 105630, 124446, 145782,
  169932, 197316, 228354, 263508, 303366, 348516, 399672, 457632, 523320, 597786, 682164, 777756,
  886074, 1008798, 1147902, 1305486, 1484070,
];

export function xpForLevel(level: number): number {
  const base = Math.floor(level);
  if (base >= LEVELS_XP.length - 1) return LEVELS_XP[LEVELS_XP.length - 1];
  return LEVELS_XP[base] + (level - base) * (LEVELS_XP[base + 1] - LEVELS_XP[base]);
}

export function levelForXp(xp: number): number {
  let i = 0;
  while (i < LEVELS_XP.length - 1 && LEVELS_XP[i + 1] <= xp) i++;
  if (i >= LEVELS_XP.length - 1) return LEVELS_XP.length - 1;
  return i + (xp - LEVELS_XP[i]) / (LEVELS_XP[i + 1] - LEVELS_XP[i]);
}
