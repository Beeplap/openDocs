"use client";

import type { ReactElement, ReactNode } from "react";
import type { AdvancedAnnotation } from "./types";

export type Tool = "pan" | "select" | "text" | "draw" | "signature" | "watermark";
export type DrawMode = "pen" | "highlighter" | "eraser";
export type DrawSettings = {
  penColor: string;
  penSize: number;
  highlighterColor: string;
  highlighterOpacity: number;
  eraserSize: number;
};

type Props = {
  activeTool: Tool;
  setActiveTool: (t: Tool) => void;
  drawMode: DrawMode;
  setDrawMode: (m: DrawMode) => void;
  drawSettings: DrawSettings;
  setDrawSettings: (settings: DrawSettings) => void;
  onRotatePage: (dir: 1 | -1) => void;
  onDeletePage: () => void;
  onAddPageNumbers: () => void;
  onDownload: () => void;
  onUnlockPdf: () => void;
  onProtectPdf: () => void;
  onFlattenPdf: () => void;
  protectEnabled: boolean;
  flattenEnabled: boolean;
  onUpload: () => void;
  onNewPdf: () => void;
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

type IconProps = { className?: string };

const fontOptions = [
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Roboto", value: "Roboto, Arial, Helvetica, sans-serif" },
  { label: "Poppins", value: "Poppins, Arial, Helvetica, sans-serif" },
  { label: "Times New Roman", value: "Times New Roman, Times, serif" },
  { label: "Calibri", value: "Calibri, Arial, Helvetica, sans-serif" },
  { label: "Montserrat", value: "Montserrat, Arial, Helvetica, sans-serif" },
];

const tools: { id: Tool; label: string; icon: (props: IconProps) => ReactElement }[] = [
  { id: "pan", label: "Pan (P)", icon: HandIcon },
  { id: "select", label: "Select (Esc)", icon: CursorIcon },
  { id: "text", label: "Add text", icon: TextIcon },
  { id: "draw", label: "Draw", icon: PencilIcon },
  { id: "signature", label: "Signature", icon: SignatureIcon },
  { id: "watermark", label: "Watermark", icon: DropIcon },
];

const drawModes: { id: DrawMode; label: string; icon: (props: IconProps) => ReactElement }[] = [
  { id: "pen", label: "Pen", icon: PencilIcon },
  { id: "highlighter", label: "Highlighter", icon: HighlighterIcon },
  { id: "eraser", label: "Eraser", icon: EraserIcon },
];

export default function AdvancedToolbar({
  activeTool,
  setActiveTool,
  drawMode,
  setDrawMode,
  drawSettings,
  setDrawSettings,
  onRotatePage,
  onDeletePage,
  onAddPageNumbers,
  onDownload,
  onUnlockPdf,
  onProtectPdf,
  onFlattenPdf,
  protectEnabled,
  flattenEnabled,
  onUpload,
  onNewPdf,
  isExporting,
  hasPages,
  pageCount,
  annotations,
  onDeleteAnnotation,
  selectedAnnotationId,
  canUndo,
  canRedo,
  undo,
  redo,
  onUpdateAnnotation,
}: Props) {
  const selectedAnn = annotations.find((a) => a.id === selectedAnnotationId);
  const hasWatermark = annotations.some((a) => a.kind === "watermark");
  const updateDrawSettings = (updates: Partial<DrawSettings>) => setDrawSettings({ ...drawSettings, ...updates });
  const drawColor = drawMode === "highlighter" ? drawSettings.highlighterColor : drawSettings.penColor;
  const drawRangeValue =
    drawMode === "eraser"
      ? drawSettings.eraserSize
      : drawMode === "highlighter"
        ? Math.round(drawSettings.highlighterOpacity * 100)
        : drawSettings.penSize;

  if (!hasPages) {
    return (
      <div className="flex items-center justify-center p-3">
        <button
          type="button"
          onClick={onUpload}
          className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Upload PDF
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-16 items-center justify-start border-b border-blue-100 bg-slate-50/95 px-3 py-2 md:justify-center">
      <div className="flex w-full max-w-full items-center gap-1 overflow-x-auto overscroll-x-contain rounded-lg border border-blue-200 bg-white p-1 text-slate-900 shadow-[0_2px_10px_rgba(37,99,235,0.16)] [scrollbar-width:thin] md:w-auto">
        <div className="flex shrink-0 items-center overflow-hidden rounded-md border border-slate-200">
          {tools.map((tool) => (
            <ToolbarButton
              key={tool.id}
              active={tool.id === "watermark" ? hasWatermark : activeTool === tool.id}
              title={tool.id === "watermark" && hasWatermark ? "Remove watermark" : tool.label}
              onClick={() => setActiveTool(tool.id)}
              icon={tool.icon}
            />
          ))}
        </div>

        {activeTool === "draw" && (
          <div className="flex shrink-0 items-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">
            {drawModes.map((mode) => (
              <ToolbarButton
                key={mode.id}
                active={drawMode === mode.id}
                title={mode.label}
                onClick={() => setDrawMode(mode.id)}
                icon={mode.icon}
              />
            ))}
            {drawMode !== "eraser" && (
              <ColorInput
                value={drawColor}
                onChange={(color) =>
                  updateDrawSettings(drawMode === "highlighter" ? { highlighterColor: color } : { penColor: color })
                }
                label={drawMode === "highlighter" ? "Highlighter color" : "Pen color"}
              />
            )}
            <label className="flex h-10 shrink-0 items-center gap-2 border-r border-slate-200 px-3" title={drawMode === "highlighter" ? "Highlighter opacity" : drawMode === "eraser" ? "Eraser size" : "Pen size"}>
              <input
                type="range"
                min={drawMode === "highlighter" ? 10 : drawMode === "eraser" ? 8 : 1}
                max={drawMode === "highlighter" ? 80 : drawMode === "eraser" ? 72 : 16}
                step={drawMode === "highlighter" ? 5 : 1}
                value={drawRangeValue}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (drawMode === "eraser") updateDrawSettings({ eraserSize: value });
                  else if (drawMode === "highlighter") updateDrawSettings({ highlighterOpacity: value / 100 });
                  else updateDrawSettings({ penSize: value });
                }}
                className="h-2 w-24 accent-blue-600"
                aria-label={drawMode === "highlighter" ? "Highlighter opacity" : drawMode === "eraser" ? "Eraser size" : "Pen size"}
              />
              <span className="w-8 text-right text-xs font-semibold text-slate-500">{drawRangeValue}</span>
            </label>
          </div>
        )}

        <div className="flex shrink-0 items-center overflow-hidden rounded-md border border-slate-200">
          <IconButton onClick={undo} disabled={!canUndo} title="Undo" icon={UndoIcon} />
          <IconButton onClick={redo} disabled={!canRedo} title="Redo" icon={RedoIcon} />
        </div>

        <div className="flex shrink-0 items-center overflow-hidden rounded-md border border-slate-200">
          <IconButton onClick={() => onRotatePage(-1)} title="Rotate page left" icon={PageRotateLeftIcon} />
          <IconButton onClick={() => onRotatePage(1)} title="Rotate page right" icon={PageRotateRightIcon} />
          <IconButton onClick={onDeletePage} disabled={pageCount <= 1} title="Delete page" icon={TrashIcon} danger />
          <button
            type="button"
            onClick={onAddPageNumbers}
            title="Page numbers"
            className="flex h-10 min-w-10 shrink-0 items-center justify-center px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            #
          </button>
        </div>

        {selectedAnn && selectedAnn.kind === "text" && onUpdateAnnotation && (
          <div className="flex shrink-0 items-center">
            <select
              value={selectedAnn.fontFamily || fontOptions[0].value}
              onChange={(e) => onUpdateAnnotation(selectedAnn.id, { fontFamily: e.target.value })}
              className="h-10 min-w-48 shrink-0 border-r border-slate-200 bg-white px-4 text-center text-sm outline-none"
              aria-label="Font family"
            >
              {fontOptions.map((font) => (
                <option key={font.value} value={font.value}>
                  {font.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="8"
              max="120"
              value={selectedAnn.fontSize || 16}
              onChange={(e) => onUpdateAnnotation(selectedAnn.id, { fontSize: parseInt(e.target.value) || 16 })}
              className="h-10 w-16 shrink-0 border-r border-slate-200 bg-white px-2 text-center text-sm outline-none"
              aria-label="Font size"
            />
            <ColorInput
              value={selectedAnn.color || "#1e293b"}
              onChange={(color) => onUpdateAnnotation(selectedAnn.id, { color })}
              label="Text color"
            />
            <button
              type="button"
              onClick={() => onUpdateAnnotation(selectedAnn.id, { bold: !selectedAnn.bold })}
              className={`flex h-10 w-12 shrink-0 items-center justify-center border-r border-slate-200 text-lg font-bold ${
                selectedAnn.bold ? "bg-blue-50 text-blue-600" : "hover:bg-slate-50"
              }`}
            >
              B
            </button>
            <button
              type="button"
              onClick={() => onUpdateAnnotation(selectedAnn.id, { italic: !selectedAnn.italic })}
              className={`flex h-10 w-12 shrink-0 items-center justify-center border-r border-slate-200 font-serif text-lg italic ${
                selectedAnn.italic ? "bg-blue-50 text-blue-600" : "hover:bg-slate-50"
              }`}
            >
              I
            </button>
          </div>
        )}

        {selectedAnn && selectedAnn.kind === "signature" && onUpdateAnnotation && (
          <div className="flex shrink-0 items-center">
            <ColorInput
              value={selectedAnn.color || "#1a1a2e"}
              onChange={(color) => onUpdateAnnotation(selectedAnn.id, { color })}
              label="Signature color"
            />
            <input
              type="number"
              min={1}
              max={12}
              step={0.5}
              value={selectedAnn.strokeWidth || 3}
              onChange={(e) => onUpdateAnnotation(selectedAnn.id, { strokeWidth: parseFloat(e.target.value) || 3 })}
              className="h-10 w-16 shrink-0 border-r border-slate-200 bg-white px-2 text-center text-sm outline-none"
              aria-label="Signature line size"
            />
          </div>
        )}

        {selectedAnnotationId && (
          <IconButton
            onClick={() => onDeleteAnnotation(selectedAnnotationId)}
            title="Delete annotation"
            icon={TrashIcon}
            danger
          />
        )}

        <div className="flex shrink-0 items-center overflow-hidden rounded-md border border-slate-200">
          <button
            type="button"
            onClick={onNewPdf}
            title="Start a new PDF"
            className="flex h-10 shrink-0 items-center justify-center whitespace-nowrap border-r border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            New PDF
          </button>
          <button
            type="button"
            onClick={onUnlockPdf}
            title="Remove password protection"
            className="flex h-10 shrink-0 items-center justify-center whitespace-nowrap border-r border-slate-200 px-3 text-sm font-semibold text-rose-600 hover:bg-rose-50"
          >
            Unlock
          </button>
          <button
            type="button"
            onClick={onProtectPdf}
            disabled={!hasPages || isExporting}
            title="Encrypt PDF on download"
            className={`flex h-10 shrink-0 items-center justify-center whitespace-nowrap border-r border-slate-200 px-3 text-sm font-semibold disabled:text-slate-300 ${
              protectEnabled ? "bg-rose-50 text-rose-700" : "text-slate-700 hover:bg-slate-50"
            }`}
          >
            Protect
          </button>
          <button
            type="button"
            onClick={onFlattenPdf}
            disabled={!hasPages || isExporting}
            title="Make PDF uneditable"
            className={`flex h-10 shrink-0 items-center justify-center whitespace-nowrap border-r border-slate-200 px-3 text-sm font-semibold disabled:text-slate-300 ${
              flattenEnabled ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"
            }`}
          >
            Flatten
          </button>
          <button
            type="button"
            onClick={onUpload}
            className="flex h-10 shrink-0 items-center justify-center whitespace-nowrap border-r border-slate-200 px-4 text-sm font-semibold text-blue-600 hover:bg-blue-50"
          >
            Add
          </button>
          <button
            type="button"
            onClick={onDownload}
            disabled={isExporting}
            className="flex h-10 shrink-0 items-center justify-center whitespace-nowrap px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:text-slate-300"
          >
            {isExporting ? "Exporting" : "Download"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({
  active,
  title,
  onClick,
  icon: Icon,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  icon: (props: IconProps) => ReactElement;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex h-10 min-w-10 shrink-0 items-center justify-center border-r border-slate-200 px-3 transition last:border-r-0 ${
        active ? "bg-blue-100 text-blue-700" : "bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

function IconButton({
  onClick,
  disabled,
  title,
  icon: Icon,
  danger = false,
}: {
  onClick?: () => void;
  disabled?: boolean;
  title: string;
  icon: (props: IconProps) => ReactElement;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex h-10 w-10 shrink-0 items-center justify-center border-r border-slate-200 last:border-r-0 hover:bg-slate-50 disabled:text-slate-300 ${
        danger ? "text-red-600 hover:bg-red-50" : "text-slate-700"
      }`}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

function ColorInput({ value, onChange, label }: { value: string; onChange: (color: string) => void; label: string }) {
  return (
    <label className="flex h-10 w-14 shrink-0 items-center justify-center border-r border-slate-200" title={label}>
      <span className="h-5 w-5 rounded-full border border-slate-200" style={{ backgroundColor: value }} />
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="sr-only" />
    </label>
  );
}

function SvgRoot({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function HandIcon(props: IconProps) {
  return (
    <SvgRoot {...props}>
      <path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M14 11V6.5a1.5 1.5 0 0 1 3 0V13" />
      <path d="M17 13v-1.5a1.5 1.5 0 0 1 3 0v3.2c0 4-2.6 6.3-6.4 6.3h-2.2a6 6 0 0 1-5-2.7L4 14.8a1.7 1.7 0 0 1 2.8-1.9L8 14.4" />
    </SvgRoot>
  );
}

function CursorIcon(props: IconProps) {
  return (
    <SvgRoot {...props}>
      <path d="M5 3l14 7-6 2.2L10.8 18 5 3z" fill="currentColor" stroke="none" />
    </SvgRoot>
  );
}

function TextIcon(props: IconProps) {
  return (
    <SvgRoot {...props}>
      <path d="M5 6h14" />
      <path d="M12 6v12" />
      <path d="M9 18h6" />
    </SvgRoot>
  );
}

function PencilIcon(props: IconProps) {
  return (
    <SvgRoot {...props}>
      <path d="M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20z" />
      <path d="M14 7l3 3" />
    </SvgRoot>
  );
}

function HighlighterIcon(props: IconProps) {
  return (
    <SvgRoot {...props}>
      <path d="M4 20h7" />
      <path d="M7 16l-2-2 9-9 4 4-9 9-2-2z" />
      <path d="M13 6l4 4" />
    </SvgRoot>
  );
}

function EraserIcon(props: IconProps) {
  return (
    <SvgRoot {...props}>
      <path d="M4 16l8-8a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8l-5 5H8l-4-3z" />
      <path d="M9 19h11" />
      <path d="M10 10l6 6" />
    </SvgRoot>
  );
}

function SignatureIcon(props: IconProps) {
  return (
    <SvgRoot {...props}>
      <path d="M4 18c2.5-5.5 4.5-8.5 6-8.5 1.2 0 .5 3.2-.5 5.1-.7 1.3-.8 2.4.3 2.4 1.4 0 2.8-2.3 4.2-2.3 1 0 .8 2.3 2.1 2.3 1 0 2.1-.7 3.9-2" />
      <path d="M4 21h16" />
    </SvgRoot>
  );
}

function DropIcon(props: IconProps) {
  return (
    <SvgRoot {...props}>
      <path d="M12 3s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11z" />
    </SvgRoot>
  );
}

function UndoIcon(props: IconProps) {
  return (
    <SvgRoot {...props}>
      <path d="M9 7H4v5" />
      <path d="M4 12a8 8 0 0 1 13.7-4" />
    </SvgRoot>
  );
}

function RedoIcon(props: IconProps) {
  return (
    <SvgRoot {...props}>
      <path d="M15 7h5v5" />
      <path d="M20 12A8 8 0 0 0 6.3 8" />
    </SvgRoot>
  );
}

function PageRotateLeftIcon(props: IconProps) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 3.5h7l4 4v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 3.5v4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 8.5a5.5 5.5 0 0 1 8.9-4.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5.5 8.5H2.8V5.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 11.5h5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PageRotateRightIcon(props: IconProps) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M16 3.5H9l-4 4v11a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 3.5v4H5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.5 8.5a5.5 5.5 0 0 0-8.9-4.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18.5 8.5h2.7V5.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 11.5H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon(props: IconProps) {
  return (
    <SvgRoot {...props}>
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 14h10l1-14" />
      <path d="M9 7V4h6v3" />
    </SvgRoot>
  );
}
