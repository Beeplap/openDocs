"use client";

import React from "react";
import type { MergeMode } from "./types";

type Props = {
  value: MergeMode;
  onChange: (mode: MergeMode) => void;
  className?: string;
};

type LayoutOption = {
  id: MergeMode;
  label: string;
  badge: string;
  description: string;
  icon: React.ReactNode;
};

const OPTIONS: LayoutOption[] = [
  {
    id: "single",
    label: "1 per Page",
    badge: "1-Up",
    description: "Standard full page layout. 1 page per sheet.",
    icon: (
      <svg className="h-7 w-5 text-slate-600" viewBox="0 0 20 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="18" height="26" rx="2" fill="white" stroke="currentColor" strokeWidth="1.5" />
        <rect x="3.5" y="3.5" width="13" height="21" rx="1" fill="#E2E8F0" stroke="#CBD5E1" strokeWidth="1" />
      </svg>
    ),
  },
  {
    id: "firstTwoUp",
    label: "ID Card Hybrid",
    badge: "2-Up + 1-Up",
    description: "First 2 pages on Sheet 1 (ID Front & Back), then 1 page per sheet.",
    icon: (
      <svg className="h-7 w-5 text-slate-600" viewBox="0 0 20 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="18" height="26" rx="2" fill="white" stroke="currentColor" strokeWidth="1.5" />
        <rect x="3.5" y="3.5" width="13" height="9.5" rx="1" fill="#10B981" fillOpacity="0.2" stroke="#10B981" strokeWidth="1" />
        <rect x="3.5" y="15" width="13" height="9.5" rx="1" fill="#10B981" fillOpacity="0.2" stroke="#10B981" strokeWidth="1" />
      </svg>
    ),
  },
  {
    id: "twoUp",
    label: "2 per Page",
    badge: "2-Up All",
    description: "Combines every 2 pages vertically on single A4 sheets.",
    icon: (
      <svg className="h-7 w-5 text-slate-600" viewBox="0 0 20 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="18" height="26" rx="2" fill="white" stroke="currentColor" strokeWidth="1.5" />
        <rect x="3.5" y="3.5" width="13" height="9.5" rx="1" fill="#3B82F6" fillOpacity="0.2" stroke="#3B82F6" strokeWidth="1" />
        <rect x="3.5" y="15" width="13" height="9.5" rx="1" fill="#3B82F6" fillOpacity="0.2" stroke="#3B82F6" strokeWidth="1" />
      </svg>
    ),
  },
  {
    id: "fourUp",
    label: "4 per Page",
    badge: "4-Up Grid",
    description: "Combines 4 pages into a 2x2 grid on a single A4 sheet.",
    icon: (
      <svg className="h-7 w-5 text-slate-600" viewBox="0 0 20 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="18" height="26" rx="2" fill="white" stroke="currentColor" strokeWidth="1.5" />
        <rect x="3" y="3.5" width="6" height="9.5" rx="0.5" fill="#8B5CF6" fillOpacity="0.2" stroke="#8B5CF6" strokeWidth="0.8" />
        <rect x="11" y="3.5" width="6" height="9.5" rx="0.5" fill="#8B5CF6" fillOpacity="0.2" stroke="#8B5CF6" strokeWidth="0.8" />
        <rect x="3" y="15" width="6" height="9.5" rx="0.5" fill="#8B5CF6" fillOpacity="0.2" stroke="#8B5CF6" strokeWidth="0.8" />
        <rect x="11" y="15" width="6" height="9.5" rx="0.5" fill="#8B5CF6" fillOpacity="0.2" stroke="#8B5CF6" strokeWidth="0.8" />
      </svg>
    ),
  },
  {
    id: "sixUp",
    label: "6 per Page",
    badge: "6-Up Grid",
    description: "Combines 6 pages into a 2x3 grid on a single A4 sheet.",
    icon: (
      <svg className="h-7 w-5 text-slate-600" viewBox="0 0 20 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="18" height="26" rx="2" fill="white" stroke="currentColor" strokeWidth="1.5" />
        <rect x="3" y="3" width="6" height="6" rx="0.5" fill="#F59E0B" fillOpacity="0.2" stroke="#F59E0B" strokeWidth="0.8" />
        <rect x="11" y="3" width="6" height="6" rx="0.5" fill="#F59E0B" fillOpacity="0.2" stroke="#F59E0B" strokeWidth="0.8" />
        <rect x="3" y="11" width="6" height="6" rx="0.5" fill="#F59E0B" fillOpacity="0.2" stroke="#F59E0B" strokeWidth="0.8" />
        <rect x="11" y="11" width="6" height="6" rx="0.5" fill="#F59E0B" fillOpacity="0.2" stroke="#F59E0B" strokeWidth="0.8" />
        <rect x="3" y="19" width="6" height="6" rx="0.5" fill="#F59E0B" fillOpacity="0.2" stroke="#F59E0B" strokeWidth="0.8" />
        <rect x="11" y="19" width="6" height="6" rx="0.5" fill="#F59E0B" fillOpacity="0.2" stroke="#F59E0B" strokeWidth="0.8" />
      </svg>
    ),
  },
];

export default function PageLayoutSelector({ value, onChange, className = "" }: Props) {
  const activeOption = OPTIONS.find((opt) => opt.id === value) || OPTIONS[0];

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-slate-900">Page Arrangement</label>
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
          {activeOption.badge}
        </span>
      </div>

      {/* Grid of Visual Layout Cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {OPTIONS.map((option) => {
          const isSelected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              className={`relative flex flex-col items-center justify-between rounded-xl border p-3 text-left transition-all ${
                isSelected
                  ? "border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/20 shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {/* Top Diagram & Badge */}
              <div className="flex w-full items-start justify-between">
                <div className={`rounded-lg p-1 ${isSelected ? "bg-white shadow-xs" : "bg-slate-50"}`}>
                  {option.icon}
                </div>
                {isSelected && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
              </div>

              {/* Label */}
              <div className="mt-2.5 w-full">
                <p className={`text-xs font-bold ${isSelected ? "text-emerald-950" : "text-slate-800"}`}>
                  {option.label}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600 border border-slate-100">
        💡 <strong className="text-slate-800">{activeOption.label}:</strong> {activeOption.description}
      </p>
    </div>
  );
}
