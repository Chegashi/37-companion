"use client";
import React, { useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FiChevronsLeft, FiChevronsRight, FiLogOut, FiMenu, FiMoon, FiSun, FiX } from "react-icons/fi";
import { Navbar } from "@/component/navbar/navbar";
import { ContextCreator } from "@/component/context/context";
import type { ContextProps } from "@/component/context/context.types";
import { useTheme } from "@/component/context/ThemeContext";
import { useStoredState } from "@/component/tracker/useTracker";
import { NAV, pageOf } from "./nav";
import { avatarFallback, avatarSrc } from "@/utils/avatar";

// Sidebar: drag its edge to resize, or collapse it to an icon rail (⌘/Ctrl + B). Saved per browser.
const SIDEBAR_DEFAULT = 244, SIDEBAR_MIN = 200, SIDEBAR_MAX = 360, SIDEBAR_RAIL = 72;
const clampWidth = (w: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(w)));

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--c-accent)" />
      <path d="M9 11.5 16 8l7 3.5-7 3.5z" fill="var(--c-on-accent)" />
      <path d="M11.5 13v4c0 1.6 9 1.6 9 0v-4l-4.5 2.2z" fill="var(--c-on-accent)" opacity=".85" />
      <text x="16" y="27" textAnchor="middle" fontSize="7.5" fontWeight="800" fill="var(--c-on-accent)" fontFamily="var(--font-mono)">c37</text>
    </svg>
  );
}

function UserCard() {
  const ctx = useContext(ContextCreator) as ContextProps | null;
  const user = ctx?.userData;
  const router = useRouter();
  const level = user?.level ?? 0;
  const logout = async () => {
    await fetch("/api/logout").catch(() => {});
    ctx?.setUserData(null);
    router.push("/");
  };
  return (
    <div className="c-usercard">
      {user?.image
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={avatarSrc(user.image)} onError={avatarFallback} alt="" className="c-avatar" />
        : <div className="c-avatar c-skeleton" />}
      <div className="c-usercard-body">
        <div className="c-usercard-row">
          <b>{user?.login ?? "…"}</b>
          <button className="c-icon-btn" onClick={logout} aria-label="Log out" title="Log out"><FiLogOut /></button>
        </div>
        <div className="c-level"><span>lvl {level.toFixed(2)}</span><i style={{ width: `${(level % 1) * 100}%` }} /></div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const { darkMode, toggleDarkMode } = useTheme();
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useStoredState<number>("37c-sidebar-width", SIDEBAR_DEFAULT);
  const [collapsed, setCollapsed] = useStoredState<boolean>("37c-sidebar-collapsed", false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") { e.preventDefault(); setCollapsed((c) => !c); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCollapsed]);

  // Drag the edge: narrower than the minimum collapses to the rail, wider expands again.
  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX, startW = collapsed ? SIDEBAR_RAIL : width;
    const move = (ev: PointerEvent) => {
      const w = startW + ev.clientX - startX;
      // Collapsing keeps the width you had before the drag, so expanding brings it back.
      if (w < SIDEBAR_MIN - 50) { setCollapsed(true); setWidth(width); }
      else { setCollapsed(false); setWidth(clampWidth(w)); }
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      document.body.classList.remove("c-resizing");
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    document.body.classList.add("c-resizing");
  };
  const onResizeKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const step = e.key === "ArrowRight" ? 16 : -16;
      if (collapsed && step > 0) { setCollapsed(false); return; }
      const w = width + step;
      if (w < SIDEBAR_MIN) setCollapsed(true); else setWidth(clampWidth(w));
    }
  };

  // The landing page renders standalone (no sidebar/navbar, no auth chrome).
  if (pathname === "/") return <>{children}</>;
  const page = pageOf(pathname);

  return (
    <div className={`c-app ${collapsed ? "c-app--rail" : ""}`} style={{ "--sb-w": `${collapsed ? SIDEBAR_RAIL : width}px` } as React.CSSProperties}>
      <aside className={`c-sidebar ${open ? "c-sidebar--open" : ""}`}>
        <div className="c-brand">
          <Link href="/dashboard" className="c-brand-link" title="37 Companion"><Logo /><span>37<em>Companion</em></span></Link>
          <button className="c-icon-btn c-only-mobile" onClick={() => setOpen(false)} aria-label="Close menu"><FiX /></button>
          <button className="c-icon-btn c-only-desktop c-collapse-btn" onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={`${collapsed ? "Expand" : "Collapse"} sidebar (⌘/Ctrl + B)`}>
            {collapsed ? <FiChevronsRight /> : <FiChevronsLeft />}
          </button>
        </div>
        <nav className="c-nav" aria-label="Main">
          {NAV.map((group) => (
            <div key={group.title} className="c-nav-group">
              <p>{group.title}</p>
              {group.items.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} className="c-nav-item" aria-current={pathname === href ? "page" : undefined} title={collapsed ? label : undefined}>
                  <Icon /><span>{label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <UserCard />
        <div className="c-resizer c-only-desktop" role="separator" aria-orientation="vertical" aria-label="Resize sidebar"
          aria-valuemin={SIDEBAR_MIN} aria-valuemax={SIDEBAR_MAX} aria-valuenow={collapsed ? SIDEBAR_RAIL : width} tabIndex={0}
          title="Drag to resize · double-click to reset" onPointerDown={startResize} onKeyDown={onResizeKey}
          onDoubleClick={() => { setCollapsed(false); setWidth(SIDEBAR_DEFAULT); }} />
      </aside>
      {open && <div className="c-scrim" onClick={() => setOpen(false)} />}
      <div className="c-main">
        <header className="c-topbar">
          <button className="c-icon-btn c-only-mobile" onClick={() => setOpen(true)} aria-label="Open menu"><FiMenu /></button>
          <div className="c-title">
            <h1>{page.label}</h1>
            {page.hint && <span>{page.hint}</span>}
          </div>
          <div className="c-topbar-actions">
            <Navbar compact />
            <button className="c-icon-btn" onClick={toggleDarkMode} aria-label={darkMode ? "Light mode" : "Dark mode"} title={darkMode ? "Light mode" : "Dark mode"}>
              {darkMode ? <FiSun /> : <FiMoon />}
            </button>
          </div>
        </header>
        <main className="c-content">{children}</main>
      </div>
    </div>
  );
}
