"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ThemeToggle from "./ThemeToggle";
import type { ToolNavGroup, ToolSectionId } from "../lib/siteRoutes";
import { getRoute, toolNavGroups } from "../lib/siteRoutes";

const sectionTone = {
  scan: "bg-blue-600",
  organize: "bg-violet-600",
  convert: "bg-emerald-600",
  edit: "bg-cyan-600",
  secure: "bg-rose-600",
};

const primaryNav = [
  { label: "Convert & Compress", href: "/convert", activePrefix: "/convert", drawer: "convert" },
  { label: "Merge", href: "/merge-pdfs", drawer: "organize" },
  { label: "Edit", href: "/pdf-editor", drawer: "edit" },
  { label: "Sign", href: "/pdf-editor/add-signature", drawer: "sign" },
  { label: "Secure", href: "/pdf-editor/protect", drawer: "secure" },
];

type DrawerMode = "all" | ToolSectionId | "sign" | null;
type DrawerAnchor = { left: number } | null;
const ALL_DRAWER_WIDTH = 1360;
const WIDE_COMPACT_DRAWER_WIDTH = 640;

const signGroup: ToolNavGroup = {
  id: "edit",
  label: "Sign",
  description: "Add signature tools to PDF files.",
  items: ["/pdf-editor/add-signature"],
};

export default function ToolMegaMenu() {
  const pathname = usePathname();
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [drawerAnchor, setDrawerAnchor] = useState<DrawerAnchor>(null);
  const navWrapRef = useRef<HTMLDivElement>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawerGroups =
    drawerMode === "all"
      ? toolNavGroups
      : drawerMode === "sign"
        ? [signGroup]
        : toolNavGroups.filter((group) => group.id === drawerMode);

  function clearOpenTimer() {
    if (!openTimerRef.current) return;
    clearTimeout(openTimerRef.current);
    openTimerRef.current = null;
  }

  function clearCloseTimer() {
    if (!closeTimerRef.current) return;
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }

  function updateAnchor(node: HTMLElement | null, mode: Exclude<DrawerMode, null>) {
    const wrap = navWrapRef.current;
    if (!wrap || !node) return;
    const wrapRect = wrap.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const panelWidth =
      mode === "all" ? Math.min(ALL_DRAWER_WIDTH, window.innerWidth - 32) : Math.min(WIDE_COMPACT_DRAWER_WIDTH, window.innerWidth - 32);
    const centeredLeft = nodeRect.left - wrapRect.left + nodeRect.width / 2 - panelWidth / 2;
    const maxLeft = Math.max(16, wrapRect.width - panelWidth - 16);
    setDrawerAnchor({ left: Math.min(Math.max(16, centeredLeft), maxLeft) });
  }

  function startHoverOpen(mode: Exclude<DrawerMode, null>, node: HTMLElement | null) {
    clearCloseTimer();
    clearOpenTimer();
    updateAnchor(node, mode);
    openTimerRef.current = setTimeout(() => {
      updateAnchor(node, mode);
      setDrawerMode(mode);
      openTimerRef.current = null;
    }, 1000);
  }

  function toggleDrawer(mode: Exclude<DrawerMode, null>, node: HTMLElement | null) {
    clearOpenTimer();
    clearCloseTimer();
    updateAnchor(node, mode);
    setDrawerMode((current) => (current === mode ? null : mode));
  }

  function scheduleClose() {
    clearOpenTimer();
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setDrawerMode(null);
      setDrawerAnchor(null);
      closeTimerRef.current = null;
    }, 180);
  }

  useEffect(() => {
    return () => {
      clearOpenTimer();
      clearCloseTimer();
    };
  }, []);

  return (
    <header className="site-header sticky top-0 z-40 border-b backdrop-blur">
      <div
        ref={navWrapRef}
        className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"
        onMouseEnter={clearCloseTimer}
        onMouseLeave={scheduleClose}
      >
        <div className="flex min-h-16 flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between">
          <Link href="/" className="site-brand text-lg font-semibold tracking-tight">
            Opendocs
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <nav className="flex flex-wrap items-center gap-1.5" aria-label="Document tools">
              <button
                type="button"
                onClick={(event) => toggleDrawer("all", event.currentTarget)}
                onMouseEnter={(event) => startHoverOpen("all", event.currentTarget)}
                onMouseLeave={clearOpenTimer}
                onPointerEnter={(event) => startHoverOpen("all", event.currentTarget)}
                onPointerLeave={clearOpenTimer}
                onFocus={(event) => startHoverOpen("all", event.currentTarget)}
                onBlur={clearOpenTimer}
                aria-expanded={drawerMode === "all"}
                data-active={drawerMode === "all"}
                className="site-nav-item inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition"
              >
                <span className="grid grid-cols-3 gap-0.5" aria-hidden="true">
                  {Array.from({ length: 9 }).map((_, index) => (
                    <span key={index} className="h-1.5 w-1.5 rounded-[2px] bg-current" />
                  ))}
                </span>
                All Tools
                <ChevronDownIcon className={`h-3.5 w-3.5 transition ${drawerMode === "all" ? "rotate-180" : ""}`} />
              </button>

              {primaryNav.map((item) => {
                const active = item.activePrefix ? pathname.startsWith(item.activePrefix) : pathname === item.href;
                const expanded = drawerMode === item.drawer;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setDrawerMode(null)}
                    onMouseEnter={(event) => startHoverOpen(item.drawer as Exclude<DrawerMode, null>, event.currentTarget)}
                    onMouseLeave={clearOpenTimer}
                    onPointerEnter={(event) => startHoverOpen(item.drawer as Exclude<DrawerMode, null>, event.currentTarget)}
                    onPointerLeave={clearOpenTimer}
                    onFocus={(event) => startHoverOpen(item.drawer as Exclude<DrawerMode, null>, event.currentTarget)}
                    onBlur={clearOpenTimer}
                    data-active={active || expanded}
                    className="site-nav-item rounded-md px-3 py-2 text-sm font-semibold transition"
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <ThemeToggle />
          </div>
        </div>

        {drawerGroups.length > 0 ? (
          <div
            className={`mega-drawer absolute top-full z-50 max-h-[calc(100vh-5rem)] overflow-auto rounded-b-lg border border-t-0 px-5 py-5 shadow-2xl ${
              drawerMode === "all" ? "w-[min(1360px,calc(100vw-2rem))]" : "w-[min(640px,calc(100vw-2rem))]"
            }`}
            style={{ left: drawerAnchor?.left ?? 16 }}
          >
            <div className={`grid gap-x-8 gap-y-6 ${drawerMode === "all" ? "sm:grid-cols-2 lg:grid-cols-5" : "grid-cols-2"}`}>
              {drawerGroups.map((group) => (
                <section key={group.id} aria-labelledby={`tool-group-${group.id}`} className={`min-w-0 ${drawerMode === "all" ? "" : "col-span-2"}`}>
                  <h2 id={`tool-group-${group.id}`} className="drawer-heading mb-3 text-sm font-semibold">
                    {group.label}
                  </h2>
                  <div className={`grid min-w-0 gap-2 ${drawerMode === "all" ? "" : "grid-cols-2"}`}>
                    {group.items.map((path) => {
                      const route = getRoute(path);
                      if (!route) return null;
                      const current = pathname === route.path;
                      return (
                        <Link
                          key={route.path}
                          href={route.path}
                          onClick={() => setDrawerMode(null)}
                          data-active={current}
                          className="tool-link drawer-link relative flex h-12 w-full items-center gap-3 rounded-md px-2.5 transition"
                        >
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white ${
                              sectionTone[group.id]
                            }`}
                            aria-hidden="true"
                          >
                            {route.title
                              .split(" ")
                              .slice(0, 2)
                              .map((word) => word[0])
                              .join("")
                              .toUpperCase()}
                          </span>
                          <span className="tool-link-label text-sm font-medium">{route.title}</span>
                          <span className="tool-tooltip pointer-events-none absolute left-1/2 top-[calc(100%+6px)] z-[60] hidden w-72 -translate-x-1/2 rounded-md px-3 py-2 text-center text-xs font-medium leading-5 shadow-lg">
                            {route.description}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
