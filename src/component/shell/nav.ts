import type { IconType } from "react-icons";
import { PiArrowsLeftRight, PiGraduationCap, PiGraph } from "react-icons/pi";
import {
  FiActivity, FiAward, FiBarChart2, FiGitBranch, FiBookOpen, FiCalendar, FiCpu, FiGrid, FiLayers,
  FiClipboard, FiMap, FiUsers,
} from "react-icons/fi";

export interface NavItem { label: string; href: string; icon: IconType; hint: string }
export interface NavGroup { title: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  {
    title: "Me",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: FiGrid, hint: "Your profile at a glance" },
      { label: "Calendar", href: "/calendar", icon: FiCalendar, hint: "Your week — add your own events, with your intra evaluations and events on top" },
      { label: "Holy graph", href: "/holygraph", icon: PiGraph, hint: "Your intra holy graph — every project, prerequisites and certifications" },
      { label: "Tracks", href: "/tracks", icon: FiGitBranch, hint: "Curricula by career: security, web, mobile, data, AI…" },
      { label: "RNCP", href: "/rncp", icon: FiAward, hint: "Title blocks, plan and projected level" },
      { label: "Projects", href: "/projects", icon: FiLayers, hint: "Every advanced project, live status" },
    ],
  },
  {
    title: "Campus",
    items: [
      { label: "Leaderboard", href: "/leaderboard", icon: FiBarChart2, hint: "Sort your campus by level, points, wallet…" },
      { label: "Rank", href: "/progress", icon: FiActivity, hint: "Podium by campus and pool" },
      { label: "Alumni", href: "/alumni", icon: PiGraduationCap, hint: "Your campus alumni ranked — promo, year and where your level places you" },
      { label: "Campus moves", href: "/moves", icon: PiArrowsLeftRight, hint: "Who switched campus — who came here, who left, from where and when" },
      { label: "Clusters", href: "/clusters", icon: FiMap, hint: "Who's sitting where, live" },
      { label: "Peer finder", href: "/peerfinder", icon: FiUsers, hint: "Peers on your projects" },
    ],
  },
  {
    title: "Tools",
    items: [
      { label: "Calculator", href: "/calculator", icon: FiCpu, hint: "Level after a project" },
      { label: "Eval sheets", href: "/evals", icon: FiClipboard, hint: "Every evaluation sheet (from 42evalhub) — tick each point before you book a correction" },
    ],
  },
];

export const pageOf = (path: string): NavItem =>
  NAV.flatMap((g) => g.items).find((i) => i.href === path)
  ?? { label: "37 Companion", href: path, icon: FiBookOpen, hint: "" };
