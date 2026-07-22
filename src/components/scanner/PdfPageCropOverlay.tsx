"use client";

import React, { useState, useRef } from "react";
import type { PageCrop } from "./types";

interface PdfPageCropOverlayProps {
  crop: PageCrop;
  pageWidth: number;
  pageHeight: number;
  onChangeCrop: (newCrop: PageCrop) => void;
}

export type AspectRatioPreset = "free" | "original" | "a4" | "letter" | "1:1" | "4:3" | "16:9";

export const ASPECT_RATIOS: { id: AspectRatioPreset; label: string }[] = [
  { id: "free", label: "Freeform" },
  { id: "original", label: "Original Ratio" },
  { id: "a4", label: "A4 (1:1.414)" },
  { id: "letter", label: "Letter (8.5:11)" },
  { id: "1:1", label: "Square (1:1)" },
  { id: "4:3", label: "Standard (4:3)" },
  { id: "16:9", label: "Widescreen (16:9)" },
];

export interface PdfCropControlBarProps {
  pageWidth: number;
  pageHeight: number;
  onChangeCrop: (newCrop: PageCrop) => void;
  onApplyCrop: () => void;
  onApplyToAll: () => void;
  onResetCrop: () => void;
  onCancel: () => void;
}

export function PdfCropControlBar({
  pageWidth,
  pageHeight,
  onChangeCrop,
  onApplyCrop,
  onApplyToAll,
  onResetCrop,
  onCancel,
}: PdfCropControlBarProps) {
  const [selectedPreset, setSelectedPreset] = useState<AspectRatioPreset>("free");

  const applyPreset = (preset: AspectRatioPreset) => {
    setSelectedPreset(preset);
    if (preset === "free") return;

    let targetRatio = 1;
    if (preset === "original") targetRatio = pageWidth / pageHeight;
    else if (preset === "a4") targetRatio = 595.28 / 841.89;
    else if (preset === "letter") targetRatio = 8.5 / 11;
    else if (preset === "1:1") targetRatio = 1;
    else if (preset === "4:3") targetRatio = 4 / 3;
    else if (preset === "16:9") targetRatio = 16 / 9;

    const pageRatio = pageWidth / pageHeight;
    const desiredCropRatio = targetRatio / pageRatio;

    let wFrac = 0.9;
    let hFrac = wFrac / desiredCropRatio;
    if (hFrac > 0.9) {
      hFrac = 0.9;
      wFrac = hFrac * desiredCropRatio;
    }

    const left = Math.max(0, (1 - wFrac) / 2);
    const right = Math.max(0, (1 - wFrac) / 2);
    const top = Math.max(0, (1 - hFrac) / 2);
    const bottom = Math.max(0, (1 - hFrac) / 2);

    onChangeCrop({ top, right, bottom, left });
  };

  return (
    <div className="z-20 flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 bg-slate-50/95 px-4 py-2 text-slate-800 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Crop Ratio:</span>
        <select
          value={selectedPreset}
          onChange={(e) => applyPreset(e.target.value as AspectRatioPreset)}
          className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:bg-slate-50 focus:ring-2 focus:ring-blue-500"
          aria-label="Aspect Ratio Preset"
        >
          {ASPECT_RATIOS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setSelectedPreset("free");
            onResetCrop();
          }}
          className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 hover:text-slate-900"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onApplyCrop}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:ring-2 focus:ring-blue-500"
        >
          Apply Crop
        </button>
        <button
          type="button"
          onClick={onApplyToAll}
          className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-1.5 text-xs font-semibold text-blue-700 shadow-sm transition hover:bg-blue-100 hover:text-blue-800"
        >
          Apply to All
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-500 shadow-sm transition hover:bg-slate-100 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function PdfPageCropOverlay({
  crop,
  pageWidth,
  pageHeight,
  onChangeCrop,
}: PdfPageCropOverlayProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    handle: string;
    startX: number;
    startY: number;
    initialCrop: PageCrop;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const startHandleDrag = (handle: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}

    setIsDragging(true);
    dragRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      initialCrop: { ...crop },
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dx = (e.clientX - dragRef.current.startX) / rect.width;
    const dy = (e.clientY - dragRef.current.startY) / rect.height;

    const { handle, initialCrop } = dragRef.current;
    let { top, right, bottom, left } = initialCrop;
    const MIN_DIM = 0.05; // 5% minimum dimension constraint

    if (handle.includes("n") || handle === "top") {
      top = Math.min(Math.max(0, initialCrop.top + dy), 1 - initialCrop.bottom - MIN_DIM);
    }
    if (handle.includes("s") || handle === "bottom") {
      bottom = Math.min(Math.max(0, initialCrop.bottom - dy), 1 - initialCrop.top - MIN_DIM);
    }
    if (handle.includes("w") || handle === "left") {
      left = Math.min(Math.max(0, initialCrop.left + dx), 1 - initialCrop.right - MIN_DIM);
    }
    if (handle.includes("e") || handle === "right") {
      right = Math.min(Math.max(0, initialCrop.right - dx), 1 - initialCrop.left - MIN_DIM);
    }

    onChangeCrop({ top, right, bottom, left });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      dragRef.current = null;
      setIsDragging(false);
    }
  };

  // Convert crop percentages to CSS dimensions
  const cropLeftPct = crop.left * 100;
  const cropTopPct = crop.top * 100;
  const cropRightPct = crop.right * 100;
  const cropBottomPct = crop.bottom * 100;
  const cropWidthPct = Math.max(0, (1 - crop.left - crop.right) * 100);
  const cropHeightPct = Math.max(0, (1 - crop.top - crop.bottom) * 100);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-30 select-none touch-none"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* 4 Darkened Mask Panels */}
      <div className="absolute left-0 top-0 right-0 bg-slate-950/60 pointer-events-none" style={{ height: `${cropTopPct}%` }} />
      <div className="absolute left-0 bottom-0 right-0 bg-slate-950/60 pointer-events-none" style={{ height: `${cropBottomPct}%` }} />
      <div
        className="absolute left-0 bg-slate-950/60 pointer-events-none"
        style={{ top: `${cropTopPct}%`, bottom: `${cropBottomPct}%`, width: `${cropLeftPct}%` }}
      />
      <div
        className="absolute right-0 bg-slate-950/60 pointer-events-none"
        style={{ top: `${cropTopPct}%`, bottom: `${cropBottomPct}%`, width: `${cropRightPct}%` }}
      />

      {/* High-Contrast Active Crop Box */}
      <div
        className="absolute border-2 border-blue-600 shadow-[0_0_0_1px_rgba(255,255,255,0.6),0_0_15px_rgba(37,99,235,0.35)]"
        style={{
          left: `${cropLeftPct}%`,
          top: `${cropTopPct}%`,
          width: `${cropWidthPct}%`,
          height: `${cropHeightPct}%`,
        }}
      >
        {/* Rule of Thirds Grid Lines (Active while dragging) */}
        {isDragging && (
          <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3">
            <div className="border-r border-b border-white/30" />
            <div className="border-r border-b border-white/30" />
            <div className="border-b border-white/30" />
            <div className="border-r border-b border-white/30" />
            <div className="border-r border-b border-white/30" />
            <div className="border-b border-white/30" />
            <div className="border-r border-white/30" />
            <div className="border-r border-white/30" />
            <div />
          </div>
        )}

        {/* 8 Drag Handles */}
        {[
          { id: "nw", pos: "-left-2.5 -top-2.5 cursor-nwse-resize" },
          { id: "top", pos: "left-1/2 -top-2.5 -translate-x-1/2 cursor-ns-resize" },
          { id: "ne", pos: "-right-2.5 -top-2.5 cursor-nesw-resize" },
          { id: "right", pos: "-right-2.5 top-1/2 -translate-y-1/2 cursor-ew-resize" },
          { id: "se", pos: "-right-2.5 -bottom-2.5 cursor-nwse-resize" },
          { id: "bottom", pos: "left-1/2 -bottom-2.5 -translate-x-1/2 cursor-ns-resize" },
          { id: "sw", pos: "-left-2.5 -bottom-2.5 cursor-nesw-resize" },
          { id: "left", pos: "-left-2.5 top-1/2 -translate-y-1/2 cursor-ew-resize" },
        ].map((h) => (
          <div
            key={h.id}
            onPointerDown={(e) => startHandleDrag(h.id, e)}
            className={`absolute z-40 flex h-11 w-11 items-center justify-center ${h.pos}`}
          >
            <div className="h-4 w-4 rounded-full border-2 border-white bg-blue-600 shadow-md ring-2 ring-blue-500/50 transition hover:scale-125" />
          </div>
        ))}
      </div>
    </div>
  );
}
