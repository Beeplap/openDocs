"use client";

import type { AdvancedAnnotation } from "./types";

export type Tool = "select" | "text" | "highlight" | "signature" | "watermark";

type Props = {
  activeTool: Tool;
  setActiveTool: (t: Tool) => void;
  onRotatePage: (dir: 1 | -1) => void;
  onDeletePage: () => void;
  onAddPageNumbers: () => void;
  onDownload: () => void;
  onUpload: () => void;
  isExporting: boolean;
  hasPages: boolean;
  pageCount: number;
  currentPage: number;
  annotations: AdvancedAnnotation[];
  onDeleteAnnotation: (id: string) => void;
  selectedAnnotationId: string | null;
};

const tools: { id: Tool; label: string; icon: string }[] = [
  { id: "select", label: "Select", icon: "👆" },
  { id: "text", label: "Add Text", icon: "T" },
  { id: "highlight", label: "Highlight", icon: "🖍" },
  { id: "signature", label: "Signature", icon: "✍️" },
  { id: "watermark", label: "Watermark", icon: "💧" },
];

export default function AdvancedToolbar({
  activeTool, setActiveTool, onRotatePage, onDeletePage,
  onAddPageNumbers, onDownload, onUpload, isExporting,
  hasPages, pageCount, currentPage, annotations, onDeleteAnnotation, selectedAnnotationId,
}: Props) {
  const pageAnnotations = annotations.filter((a) => a.pageIndex === currentPage);

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      {/* Upload */}
      <button type="button" onClick={onUpload}
        className="w-full rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700 hover:bg-violet-100 transition">
        {hasPages ? "Upload New PDF" : "Upload PDF to Edit"}
      </button>

      {hasPages && (
        <>
          {/* Tools */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">Tools</p>
            <div className="grid grid-cols-2 gap-1.5">
              {tools.map((t) => (
                <button key={t.id} type="button" onClick={() => setActiveTool(t.id)}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    activeTool === t.id
                      ? "bg-violet-100 text-violet-800 ring-1 ring-violet-300"
                      : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200"
                  }`}>
                  <span className="text-base">{t.icon}</span> {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Page actions */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">Page Actions</p>
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" onClick={() => onRotatePage(-1)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
                ↶ Rotate Left
              </button>
              <button type="button" onClick={() => onRotatePage(1)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
                ↷ Rotate Right
              </button>
              <button type="button" onClick={onDeletePage} disabled={pageCount <= 1}
                className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 transition">
                🗑 Delete Page
              </button>
              <button type="button" onClick={onAddPageNumbers}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
                # Page Numbers
              </button>
            </div>
          </div>

          {/* Annotations list */}
          {pageAnnotations.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">
                Annotations ({pageAnnotations.length})
              </p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {pageAnnotations.map((a) => (
                  <div key={a.id}
                    className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-xs ${
                      selectedAnnotationId === a.id ? "bg-violet-100 text-violet-800" : "bg-slate-50 text-slate-600"
                    }`}>
                    <span className="capitalize">{a.kind}</span>
                    <button type="button" onClick={() => onDeleteAnnotation(a.id)}
                      className="text-red-400 hover:text-red-600 transition">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Download */}
          <button type="button" onClick={onDownload} disabled={isExporting}
            className="w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50 transition">
            {isExporting ? "Exporting..." : "Download PDF"}
          </button>
        </>
      )}
    </div>
  );
}
