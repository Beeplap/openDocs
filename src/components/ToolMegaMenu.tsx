"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { getRoute, toolNavGroups } from "../lib/siteRoutes";

const sectionTone = {
  scan: "bg-blue-600",
  organize: "bg-violet-600",
  convert: "bg-emerald-600",
  edit: "bg-cyan-600",
  secure: "bg-rose-600",
};

const primaryNav = [
  { label: "Compress", href: "/convert/compress-pdf" },
  { label: "Convert", href: "/convert" },
  { label: "Merge", href: "/merge-pdfs" },
  { label: "Edit", href: "/pdf-editor" },
  { label: "Sign", href: "/pdf-editor/add-signature" },
  { label: "Secure", href: "/pdf-editor/protect" },
];

export default function ToolMegaMenu() {
  const pathname = usePathname();
  const [allToolsOpen, setAllToolsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-16 flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between">
          <Link href="/" className="text-lg font-semibold tracking-tight text-slate-950">
            Opendocs
          </Link>

          <nav className="flex flex-wrap items-center gap-1.5" aria-label="Document tools">
            <button
              type="button"
              onClick={() => setAllToolsOpen((current) => !current)}
              aria-expanded={allToolsOpen}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${
                allToolsOpen ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
              }`}
            >
              <span className="grid grid-cols-3 gap-0.5" aria-hidden="true">
                {Array.from({ length: 9 }).map((_, index) => (
                  <span key={index} className="h-1.5 w-1.5 rounded-[2px] bg-current" />
                ))}
              </span>
              All Tools
              <span className={`text-xs transition ${allToolsOpen ? "rotate-180" : ""}`} aria-hidden="true">
                ^
              </span>
            </button>

            {primaryNav.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setAllToolsOpen(false)}
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                    active ? "text-blue-700" : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {allToolsOpen ? (
          <div className="absolute left-4 right-4 top-full z-50 max-h-[calc(100vh-5rem)] overflow-auto rounded-b-lg border border-t-0 border-slate-200 bg-white px-5 py-5 shadow-2xl sm:left-6 sm:right-6 lg:left-8 lg:right-8">
            <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-5">
              {toolNavGroups.map((group) => (
                <section key={group.id} aria-labelledby={`tool-group-${group.id}`}>
                  <h2 id={`tool-group-${group.id}`} className="mb-3 text-sm font-semibold text-slate-500">
                    {group.label}
                  </h2>
                  <div className="grid gap-2">
                    {group.items.map((path) => {
                      const route = getRoute(path);
                      if (!route) return null;
                      const current = pathname === route.path;
                      return (
                        <Link
                          key={route.path}
                          href={route.path}
                          onClick={() => setAllToolsOpen(false)}
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
