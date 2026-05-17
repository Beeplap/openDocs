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
  canUndo?: boolean;
  canRedo?: boolean;
  undo?: () => void;
  redo?: () => void;
  onUpdateAnnotation?: (id: string, updates: Partial<AdvancedAnnotation>) => void;
};

const tools: { id: Tool; label: string; icon: string }[] = [
  { id: "select", label: "Select", icon: "👆" },
  { id: "text", label: "Add Text", icon: "T" },
  { id: "highlight", label: "Highlight", icon: "🖍" },
  { id: "signature", label: "Signature", icon: "✍️" },
  { id: "watermark", label: "Watermark", icon: "💧" },
];

const fontOptions = [
  { label: "Sans", value: "Arial, Helvetica, sans-serif" },
  { label: "Serif", value: "Georgia, Times New Roman, serif" },
  { label: "Mono", value: "Courier New, Courier, monospace" },
  { label: "Rounded", value: "Trebuchet MS, Arial, sans-serif" },
  { label: "Display", value: "Verdana, Geneva, sans-serif" },
];

export default function AdvancedToolbar({
  activeTool, setActiveTool, onRotatePage, onDeletePage,
  onAddPageNumbers, onDownload, onUpload, isExporting,
  hasPages, pageCount, annotations, onDeleteAnnotation, selectedAnnotationId,
  canUndo, canRedo, undo, redo, onUpdateAnnotation
}: Props) {
  const selectedAnn = annotations.find((a) => a.id === selectedAnnotationId);

  if (!hasPages) {
    return (
      <div className="flex items-center justify-center p-3">
        <button type="button" onClick={onUpload}
          className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition">
          Upload PDF
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-16 items-center justify-center border-b border-blue-100 bg-slate-50/95 px-3 py-2">
      <div className="flex max-w-full items-center overflow-x-auto rounded-sm border border-blue-200 bg-white text-slate-900 shadow-[0_2px_8px_rgba(37,99,235,0.2)]">
        <div className="flex items-center">
          {tools.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTool(t.id)}
              title={t.label}
              className={`flex h-10 min-w-10 items-center justify-center border-r border-slate-200 px-3 text-sm font-semibold transition ${
                activeTool === t.id ? "bg-blue-50 text-blue-600" : "bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {t.id === "text" ? "T" : t.icon}
            </button>
          ))}
        </div>

        <div className="flex items-center border-r border-slate-200">
          <button type="button" onClick={undo} disabled={!canUndo} title="Undo"
            className="flex h-10 w-10 items-center justify-center text-sm text-slate-700 hover:bg-slate-50 disabled:text-slate-300">
            ↶
          </button>
          <button type="button" onClick={redo} disabled={!canRedo} title="Redo"
            className="flex h-10 w-10 items-center justify-center text-sm text-slate-700 hover:bg-slate-50 disabled:text-slate-300">
            ↷
          </button>
        </div>

        <div className="flex items-center border-r border-slate-200">
          <button type="button" onClick={() => onRotatePage(-1)} title="Rotate left"
            className="flex h-10 w-10 items-center justify-center text-sm text-slate-700 hover:bg-slate-50">
            ↶
          </button>
          <button type="button" onClick={() => onRotatePage(1)} title="Rotate right"
            className="flex h-10 w-10 items-center justify-center text-sm text-slate-700 hover:bg-slate-50">
            ↷
          </button>
          <button type="button" onClick={onDeletePage} disabled={pageCount <= 1} title="Delete page"
            className="flex h-10 w-10 items-center justify-center text-sm text-red-600 hover:bg-red-50 disabled:text-slate-300">
            🗑
          </button>
          <button type="button" onClick={onAddPageNumbers} title="Page numbers"
            className="flex h-10 min-w-10 items-center justify-center px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            #
          </button>
        </div>

        {selectedAnn && selectedAnn.kind === "text" && onUpdateAnnotation && (
          <div className="flex items-center">
                <select
                  value={selectedAnn.fontFamily || fontOptions[0].value}
                  onChange={(e) => onUpdateAnnotation(selectedAnn.id, { fontFamily: e.target.value })}
              className="h-10 min-w-48 border-r border-slate-200 bg-white px-4 text-center text-sm outline-none"
                  aria-label="Font family"
                >
                  {fontOptions.map((font) => (
                    <option key={font.value} value={font.value}>
                      {font.label}
                    </option>
                  ))}
                </select>
            <input type="number" min="8" max="120" value={selectedAnn.fontSize || 16}
                  onChange={(e) => onUpdateAnnotation(selectedAnn.id, { fontSize: parseInt(e.target.value) || 16 })}
              className="h-10 w-16 border-r border-slate-200 bg-white px-2 text-center text-sm outline-none" />
            <label className="flex h-10 w-14 items-center justify-center border-r border-slate-200">
              <span className="h-5 w-5 rounded-full border border-slate-200" style={{ backgroundColor: selectedAnn.color || "#1e293b" }} />
              <input type="color" value={selectedAnn.color || "#1e293b"}
                  onChange={(e) => onUpdateAnnotation(selectedAnn.id, { color: e.target.value })}
                className="sr-only" />
            </label>
            <button type="button" onClick={() => onUpdateAnnotation(selectedAnn.id, { bold: !selectedAnn.bold })}
              className={`flex h-10 w-12 items-center justify-center border-r border-slate-200 text-lg font-bold ${selectedAnn.bold ? "bg-blue-50 text-blue-600" : "hover:bg-slate-50"}`}>
              B
            </button>
            <button type="button" onClick={() => onUpdateAnnotation(selectedAnn.id, { italic: !selectedAnn.italic })}
              className={`flex h-10 w-12 items-center justify-center border-r border-slate-200 font-serif text-lg italic ${selectedAnn.italic ? "bg-blue-50 text-blue-600" : "hover:bg-slate-50"}`}>
              I
            </button>
          </div>
        )}

        {selectedAnn && selectedAnn.kind === "signature" && onUpdateAnnotation && (
          <div className="flex items-center">
            <label className="flex h-10 w-14 items-center justify-center border-r border-slate-200">
              <span className="h-5 w-5 rounded-full border border-slate-200" style={{ backgroundColor: selectedAnn.color || "#1a1a2e" }} />
              <input type="color" value={selectedAnn.color || "#1a1a2e"}
                onChange={(e) => onUpdateAnnotation(selectedAnn.id, { color: e.target.value })}
                className="sr-only" />
            </label>
            <input
              type="number"
              min={1}
              max={12}
              step={0.5}
              value={selectedAnn.strokeWidth || 3}
              onChange={(e) => onUpdateAnnotation(selectedAnn.id, { strokeWidth: parseFloat(e.target.value) || 3 })}
              className="h-10 w-16 border-r border-slate-200 bg-white px-2 text-center text-sm outline-none"
              aria-label="Signature line size"
            />
          </div>
        )}

        {selectedAnnotationId && (
          <button type="button" onClick={() => onDeleteAnnotation(selectedAnnotationId)}
            className="flex h-10 w-10 items-center justify-center border-r border-slate-200 text-red-600 hover:bg-red-50"
            title="Delete annotation">
            🗑
          </button>
        )}

        <button type="button" onClick={onUpload}
          className="flex h-10 items-center justify-center border-r border-slate-200 px-4 text-sm font-semibold text-blue-600 hover:bg-blue-50">
          Add
        </button>
        <button type="button" onClick={onDownload} disabled={isExporting}
          className="flex h-10 items-center justify-center px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:text-slate-300">
          {isExporting ? "Exporting" : "Download"}
        </button>
      </div>
    </div>
  );
}
