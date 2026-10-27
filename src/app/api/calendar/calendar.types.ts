export const CAL_CATS = ["study", "eval", "exam", "work", "sport", "life"] as const;
export type CalCat = (typeof CAL_CATS)[number];
export type CalRepeat = "none" | "daily" | "weekdays" | "weekly";

/** An event the user added. `date` is the first (or only) day; an `end` at or before `start` runs past midnight. */
export interface CalEvent {
  id: string;
  title: string;
  cat: CalCat;
  date: string;
  start: string;
  end: string;
  repeat: CalRepeat;
  notes?: string;
}

/** Read-only items from intra: campus events the user is subscribed to and scheduled evaluations. */
export interface IntraItem {
  id: string;
  kind: "event" | "eval";
  title: string;
  begin: string;
  end: string;
  location: string | null;
  detail: string | null;
}
