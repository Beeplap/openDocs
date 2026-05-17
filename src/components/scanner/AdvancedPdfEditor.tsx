"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import SignaturePad from "./SignaturePad";
import AdvancedToolbar from "./AdvancedToolbar";
import type { Tool } from "./AdvancedToolbar";
import type { AdvancedAnnotation } from "./types";
import { renderPdfAllPagesToCanvases, buildAnnotatedPdf, getPdfPageCount } from "../../utils/pdfUtils";

type PageData = { dataUrl: string; width: number; height: number; rotation: number };

type Props = {
  onStatusMessage: (msg: string) => void;
};

export default function AdvancedPdfEditor({ onStatusMessage }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageData[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [annotations, setAnnotations] = useState<AdvancedAnnotation[]>([]);
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [sigPadOpen, setSigPadOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [dragState, setDragState] = useState<{id:string;startX:number;startY:number;origX:number;origY:number}|null>(null);
  const [resizeState, setResizeState] = useState<{id:string;startX:number;startY:number;origW:number;origH:number}|null>(null);
  const [watermarkText, setWatermarkText] = useState("");
  const [showWatermarkDialog, setShowWatermarkDialog] = useState(false);
  const [textInput, setTextInput] = useState<{x:number;y:number;text:string}|null>(null);
  const [highlightDraw, setHighlightDraw] = useState<{startX:number;startY:number;curX:number;curY:number}|null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadPdf = useCallback(async (f: File) => {
    setIsLoading(true);
    onStatusMessage("Loading PDF pages...");
    try {
      const canvases = await renderPdfAllPagesToCanvases(f, 2);
      const pagesData: PageData[] = canvases.map((c) => ({
        dataUrl: c.toDataURL("image/png"),
        width: c.width, height: c.height, rotation: 0,
      }));
      canvases.forEach((c) => c.remove());
      setPages(pagesData);
      setCurrentPage(0);
      setAnnotations([]);
      setSelectedId(null);
      onStatusMessage(`${pagesData.length} page${pagesData.length > 1 ? "s" : ""} loaded.`);
    } catch { onStatusMessage("Failed to load PDF."); }
    finally { setIsLoading(false); }
  }, [onStatusMessage]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    void loadPdf(f);
    e.target.value = "";
  }

  function rotatePage(dir: 1 | -1) {
    setPages((p) => p.map((pg, i) => i === currentPage ? { ...pg, rotation: pg.rotation + dir * 90 } : pg));
  }

  function deletePage() {
    if (pages.length <= 1) return;
    setPages((p) => p.filter((_, i) => i !== currentPage));
    setAnnotations((a) => a.filter((an) => an.pageIndex !== currentPage).map((an) =>
      an.pageIndex > currentPage ? { ...an, pageIndex: an.pageIndex - 1 } : an));
    setCurrentPage((c) => Math.min(c, pages.length - 2));
  }

  function addPageNumbers() {
    const existing = annotations.filter((a) => a.kind === "text" && a.text.startsWith("Page "));
    if (existing.length > 0) {
      setAnnotations((a) => a.filter((an) => !(an.kind === "text" && an.text.startsWith("Page "))));
      onStatusMessage("Page numbers removed.");
      return;
    }
    const newAnns: AdvancedAnnotation[] = pages.map((_, i) => ({
      kind: "text" as const, id: crypto.randomUUID(), pageIndex: i,
      x: 0.5, y: 0.96, text: `Page ${i + 1} of ${pages.length}`,
      fontSize: 12, color: "#64748b", bold: false, italic: false,
    }));
    setAnnotations((a) => [...a, ...newAnns]);
    onStatusMessage("Page numbers added.");
  }

  function deleteAnnotation(id: string) {
    setAnnotations((a) => a.filter((an) => an.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  // Get relative coords from pointer event on page container
  function getRelCoords(e: React.PointerEvent | React.MouseEvent): {rx: number; ry: number} | null {
    const el = pageRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { rx: (e.clientX - rect.left) / rect.width, ry: (e.clientY - rect.top) / rect.height };
  }

  function handlePageClick(e: React.MouseEvent) {
    const coords = getRelCoords(e);
    if (!coords) return;
    if (activeTool === "text") {
      setTextInput({ x: coords.rx, y: coords.ry, text: "" });
      return;
    }
    if (activeTool === "signature") {
      setSigPadOpen(true);
      return;
    }
    if (activeTool === "watermark") {
      setShowWatermarkDialog(true);
      return;
    }
    if (activeTool === "select") {
      setSelectedId(null);
    }
  }

  function handleHighlightDown(e: React.PointerEvent) {
    if (activeTool !== "highlight") return;
    const coords = getRelCoords(e);
    if (!coords) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setHighlightDraw({ startX: coords.rx, startY: coords.ry, curX: coords.rx, curY: coords.ry });
  }

  function handleHighlightMove(e: React.PointerEvent) {
    if (!highlightDraw) return;
    const coords = getRelCoords(e);
    if (!coords) return;
    setHighlightDraw((h) => h ? { ...h, curX: coords.rx, curY: coords.ry } : null);
  }

  function handleHighlightUp() {
    if (!highlightDraw) return;
    const x = Math.min(highlightDraw.startX, highlightDraw.curX);
    const y = Math.min(highlightDraw.startY, highlightDraw.curY);
    const w = Math.abs(highlightDraw.curX - highlightDraw.startX);
    const h = Math.abs(highlightDraw.curY - highlightDraw.startY);
    if (w > 0.01 && h > 0.005) {
      setAnnotations((a) => [...a, {
        kind: "highlight", id: crypto.randomUUID(), pageIndex: currentPage,
        x, y, w, h, color: "#fde047", opacity: 0.4,
      }]);
    }
    setHighlightDraw(null);
  }

  function commitTextInput() {
    if (!textInput || !textInput.text.trim()) { setTextInput(null); return; }
    setAnnotations((a) => [...a, {
      kind: "text", id: crypto.randomUUID(), pageIndex: currentPage,
      x: textInput.x, y: textInput.y, text: textInput.text.trim(),
      fontSize: 16, color: "#1e293b", bold: false, italic: false,
    }]);
    setTextInput(null);
    setActiveTool("select");
  }

  function handleSignatureApply(dataUrl: string) {
    setSigPadOpen(false);
    setAnnotations((a) => [...a, {
      kind: "signature", id: crypto.randomUUID(), pageIndex: currentPage,
      x: 0.3, y: 0.6, w: 0.4, h: 0.15, dataUrl, opacity: 1,
    }]);
    setActiveTool("select");
    onStatusMessage("Signature added. Drag to reposition, drag corners to resize.");
  }

  function handleWatermarkApply() {
    if (!watermarkText.trim()) return;
    pages.forEach((_, i) => {
      setAnnotations((a) => [...a, {
        kind: "text", id: crypto.randomUUID(), pageIndex: i,
        x: 0.5, y: 0.5, text: watermarkText.trim(),
        fontSize: 48, color: "rgba(148,163,184,0.3)", bold: true, italic: true,
      }]);
    });
    setShowWatermarkDialog(false);
    setWatermarkText("");
    onStatusMessage("Watermark applied to all pages.");
  }

  // Drag & resize annotations
  function startDrag(id: string, e: React.PointerEvent) {
    if (activeTool !== "select") return;
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const ann = annotations.find((a) => a.id === id);
    if (!ann) return;
    setSelectedId(id);
    setDragState({ id, startX: e.clientX, startY: e.clientY, origX: ann.x, origY: ann.y });
  }

  function onDragMove(e: React.PointerEvent) {
    if (!dragState) return;
    const el = pageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = (e.clientX - dragState.startX) / rect.width;
    const dy = (e.clientY - dragState.startY) / rect.height;
    setAnnotations((a) => a.map((an) =>
      an.id === dragState.id ? { ...an, x: clamp(dragState.origX + dx, 0, 1), y: clamp(dragState.origY + dy, 0, 1) } : an
    ));
  }

  function onDragEnd() { setDragState(null); }

  function startResize(id: string, e: React.PointerEvent) {
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const ann = annotations.find((a) => a.id === id);
    if (!ann || ann.kind !== "signature") return;
    setResizeState({ id, startX: e.clientX, startY: e.clientY, origW: ann.w, origH: ann.h });
  }

  function onResizeMove(e: React.PointerEvent) {
    if (!resizeState) return;
    const el = pageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dw = (e.clientX - resizeState.startX) / rect.width;
    const dh = (e.clientY - resizeState.startY) / rect.height;
    setAnnotations((a) => a.map((an) =>
      an.id === resizeState.id && an.kind === "signature"
        ? { ...an, w: clamp(resizeState.origW + dw, 0.05, 0.9), h: clamp(resizeState.origH + dh, 0.03, 0.6) } : an
    ));
  }

  function onResizeEnd() { setResizeState(null); }

  async function exportPdf() {
    if (pages.length === 0) return;
    setIsExporting(true);
    onStatusMessage("Exporting annotated PDF...");
    try {
      const canvases: HTMLCanvasElement[] = [];
      for (let i = 0; i < pages.length; i++) {
        const pg = pages[i];
        const canvas = document.createElement("canvas");
        const w = pg.rotation % 180 !== 0 ? pg.height : pg.width;
        const h = pg.rotation % 180 !== 0 ? pg.width : pg.height;
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
        // Draw rotated page image
        const img = await loadImg(pg.dataUrl);
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate((pg.rotation * Math.PI) / 180);
        ctx.drawImage(img, -pg.width / 2, -pg.height / 2, pg.width, pg.height);
        ctx.restore();
        // Draw annotations
        const pageAnns = annotations.filter((a) => a.pageIndex === i);
        for (const ann of pageAnns) {
          if (ann.kind === "text") {
            ctx.save();
            ctx.font = `${ann.italic ? "italic " : ""}${ann.bold ? "bold " : ""}${Math.round(ann.fontSize * (w / 800))}px sans-serif`;
            ctx.fillStyle = ann.color;
            ctx.textAlign = "center";
            ctx.fillText(ann.text, ann.x * w, ann.y * h);
            ctx.restore();
          } else if (ann.kind === "highlight") {
            ctx.save();
            ctx.fillStyle = ann.color;
            ctx.globalAlpha = ann.opacity;
            ctx.fillRect(ann.x * w, ann.y * h, ann.w * w, ann.h * h);
            ctx.restore();
          } else if (ann.kind === "signature") {
            const sigImg = await loadImg(ann.dataUrl);
            ctx.save();
            ctx.globalAlpha = ann.opacity;
            ctx.drawImage(sigImg, ann.x * w, ann.y * h, ann.w * w, ann.h * h);
            ctx.restore();
          }
        }
        canvases.push(canvas);
      }
      const pdfBytes = await buildAnnotatedPdf(canvases);
      canvases.forEach((c) => c.remove());
      const blob = new Blob([Uint8Array.from(pdfBytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "opendocs-edited.pdf"; a.click();
      URL.revokeObjectURL(url);
      onStatusMessage("PDF exported successfully!");
    } catch { onStatusMessage("Export failed."); }
    finally { setIsExporting(false); }
  }

  const page = pages[currentPage] ?? null;

  return (
    <div className="panel overflow-hidden">
      <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
      <SignaturePad open={sigPadOpen} onApply={handleSignatureApply} onClose={() => setSigPadOpen(false)} />

      {/* Watermark dialog */}
      {showWatermarkDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-3">Add Watermark</h3>
            <input type="text" value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)}
              placeholder="Watermark text..." className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm mb-4" autoFocus />
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => { setShowWatermarkDialog(false); setWatermarkText(""); }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={handleWatermarkApply} disabled={!watermarkText.trim()}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">Apply</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Main page view */}
        <div className="bg-slate-100 p-4 sm:p-6">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center text-sm text-slate-500">Loading pages...</div>
          ) : !page ? (
            <div className="flex h-64 flex-col items-center justify-center gap-4">
              <p className="text-sm text-slate-500">Upload a PDF to start editing</p>
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700 transition">
                Choose PDF File
              </button>
            </div>
          ) : (
            <>
              {/* Page canvas */}
              <div className="mx-auto max-w-[600px]">
                <div ref={pageRef} className="relative overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200"
                  style={{ aspectRatio: page.rotation % 180 !== 0 ? `${page.height}/${page.width}` : `${page.width}/${page.height}` }}
                  onClick={handlePageClick}
                  onPointerDown={handleHighlightDown} onPointerMove={(e) => { handleHighlightMove(e); onDragMove(e); onResizeMove(e); }}
                  onPointerUp={(e) => { handleHighlightUp(); onDragEnd(); onResizeEnd(); }}>
                  <img src={page.dataUrl} alt={`Page ${currentPage + 1}`}
                    className="h-full w-full object-contain pointer-events-none"
                    style={{ transform: `rotate(${page.rotation}deg)` }} draggable={false} />

                  {/* Highlight drawing preview */}
                  {highlightDraw && (
                    <div className="absolute bg-yellow-300/40 border border-yellow-400 pointer-events-none" style={{
                      left: `${Math.min(highlightDraw.startX, highlightDraw.curX) * 100}%`,
                      top: `${Math.min(highlightDraw.startY, highlightDraw.curY) * 100}%`,
                      width: `${Math.abs(highlightDraw.curX - highlightDraw.startX) * 100}%`,
                      height: `${Math.abs(highlightDraw.curY - highlightDraw.startY) * 100}%`,
                    }} />
                  )}

                  {/* Text input */}
                  {textInput && (
                    <div className="absolute z-30" style={{ left: `${textInput.x * 100}%`, top: `${textInput.y * 100}%`, transform: "translate(-50%, -50%)" }}>
                      <input type="text" autoFocus value={textInput.text} onChange={(e) => setTextInput((t) => t ? { ...t, text: e.target.value } : null)}
                        onKeyDown={(e) => { if (e.key === "Enter") commitTextInput(); if (e.key === "Escape") setTextInput(null); }}
                        onBlur={commitTextInput}
                        className="rounded-lg border-2 border-emerald-400 bg-white px-2 py-1 text-sm shadow-lg outline-none min-w-[120px]"
                        placeholder="Type text..." />
                    </div>
                  )}

                  {/* Render annotations */}
                  {annotations.filter((a) => a.pageIndex === currentPage).map((ann) => {
                    if (ann.kind === "text") {
                      return (
                        <div key={ann.id} className={`absolute select-none cursor-move ${selectedId === ann.id ? "ring-2 ring-emerald-500 rounded" : ""}`}
                          style={{ left: `${ann.x * 100}%`, top: `${ann.y * 100}%`, transform: "translate(-50%, -50%)",
                            fontSize: `${ann.fontSize}px`, color: ann.color,
                            fontWeight: ann.bold ? "bold" : "normal", fontStyle: ann.italic ? "italic" : "normal" }}
                          onPointerDown={(e) => startDrag(ann.id, e)}>
                          {ann.text}
                        </div>
                      );
                    }
                    if (ann.kind === "highlight") {
                      return (
                        <div key={ann.id} className={`absolute cursor-move ${selectedId === ann.id ? "ring-2 ring-emerald-500" : ""}`}
                          style={{ left: `${ann.x * 100}%`, top: `${ann.y * 100}%`,
                            width: `${ann.w * 100}%`, height: `${ann.h * 100}%`,
                            backgroundColor: ann.color, opacity: ann.opacity }}
                          onPointerDown={(e) => startDrag(ann.id, e)} />
                      );
                    }
                    if (ann.kind === "signature") {
                      const isSelected = selectedId === ann.id;
                      return (
                        <div key={ann.id} className={`absolute cursor-move ${isSelected ? "ring-2 ring-emerald-500" : ""}`}
                          style={{ left: `${ann.x * 100}%`, top: `${ann.y * 100}%`,
                            width: `${ann.w * 100}%`, height: `${ann.h * 100}%`, opacity: ann.opacity }}
                          onPointerDown={(e) => startDrag(ann.id, e)}>
                          <img src={ann.dataUrl} alt="Signature" className="h-full w-full object-contain pointer-events-none" draggable={false} />
                          {isSelected && (
                            <div className="absolute -bottom-2 -right-2 h-5 w-5 rounded-full bg-emerald-500 border-2 border-white cursor-se-resize shadow-lg"
                              onPointerDown={(e) => startResize(ann.id, e)} />
                          )}
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>

              {/* Page thumbnails */}
              <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
                {pages.map((pg, i) => (
                  <button key={i} type="button" onClick={() => { setCurrentPage(i); setSelectedId(null); }}
                    className={`flex-shrink-0 rounded-xl overflow-hidden border-2 transition ${
                      i === currentPage ? "border-emerald-500 shadow-md" : "border-slate-200 hover:border-slate-300"
                    }`} style={{ width: 64, height: 80 }}>
                    <img src={pg.dataUrl} alt={`Page ${i + 1}`} className="h-full w-full object-cover"
                      style={{ transform: `rotate(${pg.rotation}deg)` }} draggable={false} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Sidebar */}
        <div className="border-t border-slate-200 lg:border-l lg:border-t-0 overflow-y-auto max-h-[80vh]">
          <AdvancedToolbar
            activeTool={activeTool} setActiveTool={setActiveTool}
            onRotatePage={rotatePage} onDeletePage={deletePage}
            onAddPageNumbers={addPageNumbers} onDownload={exportPdf}
            onUpload={() => fileInputRef.current?.click()}
            isExporting={isExporting} hasPages={pages.length > 0}
            pageCount={pages.length} currentPage={currentPage}
            annotations={annotations} onDeleteAnnotation={deleteAnnotation}
            selectedAnnotationId={selectedId}
          />
        </div>
      </div>
    </div>
  );
}

function clamp(n: number, min: number, max: number) { return Math.min(max, Math.max(min, n)); }

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image failed"));
    img.src = src;
  });
}
