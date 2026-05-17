"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import SignaturePad from "./SignaturePad";
import AdvancedToolbar from "./AdvancedToolbar";
import type { Tool } from "./AdvancedToolbar";
import type { AdvancedAnnotation } from "./types";
import { renderPdfAllPagesToCanvases, buildAnnotatedPdf } from "../../utils/pdfUtils";

type PageData = { dataUrl: string; width: number; height: number; rotation: number; id: string };

type HistoryEntry = { annotations: AdvancedAnnotation[]; pages: PageData[]; };
type EditableAnnotation = Exclude<AdvancedAnnotation, { kind: "watermark" }>;
type AnnotationContextMenu = { x: number; y: number; annotationId: string | null };

const DEFAULT_TEXT_FONT = "Arial, Helvetica, sans-serif";
const DEFAULT_SIGNATURE_COLOR = "#1a1a2e";
const DEFAULT_TEXT = "Insert text here";

type Props = { onStatusMessage: (msg: string) => void; };

export default function AdvancedPdfEditor({ onStatusMessage }: Props) {
  const [pages, setPages] = useState<PageData[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [annotations, setAnnotations] = useState<AdvancedAnnotation[]>([]);
  
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [sigPadOpen, setSigPadOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [copiedAnnotation, setCopiedAnnotation] = useState<EditableAnnotation | null>(null);
  const [contextMenu, setContextMenu] = useState<AnnotationContextMenu | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const [dragState, setDragState] = useState<{id:string;startX:number;startY:number;origX:number;origY:number}|null>(null);
  const [resizeState, setResizeState] = useState<{id:string;startX:number;startY:number;origW:number;origH:number;origX:number;origY:number;handle:string}|null>(null);
  const [rotateState, setRotateState] = useState<{id:string;startX:number;startY:number;origRot:number;centerX:number;centerY:number}|null>(null);

  const [watermarkText, setWatermarkText] = useState("");
  const [showWatermarkDialog, setShowWatermarkDialog] = useState(false);
  const [highlightDraw, setHighlightDraw] = useState<{startX:number;startY:number;curX:number;curY:number}|null>(null);
  
  const pageRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pageSortSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const pushState = useCallback((newAnns: AdvancedAnnotation[], newPgs: PageData[]) => {
    setHistory((prev) => {
      const h = prev.slice(0, historyIndex + 1);
      h.push({ annotations: newAnns, pages: newPgs });
      if (h.length > 6) h.shift(); // Keep ~5 redos
      setHistoryIndex(h.length - 1);
      return h;
    });
    setAnnotations(newAnns);
    setPages(newPgs);
  }, [historyIndex]);

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setAnnotations(prev[nextIdx].annotations);
        setPages(prev[nextIdx].pages);
        setHistoryIndex(nextIdx);
      }
      return prev;
    });
  }, [historyIndex]);

  const redo = useCallback(() => {
    setHistory((prev) => {
      if (historyIndex < prev.length - 1) {
        const nextIdx = historyIndex + 1;
        setAnnotations(prev[nextIdx].annotations);
        setPages(prev[nextIdx].pages);
        setHistoryIndex(nextIdx);
      }
      return prev;
    });
  }, [historyIndex]);

  const getEditableAnnotation = useCallback((id: string | null): EditableAnnotation | null => {
    if (!id) return null;
    const ann = annotations.find((a) => a.id === id);
    if (!ann || ann.kind === "watermark") return null;
    return ann;
  }, [annotations]);

  const cloneAnnotation = useCallback((ann: EditableAnnotation, pageIndex: number, offset = 0): EditableAnnotation => {
    const maxX = 1 - ann.w / 2;
    const maxY = 1 - ann.h / 2;
    return {
      ...ann,
      id: generateId(),
      pageIndex,
      x: clamp(ann.x + offset, ann.w / 2, maxX),
      y: clamp(ann.y + offset, ann.h / 2, maxY),
    };
  }, []);

  const copyAnnotation = useCallback((id = selectedId) => {
    const ann = getEditableAnnotation(id);
    if (!ann) return;
    setCopiedAnnotation({ ...ann });
    setSelectedId(ann.id);
    setContextMenu(null);
    onStatusMessage(`${labelForAnnotation(ann)} copied.`);
  }, [getEditableAnnotation, onStatusMessage, selectedId]);

  const pasteAnnotation = useCallback(() => {
    if (!copiedAnnotation || pages.length === 0) return;
    const pasted = cloneAnnotation(copiedAnnotation, currentPage);
    pushState([...annotations, pasted], pages);
    setSelectedId(pasted.id);
    setContextMenu(null);
    onStatusMessage(`${labelForAnnotation(pasted)} pasted on page ${currentPage + 1}.`);
  }, [annotations, cloneAnnotation, copiedAnnotation, currentPage, onStatusMessage, pages, pushState]);

  function duplicateAnnotation(id = selectedId) {
    const ann = getEditableAnnotation(id);
    if (!ann) return;
    const duplicated = cloneAnnotation(ann, ann.pageIndex, 0.03);
    pushState([...annotations, duplicated], pages);
    setSelectedId(duplicated.id);
    setContextMenu(null);
    onStatusMessage(`${labelForAnnotation(ann)} duplicated.`);
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        const key = e.key.toLowerCase();
        if (key === "z") { e.preventDefault(); undo(); }
        else if (key === "y") { e.preventDefault(); redo(); }
        else if (key === "c" && selectedId) { e.preventDefault(); copyAnnotation(selectedId); }
        else if (key === "v" && copiedAnnotation) { e.preventDefault(); pasteAnnotation(); }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId) {
          e.preventDefault();
          pushState(annotations.filter((an) => an.id !== selectedId), pages);
          setSelectedId(null);
          setContextMenu(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, selectedId, copiedAnnotation, annotations, pages, pushState, copyAnnotation, pasteAnnotation]);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, []);

  const loadPdf = useCallback(async (f: File) => {
    setIsLoading(true);
    onStatusMessage("Loading PDF pages...");
    try {
      const canvases = await renderPdfAllPagesToCanvases(f, 2);
      const pagesData: PageData[] = canvases.map((c) => ({
        id: generateId(),
        dataUrl: c.toDataURL("image/png"),
        width: c.width, height: c.height, rotation: 0,
      }));
      canvases.forEach((c) => c.remove());
      
      setHistory([{ annotations: [], pages: pagesData }]);
      setHistoryIndex(0);
      setPages(pagesData);
      setCurrentPage(0);
      setAnnotations([]);
      setSelectedId(null);
      setEditingTextId(null);
      setCopiedAnnotation(null);
      setContextMenu(null);
      onStatusMessage(`${pagesData.length} page${pagesData.length > 1 ? "s" : ""} loaded.`);
    } catch { onStatusMessage("Failed to load PDF."); }
    finally { setIsLoading(false); }
  }, [onStatusMessage]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    void loadPdf(f);
    e.target.value = "";
  }

  function rotatePage(dir: 1 | -1) {
    const newPages = pages.map((pg, i) => i === currentPage ? { ...pg, rotation: pg.rotation + dir * 90 } : pg);
    pushState(annotations, newPages);
  }

  function deletePage() {
    if (pages.length <= 1) return;
    const newPages = pages.filter((_, i) => i !== currentPage);
    const newAnns = annotations.filter((an) => an.pageIndex !== currentPage).map((an) =>
      an.pageIndex > currentPage ? { ...an, pageIndex: an.pageIndex - 1 } : an);
    pushState(newAnns, newPages);
    setCurrentPage((c) => Math.min(c, newPages.length - 1));
  }

  function reorderPage(dir: 1 | -1, idx: number) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= pages.length) return;
    movePageToIndex(idx, newIdx);
  }

  function movePageToIndex(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= pages.length || toIndex >= pages.length) return;

    const indexedPages = pages.map((pg, index) => ({ pg, oldIndex: index }));
    const [moved] = indexedPages.splice(fromIndex, 1);
    indexedPages.splice(toIndex, 0, moved);

    const oldToNew = new Map(indexedPages.map((entry, newIndex) => [entry.oldIndex, newIndex]));
    const newPages = indexedPages.map((entry) => entry.pg);
    const newAnns = annotations.map((ann) => ({ ...ann, pageIndex: oldToNew.get(ann.pageIndex) ?? ann.pageIndex }) as AdvancedAnnotation);
    pushState(newAnns, newPages);
    setCurrentPage(oldToNew.get(currentPage) ?? toIndex);
    setSelectedId(null);
    setEditingTextId(null);
    setContextMenu(null);
  }

  function handlePageSortEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = pages.findIndex((pg) => pg.id === active.id);
    const toIndex = pages.findIndex((pg) => pg.id === over.id);
    movePageToIndex(fromIndex, toIndex);
  }

  function addPageNumbers() {
    const existing = annotations.filter((a) => a.kind === "text" && a.text.startsWith("Page "));
    if (existing.length > 0) {
      pushState(annotations.filter((an) => !(an.kind === "text" && an.text.startsWith("Page "))), pages);
      onStatusMessage("Page numbers removed.");
      return;
    }
    const newAnns: AdvancedAnnotation[] = pages.map((_, i) => ({
      kind: "text" as const, id: generateId(), pageIndex: i,
      x: 0.5, y: 0.96, w: 0.2, h: 0.05, rotation: 0, text: `Page ${i + 1} of ${pages.length}`,
      fontSize: 12, fontFamily: DEFAULT_TEXT_FONT, color: "#64748b", bold: false, italic: false,
    }));
    pushState([...annotations, ...newAnns], pages);
    onStatusMessage("Page numbers added.");
  }

  function deleteAnnotation(id: string) {
    pushState(annotations.filter((an) => an.id !== id), pages);
    if (selectedId === id) setSelectedId(null);
    setContextMenu(null);
  }

  function nextAnnotationsWithUpdate(id: string, updates: Partial<AdvancedAnnotation>) {
    return annotations.map((a) => (a.id === id ? { ...a, ...updates } as AdvancedAnnotation : a));
  }

  function updateAnnotation(id: string, updates: Partial<AdvancedAnnotation>, commit = false) {
    const nextAnnotations = nextAnnotationsWithUpdate(id, updates);
    if (commit) {
      pushState(nextAnnotations, pages);
      return;
    }
    setAnnotations(nextAnnotations);
  }

  function addTextAnnotation(x = 0.5, y = 0.24) {
    if (!pages[currentPage]) return;
    const textBox: AdvancedAnnotation = {
      kind: "text",
      id: generateId(),
      pageIndex: currentPage,
      x,
      y,
      w: 0.5,
      h: 0.16,
      rotation: 0,
      text: DEFAULT_TEXT,
      fontSize: 24,
      fontFamily: DEFAULT_TEXT_FONT,
      color: "#111827",
      bold: false,
      italic: false,
    };
    pushState([...annotations, textBox], pages);
    setSelectedId(textBox.id);
    setEditingTextId(textBox.id);
    setActiveTool("select");
    onStatusMessage("Text added.");
  }

  function handleToolChange(tool: Tool) {
    if (tool === "text" && page) {
      addTextAnnotation();
      return;
    }
    setActiveTool(tool);
  }

  function commitAnnotationEdits() {
    pushState(annotations, pages);
  }

  function getRelCoords(e: React.PointerEvent | React.MouseEvent): {rx: number; ry: number} | null {
    const el = pageRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { rx: (e.clientX - rect.left) / rect.width, ry: (e.clientY - rect.top) / rect.height };
  }

  function handlePageClick(e: React.MouseEvent) {
    setContextMenu(null);
    const coords = getRelCoords(e);
    if (!coords) return;
    if (activeTool === "text") {
      addTextAnnotation(coords.rx, coords.ry);
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
      const target = e.target as HTMLElement;
      if (!target.closest(".annotation-layer")) {
        setSelectedId(null);
        if (editingTextId) {
          setEditingTextId(null);
          commitAnnotationEdits();
        }
      }
    }
  }

  function handlePageContextMenu(e: React.MouseEvent) {
    if (pages.length === 0) return;
    e.preventDefault();
    const target = e.target as HTMLElement;
    const annotationEl = target.closest<HTMLElement>("[data-annotation-id]");
    const annotationId = annotationEl?.dataset.annotationId ?? null;
    if (annotationId) setSelectedId(annotationId);
    setContextMenu({ x: e.clientX, y: e.clientY, annotationId });
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
    const startX = highlightDraw.startX;
    const startY = highlightDraw.startY;
    const curX = highlightDraw.curX;
    const curY = highlightDraw.curY;
    const w = Math.abs(curX - startX);
    const h = Math.abs(curY - startY);
    const cx = Math.min(startX, curX) + w/2;
    const cy = Math.min(startY, curY) + h/2;

    if (w > 0.01 && h > 0.005) {
      pushState([...annotations, {
        kind: "highlight", id: generateId(), pageIndex: currentPage,
        x: cx, y: cy, w, h, rotation: 0, color: "#fde047", opacity: 0.4,
      }], pages);
    }
    setHighlightDraw(null);
    setActiveTool("select");
  }

  function handleSignatureApply(dataUrl: string, options: { color: string; strokeWidth: number }) {
    setSigPadOpen(false);
    pushState([...annotations, {
      kind: "signature", id: generateId(), pageIndex: currentPage,
      x: 0.5, y: 0.5, w: 0.4, h: 0.15, rotation: 0, dataUrl, opacity: 1,
      color: options.color, strokeWidth: options.strokeWidth,
    }], pages);
    setActiveTool("select");
    onStatusMessage("Signature added. Drag to reposition, resize, or rotate.");
  }

  function handleWatermarkApply() {
    if (!watermarkText.trim()) return;
    const newAnns: AdvancedAnnotation[] = pages.map((_, i) => ({
      kind: "watermark" as const, id: generateId(), pageIndex: i,
      text: watermarkText.trim(), opacity: 0.08,
    }));
    pushState([...annotations, ...newAnns], pages);
    setShowWatermarkDialog(false);
    setWatermarkText("");
    onStatusMessage("Repeating watermark applied to all pages.");
  }

  // --- Transform Logic ---
  function startDrag(id: string, e: React.PointerEvent) {
    if (activeTool !== "select") return;
    const ann = annotations.find((a) => a.id === id);
    if (!ann || ann.kind === "watermark") return;
    if (ann.kind === "text" && e.detail >= 2) {
      e.stopPropagation();
      setSelectedId(id);
      setEditingTextId(id);
      return;
    }
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
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
      an.id === dragState.id && an.kind !== "watermark" ? { ...an, x: clamp(dragState.origX + dx, 0, 1), y: clamp(dragState.origY + dy, 0, 1) } : an
    ));
  }

  function onDragEnd() {
    if (dragState) {
      pushState(annotations, pages); // commit drag
      setDragState(null);
    }
  }

  function startResize(id: string, e: React.PointerEvent, handle: string) {
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const ann = annotations.find((a) => a.id === id);
    if (!ann || ann.kind === "watermark") return;
    setResizeState({ id, startX: e.clientX, startY: e.clientY, origW: ann.w, origH: ann.h, origX: ann.x, origY: ann.y, handle });
  }

  function onResizeMove(e: React.PointerEvent) {
    if (!resizeState) return;
    const el = pageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = (e.clientX - resizeState.startX) / rect.width;
    const dy = (e.clientY - resizeState.startY) / rect.height;
    
    setAnnotations((a) => a.map((an) => {
      if (an.id !== resizeState.id || an.kind === "watermark") return an;
      let newW = resizeState.origW;
      let newH = resizeState.origH;
      let newX = resizeState.origX;
      let newY = resizeState.origY;
      
      const { handle } = resizeState;
      if (handle.includes("e")) newW += dx;
      if (handle.includes("w")) { newW -= dx; newX += dx/2; }
      if (handle.includes("s")) newH += dy;
      if (handle.includes("n")) { newH -= dy; newY += dy/2; }
      if (handle.includes("e")) newX += dx/2;
      if (handle.includes("s")) newY += dy/2;

      // Ensure positive dimensions
      if (newW < 0.02) newW = 0.02;
      if (newH < 0.02) newH = 0.02;
      
      return { ...an, w: newW, h: newH, x: newX, y: newY };
    }));
  }

  function onResizeEnd() {
    if (resizeState) {
      pushState(annotations, pages);
      setResizeState(null);
    }
  }

  function startRotate(id: string, e: React.PointerEvent) {
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const ann = annotations.find((a) => a.id === id);
    if (!ann || ann.kind === "watermark") return;
    const el = pageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setRotateState({ id, startX: e.clientX, startY: e.clientY, origRot: ann.rotation, centerX: rect.left + ann.x * rect.width, centerY: rect.top + ann.y * rect.height });
  }

  function onRotateMove(e: React.PointerEvent) {
    if (!rotateState) return;
    const dx1 = rotateState.startX - rotateState.centerX;
    const dy1 = rotateState.startY - rotateState.centerY;
    const dx2 = e.clientX - rotateState.centerX;
    const dy2 = e.clientY - rotateState.centerY;
    const angle1 = Math.atan2(dy1, dx1);
    const angle2 = Math.atan2(dy2, dx2);
    const delta = (angle2 - angle1) * (180 / Math.PI);
    
    setAnnotations((a) => a.map((an) =>
      an.id === rotateState.id && an.kind !== "watermark" ? { ...an, rotation: rotateState.origRot + delta } : an
    ));
  }

  function onRotateEnd() {
    if (rotateState) {
      pushState(annotations, pages);
      setRotateState(null);
    }
  }

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
        
        // Draw page
        const img = await loadImg(pg.dataUrl);
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate((pg.rotation * Math.PI) / 180);
        ctx.drawImage(img, -pg.width / 2, -pg.height / 2, pg.width, pg.height);
        ctx.restore();
        
        // Draw annotations
        const pageAnns = annotations.filter((a) => a.pageIndex === i);
        for (const ann of pageAnns) {
          if (ann.kind === "watermark") {
             ctx.save();
             ctx.fillStyle = `rgba(148,163,184,${ann.opacity})`;
             ctx.font = "bold italic 48px sans-serif";
             ctx.rotate(-45 * Math.PI / 180);
             // tile watermark
             for (let wx = -w; wx < w*2; wx+=300) {
                for (let wy = -h; wy < h*2; wy+=200) {
                   ctx.fillText(ann.text, wx, wy);
                }
             }
             ctx.restore();
          } else {
            ctx.save();
            ctx.translate(ann.x * w, ann.y * h);
            ctx.rotate((ann.rotation * Math.PI) / 180);
            
            if (ann.kind === "text") {
              drawTextBox(ctx, ann, ann.w * w, ann.h * h, w);
            } else if (ann.kind === "highlight") {
              ctx.fillStyle = ann.color;
              ctx.globalAlpha = ann.opacity;
              ctx.fillRect(-ann.w * w / 2, -ann.h * h / 2, ann.w * w, ann.h * h);
            } else if (ann.kind === "signature") {
              const sigImg = await loadImg(ann.dataUrl);
              ctx.globalAlpha = ann.opacity;
              drawSignatureImage(ctx, sigImg, ann.w * w, ann.h * h, ann.color, ann.strokeWidth);
            }
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
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  return (
    <div className="panel overflow-hidden flex flex-col">
      <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
      <SignaturePad open={sigPadOpen} onApply={handleSignatureApply} onClose={() => setSigPadOpen(false)} />

      {/* Watermark dialog */}
      {showWatermarkDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-3">Add Repeating Watermark</h3>
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

      {contextMenu && (
        <div
          className="fixed z-[60] w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm font-semibold text-slate-700 shadow-2xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {contextMenu.annotationId ? (
            <>
              <button type="button" onClick={() => copyAnnotation(contextMenu.annotationId)} className="block w-full px-3 py-2 text-left hover:bg-slate-50">
                Copy
              </button>
              <button type="button" onClick={() => duplicateAnnotation(contextMenu.annotationId)} className="block w-full px-3 py-2 text-left hover:bg-slate-50">
                Duplicate
              </button>
              <button type="button" onClick={() => deleteAnnotation(contextMenu.annotationId!)} className="block w-full px-3 py-2 text-left text-red-600 hover:bg-red-50">
                Delete
              </button>
              <div className="my-1 border-t border-slate-100" />
            </>
          ) : null}
          <button
            type="button"
            onClick={pasteAnnotation}
            disabled={!copiedAnnotation}
            className="block w-full px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            Paste to page
          </button>
        </div>
      )}

      {!page && !isLoading ? (
        <div className="flex-1 bg-white p-6 lg:p-12 overflow-y-auto w-full">
          <div className="mx-auto max-w-4xl">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">PDF Editor</h1>
              </div>
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition">
                Add PDF
              </button>
            </div>

            <div 
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f && f.type === "application/pdf") {
                  void loadPdf(f);
                } else if (f) {
                  onStatusMessage("Please upload a valid PDF file.");
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className="group flex min-h-[400px] cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50/50 transition">
              <div className="text-center">
                <h3 className="text-xl font-semibold text-slate-900">Drop or choose PDF</h3>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden bg-slate-100">
          <aside className="hidden w-48 shrink-0 overflow-y-auto border-r border-blue-100 bg-blue-50/70 p-4 md:block">
            <div className="flex flex-col items-center gap-4">
              <DndContext sensors={pageSortSensors} collisionDetection={closestCenter} onDragEnd={handlePageSortEnd}>
                <SortableContext items={pages.map((pg) => pg.id)} strategy={verticalListSortingStrategy}>
                  {pages.map((pg, i) => (
                    <SortablePageThumbnail
                      key={pg.id}
                      page={pg}
                      index={i}
                      currentPage={currentPage}
                      pageCount={pages.length}
                      onSelect={() => { setCurrentPage(i); setSelectedId(null); }}
                      onMove={reorderPage}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-blue-500 text-2xl leading-none text-white shadow-sm hover:bg-blue-600"
                aria-label="Add PDF"
              >
                +
              </button>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <AdvancedToolbar
              activeTool={activeTool} setActiveTool={handleToolChange}
              onRotatePage={rotatePage} onDeletePage={deletePage}
              onAddPageNumbers={addPageNumbers} onDownload={exportPdf}
              onUpload={() => fileInputRef.current?.click()}
              isExporting={isExporting} hasPages={pages.length > 0}
              pageCount={pages.length} currentPage={currentPage}
              annotations={annotations} onDeleteAnnotation={deleteAnnotation}
              onUpdateAnnotation={(id, updates) => {
                updateAnnotation(id, updates, true);
              }}
              selectedAnnotationId={selectedId}
              canUndo={canUndo} canRedo={canRedo} undo={undo} redo={redo}
            />

            {/* Main page view */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {isLoading ? (
              <div className="flex h-64 flex-col items-center justify-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600"></div>
                <div className="text-sm font-medium text-slate-500">Loading PDF pages...</div>
              </div>
            ) : (
              <>
                {/* Page canvas */}
                <div className="mx-auto w-full max-w-[900px] select-none">
                  <div ref={pageRef} className="relative overflow-hidden bg-white shadow-xl ring-1 ring-slate-200 touch-none"
                    style={{ aspectRatio: page!.rotation % 180 !== 0 ? `${page!.height}/${page!.width}` : `${page!.width}/${page!.height}` }}
                    onClick={handlePageClick}
                    onContextMenu={handlePageContextMenu}
                    onPointerDown={handleHighlightDown} onPointerMove={(e) => { handleHighlightMove(e); onDragMove(e); onResizeMove(e); onRotateMove(e); }}
                    onPointerUp={() => { handleHighlightUp(); onDragEnd(); onResizeEnd(); onRotateEnd(); }}>
                    
                    <img src={page!.dataUrl} alt={`Page ${currentPage + 1}`}
                      className="h-full w-full object-contain pointer-events-none"
                      style={{ transform: `rotate(${page!.rotation}deg)` }} draggable={false} />

                    {/* Watermark Preview */}
                    <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden opacity-[0.08]">
                      {annotations
                        .filter((a): a is Extract<AdvancedAnnotation, { kind: "watermark" }> => a.pageIndex === currentPage && a.kind === "watermark")
                        .map(ann => (
                         <div key={ann.id} className="absolute -inset-[100%] flex flex-wrap content-start" style={{ transform: "rotate(-45deg)" }}>
                           {Array.from({length: 100}).map((_, i) => (
                             <span key={i} className="text-4xl text-slate-500 font-bold italic m-10 whitespace-nowrap">{ann.text}</span>
                           ))}
                         </div>
                        ))}
                    </div>

                    {/* Highlight drawing preview */}
                    {highlightDraw && (
                      <div className="absolute bg-yellow-300/40 border border-yellow-400 pointer-events-none" style={{
                        left: `${Math.min(highlightDraw.startX, highlightDraw.curX) * 100}%`,
                        top: `${Math.min(highlightDraw.startY, highlightDraw.curY) * 100}%`,
                        width: `${Math.abs(highlightDraw.curX - highlightDraw.startX) * 100}%`,
                        height: `${Math.abs(highlightDraw.curY - highlightDraw.startY) * 100}%`,
                      }} />
                    )}

                    {/* Render annotations */}
                    {annotations.filter((a) => a.pageIndex === currentPage && a.kind !== "watermark").map((ann) => {
                      if (ann.kind === "watermark") return null;
                      const isSelected = selectedId === ann.id;
                      return (
                        <div key={ann.id} data-annotation-id={ann.id} className={`annotation-layer group absolute cursor-move border ${isSelected ? `border-blue-400 ${ann.kind === "text" ? "bg-sky-50/70" : ""}` : "border-transparent hover:border-blue-300/80"}`}
                          style={{
                            left: `${ann.x * 100}%`, top: `${ann.y * 100}%`,
                            width: `${ann.w * 100}%`, height: `${ann.h * 100}%`,
                            transform: `translate(-50%, -50%) rotate(${ann.rotation}deg)`,
                          }}
                          onDoubleClick={(e) => {
                            if (ann.kind !== "text") return;
                            e.stopPropagation();
                            setSelectedId(ann.id);
                            setEditingTextId(ann.id);
                          }}
                          onPointerDown={(e) => startDrag(ann.id, e)}>
                          
                          {/* Content rendering */}
                          <div className="w-full h-full pointer-events-none flex items-center justify-center overflow-hidden">
                             {ann.kind === "text" && (
                                <div className="w-full h-full pointer-events-auto">
                                  {editingTextId === ann.id ? (
                                    <textarea
                                      autoFocus
                                      value={ann.text}
                                      onChange={(e) => updateAnnotation(ann.id, { text: e.target.value })}
                                      onBlur={(e) => {
                                        const nextAnnotations = nextAnnotationsWithUpdate(ann.id, { text: e.currentTarget.value || DEFAULT_TEXT });
                                        setEditingTextId(null);
                                        pushState(nextAnnotations, pages);
                                      }}
                                      onFocus={(e) => e.currentTarget.select()}
                                      onPointerDown={(e) => e.stopPropagation()}
                                      onKeyDown={(e) => {
                                        if (e.key === "Escape") {
                                          e.preventDefault();
                                          setEditingTextId(null);
                                          commitAnnotationEdits();
                                        }
                                      }}
                                      style={{
                                        fontFamily: ann.fontFamily || DEFAULT_TEXT_FONT,
                                        fontSize: `${ann.fontSize}px`, color: ann.color,
                                        fontWeight: ann.bold ? "bold" : "normal", fontStyle: ann.italic ? "italic" : "normal",
                                        lineHeight: 1.2
                                      }}
                                      className="h-full w-full resize-none overflow-hidden border-none bg-sky-50/70 p-1 m-0 outline-none"
                                    />
                                  ) : (
                                    <div
                                      onDoubleClick={(e) => { e.stopPropagation(); setSelectedId(ann.id); setEditingTextId(ann.id); }}
                                      style={{
                                        fontFamily: ann.fontFamily || DEFAULT_TEXT_FONT,
                                        fontSize: `${ann.fontSize}px`, color: ann.color,
                                        fontWeight: ann.bold ? "bold" : "normal", fontStyle: ann.italic ? "italic" : "normal",
                                        whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.2, overflow: "hidden",
                                        width: "100%", height: "100%"
                                      }}
                                      className="p-1">
                                      {ann.text}
                                    </div>
                                  )}
                                </div>
                             )}
                             {ann.kind === "highlight" && (
                                <div style={{ backgroundColor: ann.color, opacity: ann.opacity, width: "100%", height: "100%" }} />
                             )}
                             {ann.kind === "signature" && (
                                <div className="h-full w-full" style={signaturePreviewStyle(ann)} aria-label="Signature" />
                             )}
                          </div>

                          {/* Transform Handles */}
                          {isSelected && (
                            <>
                              <div className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-blue-400 cursor-nw-resize" onPointerDown={(e) => startResize(ann.id, e, "nw")} />
                              <div className="absolute left-1/2 -top-1.5 h-3 w-3 -translate-x-1/2 rounded-full bg-blue-400 cursor-n-resize" onPointerDown={(e) => startResize(ann.id, e, "n")} />
                              <div className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full bg-blue-400 cursor-ne-resize" onPointerDown={(e) => startResize(ann.id, e, "ne")} />
                              <div className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-blue-400 cursor-e-resize" onPointerDown={(e) => startResize(ann.id, e, "e")} />
                              <div className="absolute -right-1.5 -bottom-1.5 h-3 w-3 rounded-full bg-blue-400 cursor-se-resize" onPointerDown={(e) => startResize(ann.id, e, "se")} />
                              <div className="absolute left-1/2 -bottom-1.5 h-3 w-3 -translate-x-1/2 rounded-full bg-blue-400 cursor-s-resize" onPointerDown={(e) => startResize(ann.id, e, "s")} />
                              <div className="absolute -left-1.5 -bottom-1.5 h-3 w-3 rounded-full bg-blue-400 cursor-sw-resize" onPointerDown={(e) => startResize(ann.id, e, "sw")} />
                              <div className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-blue-400 cursor-w-resize" onPointerDown={(e) => startResize(ann.id, e, "w")} />
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); deleteAnnotation(ann.id); }}
                                onPointerDown={(e) => e.stopPropagation()}
                                className="absolute left-1/2 top-[calc(100%+14px)] z-20 flex h-12 w-14 -translate-x-1/2 items-center justify-center rounded bg-[#001b53] text-xl text-white shadow-lg"
                                aria-label="Delete annotation"
                              >
                                🗑
                              </button>
                              <button
                                type="button"
                                onPointerDown={(e) => startRotate(ann.id, e)}
                                className="absolute left-[calc(100%+48px)] top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border-2 border-blue-400 bg-white text-lg text-blue-500 shadow-sm"
                                aria-label="Rotate annotation"
                              >
                                ↻
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 flex gap-3 overflow-x-auto pb-4 w-full px-2 items-center md:hidden">
                  <DndContext sensors={pageSortSensors} collisionDetection={closestCenter} onDragEnd={handlePageSortEnd}>
                    <SortableContext items={pages.map((pg) => pg.id)} strategy={horizontalListSortingStrategy}>
                      {pages.map((pg, i) => (
                        <SortablePageThumbnail
                          key={pg.id}
                          page={pg}
                          index={i}
                          currentPage={currentPage}
                          pageCount={pages.length}
                          onSelect={() => { setCurrentPage(i); setSelectedId(null); }}
                          onMove={reorderPage}
                          compact
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                </div>
              </>
            )}
            </div>
          </div>
      </div>
      )}
    </div>
  );
}

function SortablePageThumbnail({
  page,
  index,
  currentPage,
  pageCount,
  onSelect,
  onMove,
  compact = false,
}: {
  page: PageData;
  index: number;
  currentPage: number;
  pageCount: number;
  onSelect: () => void;
  onMove: (dir: 1 | -1, idx: number) => void;
  compact?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
  };
  const active = index === currentPage;
  const thumbSize = compact ? { width: 72, height: 90 } : { width: 112, height: 146 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${compact ? "flex flex-col gap-1" : "flex flex-col gap-2"} items-center transition ${
        isDragging ? "opacity-60" : "opacity-100"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className={`relative flex-shrink-0 cursor-grab overflow-hidden bg-white shadow-sm transition active:cursor-grabbing ${
          compact
            ? `rounded-xl border-2 ${active ? "scale-105 border-blue-500 shadow-md" : "border-slate-200 hover:border-blue-300"}`
            : active
              ? "ring-2 ring-blue-500"
              : "ring-1 ring-slate-200 hover:ring-blue-300"
        }`}
        style={thumbSize}
        aria-label={`Move or select page ${index + 1}`}
        {...attributes}
        {...listeners}
      >
        <img
          src={page.dataUrl}
          alt={`Page ${index + 1}`}
          className="h-full w-full object-cover"
          style={{ transform: `rotate(${page.rotation}deg)` }}
          draggable={false}
        />
      </button>
      <div
        className={
          compact
            ? "flex items-center gap-1 rounded-full border border-slate-200 bg-white px-1 shadow-sm"
            : "flex items-center gap-2"
        }
      >
        <button
          type="button"
          onClick={() => onMove(-1, index)}
          disabled={index === 0}
          className={
            compact
              ? "px-1 text-xs text-slate-400 hover:text-blue-600 disabled:opacity-30"
              : "flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-blue-600 disabled:opacity-30"
          }
          aria-label={`Move page ${index + 1} up`}
        >
          {"<"}
        </button>
        <span className={compact ? "text-[10px] font-semibold text-slate-500" : "text-sm font-semibold text-slate-900"}>
          {index + 1}
        </span>
        <button
          type="button"
          onClick={() => onMove(1, index)}
          disabled={index === pageCount - 1}
          className={
            compact
              ? "px-1 text-xs text-slate-400 hover:text-blue-600 disabled:opacity-30"
              : "flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-blue-600 disabled:opacity-30"
          }
          aria-label={`Move page ${index + 1} down`}
        >
          {">"}
        </button>
      </div>
    </div>
  );
}

function clamp(n: number, min: number, max: number) { return Math.min(max, Math.max(min, n)); }

function labelForAnnotation(ann: EditableAnnotation) {
  if (ann.kind === "text") return "Text box";
  if (ann.kind === "signature") return "Signature";
  return "Highlight";
}

function drawTextBox(
  ctx: CanvasRenderingContext2D,
  ann: Extract<AdvancedAnnotation, { kind: "text" }>,
  boxW: number,
  boxH: number,
  pageW: number
) {
  const fontSize = Math.max(6, Math.round(ann.fontSize * (pageW / 800)));
  const lineHeight = fontSize * 1.2;
  const left = -boxW / 2;
  const top = -boxH / 2;
  const maxLines = Math.max(1, Math.floor(boxH / lineHeight));
  ctx.font = `${ann.italic ? "italic " : ""}${ann.bold ? "bold " : ""}${fontSize}px ${ann.fontFamily || DEFAULT_TEXT_FONT}`;
  const lines = wrapText(ctx, ann.text, boxW, maxLines);

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, boxW, boxH);
  ctx.clip();
  ctx.fillStyle = ann.color;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  lines.forEach((line, index) => {
    ctx.fillText(line, left, top + index * lineHeight);
  });
  ctx.restore();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const lines: string[] = [];
  const paragraphs = text.split(/\r?\n/);
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      if (lines.length >= maxLines) return lines;
      continue;
    }
    let line = "";
    for (const word of words) {
      const nextLine = line ? `${line} ${word}` : word;
      if (ctx.measureText(nextLine).width <= maxWidth || !line) {
        line = nextLine;
      } else {
        lines.push(line);
        if (lines.length >= maxLines) return lines;
        line = word;
      }
    }
    lines.push(line);
    if (lines.length >= maxLines) return lines;
  }
  return lines;
}

function drawSignatureImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
  color = DEFAULT_SIGNATURE_COLOR,
  strokeWidth = 3
) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  const sigCtx = canvas.getContext("2d");
  if (!sigCtx) {
    ctx.drawImage(img, -width / 2, -height / 2, width, height);
    return;
  }

  const radius = Math.max(0, Math.round((strokeWidth - 3) * Math.max(width, height) / 420));
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      if (dx * dx + dy * dy <= radius * radius) {
        sigCtx.drawImage(img, dx, dy, canvas.width, canvas.height);
      }
    }
  }
  if (radius === 0) sigCtx.drawImage(img, 0, 0, canvas.width, canvas.height);

  sigCtx.globalCompositeOperation = "source-in";
  sigCtx.fillStyle = color;
  sigCtx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(canvas, -width / 2, -height / 2, width, height);
  canvas.remove();
}

function signaturePreviewStyle(ann: Extract<AdvancedAnnotation, { kind: "signature" }>): React.CSSProperties {
  const color = ann.color || DEFAULT_SIGNATURE_COLOR;
  const grow = Math.max(0, (ann.strokeWidth || 3) - 3);
  const mask = `url(${ann.dataUrl}) center / contain no-repeat`;
  return {
    backgroundColor: color,
    opacity: ann.opacity,
    WebkitMask: mask,
    mask,
    filter: grow > 0 ? `drop-shadow(0 0 ${grow}px ${color})` : undefined,
  };
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image failed"));
    img.src = src;
  });
}

function generateId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 15);
}
