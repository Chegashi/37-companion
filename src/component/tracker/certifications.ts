// 42's official certifications (scripts/fetch_certifications.py → src/data/certifications.json):
// the Credly badges and the two France Compétences RNCP fiches, tied to the app's four titles.
import certJson from "@/data/certifications.json";

export interface CredlyBadge {
  id: string; name: string; kind: "level" | "rncp" | "other"; level: number | null; plus: boolean; rank: string | null;
  rncp_code: string | null; rncp_level: number | null; current: boolean | null;
  description: string; image: string; url: string; skills: string[]; earn: string[];
}
export interface OfficialBlock { code: string; title: string; option: number | null; competences: string[]; evaluation: string }
export interface Fiche {
  code: string; title: string; level: number; eqf: string; expiry: string; url: string; info_url: string | null;
  summary: string; activities: string[]; blocks: OfficialBlock[]; rule: string[]; sectors: string;
  jobs: string[]; rome: { code: string; label: string }[]; prerequisites: string[];
  stats: { year: number; certified: number | null; by_vae: number | null; insertion_6m: number | null; in_job_6m: number | null; in_job_2y: number | null }[];
}

export const CERTS = certJson as unknown as { fetched_at: string; sources: { credly: string; rncp: string[] }; badges: CredlyBadge[]; fiches: Record<string, Fiche> };

/** Each app title = one fiche + its specialisation option (block "option 1" / "option 2"). */
const TITLE_OFFICIAL: Record<string, { code: string; option: number; badge: RegExp }> = {
  "6-web": { code: "39783", option: 1, badge: /web/i },
  "6-apps": { code: "39783", option: 2, badge: /logiciels/i },
  "7-sec": { code: "39774", option: 1, badge: /réseaux/i },
  "7-ai": { code: "39774", option: 2, badge: /données|data/i },
};

export function officialFor(titleKey: string) {
  const t = TITLE_OFFICIAL[titleKey];
  const fiche = t && CERTS.fiches[t.code];
  if (!fiche) return null;
  // The badge of the current registration ("… (39774)"), else the older one.
  const badges = CERTS.badges.filter((b) => b.kind === "rncp" && b.rncp_level === fiche.level && t.badge.test(b.name));
  return {
    fiche,
    option: t.option,
    blocks: fiche.blocks.filter((b) => b.option == null || b.option === t.option),
    badge: badges.find((b) => b.current) ?? badges[0] ?? null,
  };
}

/** The 42 Cursus level badges, 9 → 21+, low to high. */
export const LEVEL_BADGES = CERTS.badges.filter((b) => b.kind === "level").sort((a, b) => a.level! - b.level! || Number(a.plus) - Number(b.plus));

/** Highest level badge a level reaches (null under level 9). "21+" is shown as reached from 21 too. */
export const levelBadgeFor = (level: number) => [...LEVEL_BADGES].reverse().find((b) => Math.floor(level) >= b.level!) ?? null;
