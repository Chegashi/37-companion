"use client";
import React from "react";
import { Buttons } from "./navbar.buttons";
import { PathsObject } from "./navbar.types";
import { motion } from "motion/react";
import { CiMenuFries } from "./navbar.imports";
import Skeleton from "@mui/material/Skeleton";
import { useRouter } from "next/navigation";
import { ContextCreator } from "../context/context";
import { ContextProps } from "../context/context.types";
import { XPIcon } from "../xp/XPIcon";
import { avatarFallback, avatarSrc } from "@/utils/avatar";


const DropDownMenu = () => {
  const [isOpen, setIsOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <motion.div
      ref={buttonRef}
      className="w-8 cursor-pointer items-center relative justify-center flex lg:hidden h-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      exit={{ opacity: 0 }}
    >
      <button
        aria-label="Navigation menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className="w-8 h-8 flex items-center justify-center border-2 theme-border bg-[var(--theme-bg-card)]
          hover:bg-[var(--theme-bg)] hover:border-[var(--theme-border-strong)] transition-all duration-150 active:translate-y-0.5 "
        style={{ fontFamily: "var(--font-ui)" }}
      >
        <CiMenuFries className="theme-text text-xl" />
      </button>
      {isOpen && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute right-0 top-12 z-[110] border-2 theme-border bg-[#ece9d8] p-2 flex flex-col gap-1 "
          style={{
            fontFamily: "var(--font-ui)",
            boxShadow: "none",
          }}
        >
          {PathsObject.map((path, index) => (
            <Buttons
              key={index}
              icon={path.icon}
              title={path.title}
              route={path.route}
            />
          ))}
        </motion.div>
      )}
    </motion.div>
  );
};

const Paths = () => {
  return (
    <div className="flex-1 hidden lg:flex h-full gap-2 items-center justify-center">
      {PathsObject.map((path, index) => (
        <Buttons
          key={index}
          icon={path.icon}
          title={path.title}
          route={path.route}
        />
      ))}
    </div>
  );
};

const Navbar = ({ compact = false }: { compact?: boolean }) => {
  const router = useRouter();
  const { setUserData, userData }: ContextProps = React.useContext(
    ContextCreator
  ) as ContextProps;
  const Logout = async () => {
    const response = await fetch("/api/logout", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) return;
    setUserData(null);
    router.push("/");
  };

  const DataToFetch = async () => {
    try {
      const response = await fetch("/api/who", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!response.ok) {
        if (response.status === 401) Logout();
        return;
      }
      const data = await response.json();
      setUserData(data);
    } catch (err) {
      console.error("Failed to fetch user data", err);
    }
  };

  React.useEffect(() => {
    DataToFetch();
  }, []);

  return (
    <nav
      className={compact ? "relative z-[100] flex items-center" : "xp-navbar relative w-full h-14 shrink-0 z-[100] flex items-center justify-between px-4 sm:px-6 border-b-4 theme-border-strong bg-[#ece9d8]"}
      style={{
        fontFamily: "var(--font-ui)",
        boxShadow: "none",
      }}
    >
      {/* Nav links */}
      <div className="flex items-center justify-between w-full h-full gap-2 sm:gap-3 md:gap-4">
        {!compact && <Paths />}

        {!compact && <button className="xp-home-button" aria-label="My dashboard" onClick={() => router.push("/dashboard")}><XPIcon name="computer" size={24} /></button>}
        {/* Logout */}
        {!compact && <button
          aria-label="Log out"
          onClick={Logout}
          className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center border-2 theme-border
            bg-[var(--theme-bg-card)] hover:bg-[var(--theme-bg)] hover:border-[var(--theme-border-strong)]
            transition-all duration-150 active:translate-y-0.5 "
        >
          <XPIcon name="logout" size={22} />
        </button>}

        {/* Online indicator */}
        {!compact && <div className="hidden sm:flex items-center gap-1.5">
          <div className="w-2 h-2 bg-green-600" />
          <span className="text-[9px] theme-text-muted uppercase tracking-wider">
            Online
          </span>
        </div>

        }
        {/* User Avatar */}
        {!compact && <>
        <div
          onClick={() => router.push("/dashboard")}
          className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center border-2 theme-border
            bg-[var(--theme-bg-card)] cursor-pointer hover:border-[var(--theme-border-strong)]
            transition-all duration-150 active:translate-y-0.5 "
        >
          {userData == null ? (
            <Skeleton
              animation={false}
              sx={{ bgcolor: "var(--theme-primary-dark)", m: 0, p: 0 }}
              variant="rectangular"
              width="100%"
              height="100%"
            />
          ) : (
            <img
              src={avatarSrc(userData.image)}
              onError={avatarFallback}
              alt="User Avatar"
              width={40}
              height={40}
              className="w-full h-full object-cover"
              style={{ imageRendering: "pixelated" }}
            />
          )}
        </div>

        <DropDownMenu />
        </>}
      </div>

    </nav>
  );
};

export { Navbar };
