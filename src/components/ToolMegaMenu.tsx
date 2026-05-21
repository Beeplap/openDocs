"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import type { ToolSectionId } from "../lib/siteRoutes";
import { getRoute, toolNavGroups } from "../lib/siteRoutes";

const sectionTone = {
  scan: "bg-blue-600",
  organize: "bg-violet-600",
  convert: "bg-emerald-600",
  edit: "bg-cyan-600",
  secure: "bg-rose-600",
};

export default function ToolMegaMenu() {
  const pathname = usePathname();
  const activeGroup = useMemo(
    () => toolNavGroups.find((group) => group.items.some((path) => pathname === path)) ?? toolNavGroups[0],
    [pathname]
  );
  const [openGroupId, setOpenGroupId] = useState<ToolSectionId | null>(null);
  const openGroup = toolNavGroups.find((group) => group.id === openGroupId) ?? null;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-16 flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between">
          <Link href="/" className="text-lg font-semibold tracking-tight text-slate-950">
            Opendocs
          </Link>

          <nav
            className="relative flex flex-wrap gap-1.5"
            aria-label="Document tools"
            onMouseLeave={() => setOpenGroupId(null)}
          >
            {toolNavGroups.map((group) => {
              const active = activeGroup.id === group.id;
              const expanded = openGroup?.id === group.id;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setOpenGroupId(group.id)}
                  onMouseEnter={() => setOpenGroupId(group.id)}
                  aria-expanded={expanded}
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                    active || expanded
                      ? "bg-slate-950 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                >
                  {group.label}
                </button>
              );
            })}

            {openGroup ? (
            <div className="absolute right-0 top-[calc(100%+10px)] hidden w-[min(920px,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-4 shadow-xl lg:block">
              <div className="mb-3 flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{openGroup.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{openGroup.description}</p>
                </div>
                <Link
                  href={openGroup.items[0]}
                  className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                >
                  Open section
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {openGroup.items.map((path) => {
                  const route = getRoute(path);
                  if (!route) return null;
                  const current = pathname === route.path;
                  return (
                    <Link
                      key={route.path}
                      href={route.path}
                      className={`group flex min-h-16 items-center gap-3 rounded-md border px-3 py-2 transition ${
                        current
                          ? "border-blue-200 bg-blue-50 text-blue-800"
                          : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white ${
                          sectionTone[openGroup.id]
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
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{route.title}</span>
                        <span className="mt-0.5 line-clamp-1 block text-xs text-slate-500">{route.description}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
            ) : null}
          </nav>
        </div>

        <div className="grid gap-2 pb-3 lg:hidden">
          {toolNavGroups.map((group) => {
            const expanded = group.id === openGroup?.id;
            return (
              <div key={group.id} className="rounded-lg border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setOpenGroupId(group.id)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-slate-800"
                  aria-expanded={expanded}
                >
                  {group.label}
                  <span className="text-xs text-slate-400">{expanded ? "Hide" : "Show"}</span>
                </button>
                {expanded ? (
                  <div className="grid gap-1 border-t border-slate-100 p-2">
                    {group.items.map((path) => {
                      const route = getRoute(path);
                      if (!route) return null;
                      return (
                        <Link
                          key={route.path}
                          href={route.path}
                          className={`rounded-md px-3 py-2 text-sm font-medium ${
                            pathname === route.path
                              ? "bg-blue-50 text-blue-700"
                              : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                          }`}
                        >
                          {route.title}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </header>
  );
}
