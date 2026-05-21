"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
const COMPACT_DRAWER_WIDTH = 560;

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
      mode === "all" ? Math.min(1120, window.innerWidth - 32) : Math.min(COMPACT_DRAWER_WIDTH, window.innerWidth - 32);
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
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div
        ref={navWrapRef}
        className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"
        onMouseEnter={clearCloseTimer}
        onMouseLeave={scheduleClose}
      >
        <div className="flex min-h-16 flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between">
          <Link href="/" className="text-lg font-semibold tracking-tight text-slate-950">
            Opendocs
          </Link>

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
              className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${
                drawerMode === "all" ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
              }`}
            >
              <span className="grid grid-cols-3 gap-0.5" aria-hidden="true">
                {Array.from({ length: 9 }).map((_, index) => (
                  <span key={index} className="h-1.5 w-1.5 rounded-[2px] bg-current" />
                ))}
              </span>
              All Tools
              <span className={`text-xs transition ${drawerMode === "all" ? "rotate-180" : ""}`} aria-hidden="true">
                ^
              </span>
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
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                    active || expanded ? "text-blue-700" : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {drawerGroups.length > 0 ? (
          <div
            className={`absolute top-full z-50 max-h-[calc(100vh-5rem)] overflow-auto rounded-b-lg border border-t-0 border-slate-200 bg-white px-5 py-5 shadow-2xl ${
              drawerMode === "all" ? "w-[min(1120px,calc(100vw-2rem))]" : "w-[min(560px,calc(100vw-2rem))]"
            }`}
            style={{ left: drawerAnchor?.left ?? 16 }}
          >
            <div className={`grid gap-x-8 gap-y-6 ${drawerMode === "all" ? "sm:grid-cols-2 lg:grid-cols-5" : "grid-cols-2"}`}>
              {drawerGroups.map((group) => (
                <section key={group.id} aria-labelledby={`tool-group-${group.id}`} className={drawerMode === "all" ? "" : "col-span-2"}>
                  <h2 id={`tool-group-${group.id}`} className="mb-3 text-sm font-semibold text-slate-500">
                    {group.label}
                  </h2>
                  <div className={`grid gap-2 ${drawerMode === "all" ? "" : "grid-cols-2"}`}>
                    {group.items.map((path) => {
                      const route = getRoute(path);
                      if (!route) return null;
                      const current = pathname === route.path;
                      return (
                        <Link
                          key={route.path}
                          href={route.path}
                          onClick={() => setDrawerMode(null)}
                          className={`tool-link relative flex items-center gap-3 rounded-md px-2.5 py-2 transition ${
                            current ? "bg-blue-50 text-blue-700" : "text-slate-800 hover:bg-slate-50"
                          }`}
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
                          <span className="min-w-0 truncate text-sm font-medium">{route.title}</span>
                          <span className="tool-tooltip pointer-events-none absolute left-10 top-[calc(100%+6px)] z-[60] hidden w-64 rounded-md bg-slate-950 px-3 py-2 text-center text-xs font-medium leading-5 text-white shadow-lg">
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
