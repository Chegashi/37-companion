export interface TrackedProject {
  id: number;
  slug: string;
  name: string;
  status: string;
  finalMark: number | null;
  validated: boolean;
  markedAt: string | null;
}

export interface TrackerMe {
  id: number;
  login: string;
  image: string | null;
  campusId: number | null;
  level: number;
  blackholedAt: string | null;
  events: number;
  projects: TrackedProject[];
}
