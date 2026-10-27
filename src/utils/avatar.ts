import type { SyntheticEvent } from "react";

export const NO_PIC = "/nopic.svg";

/** The 42 CDN only serves pictures to requests with an API token, so its links go through /api/avatar. */
export function avatarSrc(url: string | null | undefined): string {
  if (!url) return NO_PIC;
  return url.startsWith("https://cdn.intra.42.fr/") ? `/api/avatar?u=${encodeURIComponent(url)}` : url;
}

/** onError for avatar <img>s: swap a broken intra picture for the placeholder (once, to avoid loops). */
export function avatarFallback(e: SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (!img.src.endsWith(NO_PIC)) img.src = NO_PIC;
}
