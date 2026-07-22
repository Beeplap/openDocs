"use client";

import React from "react";
import { usePasteFile } from "../../hooks/usePasteFile";
import PageLayoutSelector from "./PageLayoutSelector";
import { EditIcon, HandIcon, TrashIcon, UploadIcon } from "./icons";
import type { MergeMode, ScanItem } from "./types";

type Props = {
  items: ScanItem[];
  isProcessing: boolean;
  mergeMode?: MergeMode;
  setMergeMode?: (mode: MergeMode) => void;
  onAddPages: (files?: FileList | null) => void;
  onMergePdfs: () => void | Promise<void>;
  onRemoveItem: (id: string) => void;
  onMoveItem: (id: string, direction: -1 | 1) => void;
  onReorderItem: (id: string, overId: string) => void;
  startCropForOne: (id: string) => void;
};

const IMAGE_OR_PDF_PATTERN = /\.(avif|bmp|gif|heic|heif|jpe?g|pdf|png|svg|tiff?|webp)$/i;

function isValidPageFile(file: File) {
  return file.type === "application/pdf" || file.type.startsWith("image/") || IMAGE_OR_PDF_PATTERN.test(file.name);
}

export default function PdfMergePanel({
  items,
  isProcessing,
  mergeMode = "single",
  setMergeMode,
  onAddPages,
  onMergePdfs,
  onRemoveItem,
  onMoveItem,
  onReorderItem,
  startCropForOne,
}: Props) {
  const dragPdfIdRef = React.useRef<string | null>(null);
  const [draggingPdfId, setDraggingPdfId] = React.useState<string | null>(null);
  const [dragOverPdfId, setDragOverPdfId] = React.useState<string | null>(null);

  usePasteFile((_files, fileList) => {
    if (isProcessing) return;
    onAddPages(fileList);
  }, isProcessing);

  function startDrag(id: string, e: React.PointerEvent<HTMLElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragPdfIdRef.current = id;
    setDraggingPdfId(id);
    setDragOverPdfId(id);
  }

  function moveDrag(e: React.PointerEvent<HTMLElement>) {
    const draggedId = dragPdfIdRef.current;
    if (!draggedId) return;

    e.preventDefault();
    e.stopPropagation();

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const overCard = target?.closest<HTMLElement>("[data-merge-pdf-card='true']");
    const overId = overCard?.dataset.mergePdfId;
    if (!overId || overId === draggedId) return;

    setDragOverPdfId(overId);
    onReorderItem(draggedId, overId);
  }

  function endDrag(e: React.PointerEvent<HTMLElement>) {
    if (!dragPdfIdRef.current) return;

    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragPdfIdRef.current = null;
    setDraggingPdfId(null);
    setDragOverPdfId(null);
  }

  function handleDesktopCardPointerDown(id: string, e: React.PointerEvent<HTMLElement>) {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;

    startDrag(id, e);
  }

  function handleDrop(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (isProcessing) return;
    onAddPages(e.dataTransfer.files);
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="panel p-5">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Merge PDFs & Scans</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onAddPages()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <UploadIcon />
              Add page
            </button>
          </div>
        </div>

        <div className="mt-4">
          {items.length === 0 ? (
            <button
              type="button"
              onClick={() => onAddPages()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="flex min-h-72 w-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center transition hover:border-slate-400 hover:bg-white"
            >
              <span className="text-base font-semibold text-slate-950">Drop or choose PDFs or images</span>
              <span className="mt-1 text-sm font-medium text-slate-400">Ctrl + V works too</span>
              <span className="mt-2 text-sm text-slate-500">
                Add PDFs or images to crop, edit, reorder, and merge into a clean document.
              </span>
            </button>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item, index) => (
                <article
                  key={item.id}
                  data-merge-pdf-card="true"
                  data-merge-pdf-id={item.id}
                  onPointerDown={(e) => handleDesktopCardPointerDown(item.id, e)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${
                    dragOverPdfId === item.id ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200"
                  } ${draggingPdfId === item.id ? "opacity-75 sm:cursor-grabbing" : "sm:cursor-grab"}`}
                >
                  <div className="relative bg-slate-100">
                    {/* Page Number Badge */}
                    <div className="absolute left-2.5 top-2.5 z-10 flex h-7 min-w-7 items-center justify-center rounded-lg bg-slate-950/90 px-2 text-xs font-bold text-white shadow-md">
                      {index + 1}
                    </div>

                    {/* Top-Right Pencil Edit/Crop Button */}
                    <button
                      type="button"
                      onClick={() => startCropForOne(item.id)}
                      className="absolute right-2.5 top-2.5 z-10 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white/95 text-slate-800 shadow-md backdrop-blur transition hover:bg-slate-100 hover:scale-105"
                      title="Crop & Edit page"
                      aria-label={`Crop page ${index + 1}`}
                    >
                      <EditIcon />
                    </button>

                    <img
                      src={item.previewUrl}
                      alt={item.name}
                      className="aspect-3/4 w-full bg-white object-cover"
                    />
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-slate-950">{item.name}</h3>
                      <p className="mt-0.5 text-xs font-medium text-slate-500">
                        {item.kind === "pdf-page" ? "PDF Page" : item.kind === "camera" ? "Camera Scan" : "Imported Image"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onMoveItem(item.id, -1)}
                        disabled={index === 0}
                        className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        onClick={() => onMoveItem(item.id, 1)}
                        disabled={index === items.length - 1}
                        className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveItem(item.id)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-700 transition hover:bg-rose-100"
                        title="Remove page"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      <aside className="panel h-fit p-5">
        <p className="text-base font-semibold text-slate-950">Output</p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-slate-500">Pages</p>
            <p className="mt-1 text-xl font-semibold text-slate-950">{items.length}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-slate-500">Layout Mode</p>
            <p className="mt-1 text-xs font-bold text-slate-950 uppercase">
              {mergeMode === "firstTwoUp" ? "First 2-up" : mergeMode === "twoUp" ? "2-up All" : "1-up"}
            </p>
          </div>
        </div>

        {setMergeMode && (
          <div className="mt-4 border-t border-slate-200 pt-4">
            <PageLayoutSelector value={mergeMode} onChange={setMergeMode} />
          </div>
        )}

        <button
          type="button"
          onClick={() => void onMergePdfs()}
          disabled={items.length < 1 || isProcessing}
          className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {isProcessing ? "Building PDF..." : "Merge PDFs"}
        </button>
      </aside>
    </section>
  );
}
