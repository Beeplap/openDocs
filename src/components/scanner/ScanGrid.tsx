"use client";

import React, { useLayoutEffect, useRef } from "react";
import { usePasteFile } from "../../hooks/usePasteFile";
import { EditIcon, HandIcon, TrashIcon, UploadIcon } from "./icons";
import type { MergeMode, ScanItem } from "./types";

type Props = {
  items: ScanItem[];
  displayItems: ScanItem[];
  pdfOrderIds: string[];
  mergeMode: MergeMode;
  draggingPdfId: string | null;
  dragOverPdfId: string | null;
  onReorderHandlePointerDown: (id: string, e: React.PointerEvent<HTMLElement>) => void;
  onReorderHandlePointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  onReorderHandlePointerEnd: (e: React.PointerEvent<HTMLElement>) => void;
  moveScanPage: (id: string, direction: -1 | 1) => void;
  startCropForOne: (id: string) => void;
  removeItem: (id: string) => void;
  onAddScans: (files?: FileList | null) => void;
  onAddPhotos: (files?: FileList | null) => void;
  isProcessing: boolean;
};

export default function ScanGrid({
  items,
  displayItems,
  pdfOrderIds,
  mergeMode,
  draggingPdfId,
  dragOverPdfId,
  onReorderHandlePointerDown,
  onReorderHandlePointerMove,
  onReorderHandlePointerEnd,
  moveScanPage,
  startCropForOne,
  removeItem,
  onAddScans,
  onAddPhotos,
  isProcessing,
}: Props) {
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const previousRectsRef = useRef(new Map<string, DOMRect>());
  const wasDraggingRef = useRef(false);
  const orderKey = displayItems.map((item) => item.id).join("|");

  usePasteFile((files, fileList) => {
    if (isProcessing) return;
    onAddScans(fileList);
  }, isProcessing);

  useLayoutEffect(() => {
    const previousRects = previousRectsRef.current;
    const nextRects = new Map<string, DOMRect>();
    const isDragging = draggingPdfId !== null;
    const shouldAnimate = !isDragging && wasDraggingRef.current;

    cardRefs.current.forEach((element, id) => {
      const nextRect = element.getBoundingClientRect();
      nextRects.set(id, nextRect);

      const previousRect = previousRects.get(id);
      if (!previousRect) return;
      if (!shouldAnimate) return;

      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;
      const travelDistance = Math.hypot(deltaX, deltaY);
      if (travelDistance > 260) return;

      element.getAnimations().forEach((animation) => animation.cancel());
      element.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: "translate(0, 0)" },
        ],
        {
          duration: Math.max(120, Math.min(220, travelDistance * 1.1)),
          easing: "cubic-bezier(0.2, 0, 0, 1)",
        }
      );
    });

    previousRectsRef.current = nextRects;
    wasDraggingRef.current = isDragging;
  }, [orderKey, draggingPdfId]);

  function setCardRef(id: string, element: HTMLElement | null) {
    if (element) {
      cardRefs.current.set(id, element);
    } else {
      cardRefs.current.delete(id);
    }
  }

  function handleDesktopCardPointerDown(itemId: string, selected: boolean, e: React.PointerEvent<HTMLElement>) {
    if (!selected) return;
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;

    onReorderHandlePointerDown(itemId, e);
  }

  function handleDrop(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (isProcessing) return;
    onAddScans(e.dataTransfer.files);
  }

  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Pages</h2>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <span className="text-sm font-semibold text-slate-500">{pdfOrderIds.length}/{items.length}</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onAddScans()}
                disabled={isProcessing}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <UploadIcon />
                Add page
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={`grid gap-4 p-4 sm:p-5 ${mergeMode === "twoUp" ? "grid-cols-2" : "grid-cols-1"} sm:grid-cols-2 2xl:grid-cols-3`}>
        {items.length === 0 ? (
          <button
            type="button"
            onClick={() => onAddScans()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            disabled={isProcessing}
            className="col-span-full flex min-h-[22rem] w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line bg-surface-strong px-6 py-12 text-center transition-all duration-300 hover:border-brand hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-surface text-brand shadow-sm ring-1 ring-line mb-4">
              <UploadIcon />
            </div>
            <h3 className="mt-4 text-xl font-bold text-foreground">No pages yet</h3>
            <span className="mt-2 text-sm text-muted">Drop or choose files.</span>
            <span className="mt-1 text-sm font-medium text-muted/60">Ctrl + V works too</span>
          </button>
        ) : (
          displayItems.map((item) => {
            const selected = pdfOrderIds.includes(item.id);
            const pdfIndex = pdfOrderIds.indexOf(item.id);
            return (
              <article
                key={item.id}
                ref={(element) => setCardRef(item.id, element)}
                onPointerDown={(e) => handleDesktopCardPointerDown(item.id, selected, e)}
                onPointerMove={onReorderHandlePointerMove}
                onPointerUp={onReorderHandlePointerEnd}
                onPointerCancel={onReorderHandlePointerEnd}
                className={`relative overflow-hidden rounded-2xl border bg-surface shadow-sm transition-all duration-300 ${
                  selected
                    ? mergeMode === "twoUp"
                      ? pdfIndex % 2 === 0
                        ? "border-emerald-400/50 shadow-[0_0_20px_rgba(16,185,129,0.15)]"
                        : "border-sky-400/50 shadow-[0_0_20px_rgba(56,189,248,0.15)]"
                      : "border-brand shadow-[0_0_20px_rgba(16,185,129,0.15)]"
                    : "border-line hover:shadow-md hover:-translate-y-1"
                } ${selected ? "sm:cursor-grab sm:active:cursor-grabbing" : ""} ${
                  draggingPdfId === item.id ? "z-10 opacity-90 shadow-2xl ring-2 ring-brand/50 scale-[1.02]" : "opacity-100"
                } ${dragOverPdfId === item.id ? "ring-2 ring-brand" : ""}`}
                style={selected && mergeMode === "twoUp" ? { boxShadow: "none" } : undefined}
                data-pdf-card="true"
                data-pdf-id={item.id}
                data-selected={selected ? "true" : "false"}
              >
                <div className="absolute left-3 top-3 z-30">
                  {selected ? (
                    <button
                      type="button"
                      aria-label="Drag to reorder image"
                      title="Drag to reorder"
                      className="grid h-10 w-10 place-items-center rounded-lg border border-white/20 bg-slate-950/90 text-white shadow-lg sm:hidden"
                      style={{
                        cursor: draggingPdfId === item.id ? "grabbing" : "grab",
                        opacity: draggingPdfId === item.id ? 0.95 : 0.9,
                        transform: draggingPdfId === item.id ? "scale(1.03)" : undefined,
                        touchAction: "none",
                      }}
                      onPointerDown={(e) => onReorderHandlePointerDown(item.id, e)}
                      onPointerMove={onReorderHandlePointerMove}
                      onPointerUp={onReorderHandlePointerEnd}
                      onPointerCancel={onReorderHandlePointerEnd}
                    >
                      <HandIcon />
                    </button>
                  ) : null}
                </div>
                <div className="block w-full">
                  <img src={item.previewUrl} alt={item.name} className="aspect-4/3 w-full object-cover" />
                </div>
                <div className="space-y-4 p-5">
                  <div>
                    <h3 className="truncate font-bold text-foreground text-[15px]">{item.name}</h3>
                    {selected && mergeMode === "twoUp" ? (
                      <div className="mt-2 flex items-center gap-2">
                        <span
                          className={`inline-flex rounded-md px-2.5 py-0.5 text-[11px] font-bold ${
                            pdfIndex % 2 === 0
                              ? "border border-emerald-200/50 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                              : "border border-sky-200/50 bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400"
                          }`}
                        >
                          {pdfIndex % 2 === 0 ? "Front" : "Back"}
                        </span>
                      </div>
                    ) : null}
                    <p className="mt-1 text-[10px] uppercase tracking-widest text-muted font-semibold">
                      {item.kind === "camera" ? "Camera Scan" : item.kind === "pdf-page" ? "PDF Page" : "Imported Image"}
                    </p>
                  </div>
                  <div className="grid grid-cols-[1fr_1fr_44px_44px] gap-2">
                    <button
                      type="button"
                      onClick={() => moveScanPage(item.id, -1)}
                      disabled={!selected || pdfIndex <= 0}
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-line bg-surface px-2 text-xs font-bold text-foreground transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label={`Move ${item.name} up`}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      onClick={() => moveScanPage(item.id, 1)}
                      disabled={!selected || pdfIndex === pdfOrderIds.length - 1}
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-line bg-surface px-2 text-xs font-bold text-foreground transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label={`Move ${item.name} down`}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      onClick={() => startCropForOne(item.id)}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20"
                      aria-label={`Edit ${item.name}`}
                      title="Edit image"
                    >
                      <EditIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600 transition-colors hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20"
                      aria-label={`Delete ${item.name}`}
                      title="Delete"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
