import { XPIcon } from "../xp/XPIcon";

interface UserData {
  fullname?: string;
  level: number;
  email: string;
  login: string;
  kind: string;
  image: string;
  staff: boolean;
  correction_point: number;
  pool_month: string;
  pool_year: string;
  location: string | null;
  wallet: number;
  campus_id: number;
  campus_name: string;
  badge?: {
    type: 'creator' | 'vip' | 'owner' | 'staff';
    name: string;
  } | null;
}

interface ButtonsProps {
  icon: React.ReactNode;
  title: string;
  route: string;
}

const PathsObject: ButtonsProps[] = [
  {
    icon: <XPIcon name="route" size={25} />,
    title: "The Path",
    route: "/path",
  },
  {
    icon: <XPIcon name="graduation" size={25} />,
    title: "RNCP",
    route: "/rncp",
  },
  {
    icon: <XPIcon name="list" size={25} />,
    title: "Projects",
    route: "/projects",
  },
  {
    icon: <XPIcon name="map" size={25} />,
    title: "Clusters",
    route: "/clusters",
  },
  {
    icon: <XPIcon name="calculator" size={25} />,
    title: "Calculator",
    route: "/calculator",
  },
  {
    icon: <XPIcon name="users" size={25} />,
    title: "Peer-Finder",
    route: "/peerfinder",
  },
  {
    icon: <XPIcon name="trophy" size={25} />,
    title: "Rank",
    route: "/progress",
  },
];

export type { ButtonsProps, UserData };
export { PathsObject };
