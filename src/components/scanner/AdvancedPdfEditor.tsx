"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePasteFile } from "../../hooks/usePasteFile";
import { encryptPDF } from "@pdfsmaller/pdf-encrypt-lite";
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
import type { DrawMode, DrawSettings, Tool } from "./AdvancedToolbar";
import type { WorkspaceIntent } from "../OpendocsWorkspace";
import type { AdvancedAnnotation, PageCrop } from "./types";
import PdfPageCropOverlay, { PdfCropControlBar } from "./PdfPageCropOverlay";
import { loadPdfDocumentAndMetadata, buildAnnotatedPdf, buildAnnotatedPdfFromSource } from "../../utils/pdfUtils";
import { takePendingFiles } from "../../utils/pendingFiles";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

type PageData = { 
  id: string; 
  width: number; 
  height: number; 
  rotation: number; 
  crop?: PageCrop | null;
  originalPageIndex?: number; 
  dataUrl?: string; 
  pdfDoc?: PDFDocumentProxy; 
};

type HistoryEntry = { annotations: AdvancedAnnotation[]; pages: PageData[]; };
type EditableAnnotation = Exclude<AdvancedAnnotation, { kind: "watermark" }>;
type AnnotationContextMenu = { x: number; y: number; annotationId: string | null };
type PdfPickerAction = "edit" | "unlock" | "flatten" | "protect";
type ExportOptions = { forceFlatten?: boolean; forceProtect?: boolean };
type ExportPdfFn = (filename?: string, success?: string, options?: ExportOptions) => Promise<void>;

const DEFAULT_TEXT_FONT = "Arial, Helvetica, sans-serif";
const DEFAULT_SIGNATURE_COLOR = "#1a1a2e";
const DEFAULT_TEXT = "Insert text here";
const WATERMARK_ANGLE = -45;
const DEFAULT_DRAW_SETTINGS: DrawSettings = {
  penColor: "#111827",
  penSize: 3,
  highlighterColor: "#fde047",
  highlighterOpacity: 0.4,
  eraserSize: 28,
};

function initialToolForIntent(intent?: WorkspaceIntent): Tool {
  if (intent === "crop") return "crop";
  if (intent === "add-text") return "text";
  if (intent === "add-signature") return "signature";
  if (intent === "add-watermark") return "watermark";
  if (intent === "draw" || intent === "highlight" || intent === "erase") return "draw";
  return "pan";
}

function initialDrawModeForIntent(intent?: WorkspaceIntent): DrawMode {
  if (intent === "highlight") return "highlighter";
  if (intent === "erase") return "eraser";
  return "pen";
}

function watermarkFontSize(width: number, height: number) {
  return clamp(Math.min(width, height) * 0.07, 28, 54);
}

function estimateWatermarkTextWidth(text: string, fontSize: number) {
  return Array.from(text).reduce((width, char) => {
    if (/\s/.test(char)) return width + fontSize * 0.34;
    if (/[ilI1|.,'`]/.test(char)) return width + fontSize * 0.32;
    if (/[MW@#%&]/.test(char)) return width + fontSize * 0.9;
    return width + fontSize * 0.62;
  }, 0);
}

function getWatermarkTiles(width: number, height: number, text: string) {
  const diagonal = Math.hypot(width, height);
  const fontSize = watermarkFontSize(width, height);
  const letterCount = Math.max(1, Array.from(text).filter((char) => !/\s/.test(char)).length);
  const textWidth = estimateWatermarkTextWidth(text, fontSize);
  const minDimension = Math.min(width, height);
  const densityFactor = clamp((letterCount - 2) / 10, 0, 1);
  const horizontalGap = minDimension * (0.16 + densityFactor * 0.34) + fontSize * (1.2 + densityFactor * 2.3);
  const verticalGap = minDimension * (0.04 + densityFactor * 0.16) + fontSize * (2.8 + densityFactor * 4.2);
  const stepX = clamp(
    textWidth + horizontalGap,
    minDimension * (0.26 + densityFactor * 0.24),
    diagonal * (0.42 + densityFactor * 0.42)
  );
  const stepY = clamp(
    verticalGap,
    minDimension * (0.18 + densityFactor * 0.16),
    minDimension * (0.34 + densityFactor * 0.28)
  );
  const tiles: { x: number; y: number }[] = [];

  for (let y = -diagonal; y <= height + diagonal; y += stepY) {
    for (let x = -diagonal; x <= width + diagonal; x += stepX) {
      tiles.push({ x, y });
    }
  }

  return { fontSize, tiles };
}

function drawWatermarkPattern(ctx: CanvasRenderingContext2D, text: string, width: number, height: number, opacity: number) {
  const { fontSize, tiles } = getWatermarkTiles(width, height, text);
  ctx.save();
  ctx.fillStyle = `rgba(148,163,184,${opacity})`;
  ctx.font = `bold italic ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const tile of tiles) {
    ctx.save();
    ctx.translate(tile.x, tile.y);
    ctx.rotate((WATERMARK_ANGLE * Math.PI) / 180);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  ctx.restore();
}

type Props = {
  onStatusMessage: (msg: string) => void;
  statusMessage?: string;
  initialIntent?: WorkspaceIntent;
};

export default function AdvancedPdfEditor({ onStatusMessage, statusMessage, initialIntent }: Props) {
  const [pages, setPages] = useState<PageData[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [annotations, setAnnotations] = useState<AdvancedAnnotation[]>([]);
  const [currentPdfFile, setCurrentPdfFile] = useState<File | null>(null);
  const [originalPageIds, setOriginalPageIds] = useState<string[]>([]);
  
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyIndexRef = useRef(-1);

  const [activeTool, setActiveTool] = useState<Tool>(() => initialToolForIntent(initialIntent));
  const [drawMode, setDrawMode] = useState<DrawMode>(() => initialDrawModeForIntent(initialIntent));
  const [drawSettings, setDrawSettings] = useState<DrawSettings>(DEFAULT_DRAW_SETTINGS);
  const [sigPadOpen, setSigPadOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [copiedAnnotation, setCopiedAnnotation] = useState<EditableAnnotation | null>(null);
  const [contextMenu, setContextMenu] = useState<AnnotationContextMenu | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const [dragState, setDragState] = useState<{id:string;pageIndex:number;startX:number;startY:number;origX:number;origY:number}|null>(null);
  const [resizeState, setResizeState] = useState<{id:string;pageIndex:number;startX:number;startY:number;origW:number;origH:number;origX:number;origY:number;handle:string}|null>(null);
  const [rotateState, setRotateState] = useState<{id:string;startX:number;startY:number;origRot:number;centerX:number;centerY:number}|null>(null);

  const [watermarkText, setWatermarkText] = useState("");
  const [showWatermarkDialog, setShowWatermarkDialog] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [protectPassword, setProtectPassword] = useState("");
  const [protectPasswordConfirm, setProtectPasswordConfirm] = useState("");
  const [showProtectPassword, setShowProtectPassword] = useState(false);
  const [showProtectDialog, setShowProtectDialog] = useState(false);
  const [protectOnDownload, setProtectOnDownload] = useState(false);
  const [flattenOnDownload, setFlattenOnDownload] = useState(initialIntent === "flatten");
  const [highlightDraw, setHighlightDraw] = useState<{pageIndex:number;startX:number;startY:number;curX:number;curY:number}|null>(null);
  const [inkDraw, setInkDraw] = useState<{ pageIndex: number; points: { x: number; y: number }[] } | null>(null);
  const [eraserPreview, setEraserPreview] = useState<{ pageIndex: number; x: number; y: number } | null>(null);
  const [exportFilename, setExportFilename] = useState("document-edited.pdf");
  const [zoomScale, setZoomScale] = useState(1);
  const [transientCrop, setTransientCrop] = useState<PageCrop>({ top: 0, right: 0, bottom: 0, left: 0 });
  const thumbnailContainerRef = useRef<HTMLDivElement>(null);

  
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollSyncFrameRef = useRef<number | null>(null);
  const isProgrammaticScrollRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadModeRef = useRef<"replace" | "append">("replace");
  const fileActionRef = useRef<PdfPickerAction>("edit");
  const autoExportAfterLoadRef = useRef<Exclude<PdfPickerAction, "edit"> | null>(null);
  const exportPdfRef = useRef<ExportPdfFn | null>(null);

  const trimmedProtectPassword = protectPassword.trim();
  const trimmedProtectPasswordConfirm = protectPasswordConfirm.trim();
  const protectPasswordValid =
    trimmedProtectPassword.length >= 6 && trimmedProtectPassword === trimmedProtectPasswordConfirm;
  const eraserSessionRef = useRef<{ deletedIds: Set<string>; baseAnnotations: AdvancedAnnotation[] } | null>(null);
  const pageSortSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );
  const pendingFilesLoadedRef = useRef(false);

  const pushState = useCallback((newAnns: AdvancedAnnotation[], newPgs: PageData[]) => {
    setHistory((prev) => {
      const h = prev.slice(0, historyIndexRef.current + 1);
      h.push({ annotations: newAnns, pages: newPgs });
      if (h.length > 50) h.shift(); // Keep 50 redos
      historyIndexRef.current = h.length - 1;
      setHistoryIndex(h.length - 1);
      return h;
    });
    setAnnotations(newAnns);
    setPages(newPgs);
  }, []);

  useEffect(() => {
    if (activeTool === "crop" && pages[currentPage]) {
      setTransientCrop(pages[currentPage].crop ?? { top: 0, right: 0, bottom: 0, left: 0 });
    }
  }, [activeTool, currentPage, pages]);

  function handleApplyCrop() {
    if (!pages[currentPage]) return;
    const nextPages = pages.map((pg, i) =>
      i === currentPage ? { ...pg, crop: transientCrop } : pg
    );
    pushState(annotations, nextPages);
    setActiveTool("select");
    onStatusMessage(`Crop applied to page ${currentPage + 1}.`);
  }

  function handleApplyToAllCrops() {
    const nextPages = pages.map((pg) => ({ ...pg, crop: transientCrop }));
    pushState(annotations, nextPages);
    setActiveTool("select");
    onStatusMessage("Crop applied to all pages.");
  }

  function handleResetCrop() {
    setTransientCrop({ top: 0, right: 0, bottom: 0, left: 0 });
    const nextPages = pages.map((pg, i) =>
      i === currentPage ? { ...pg, crop: null } : pg
    );
    pushState(annotations, nextPages);
    onStatusMessage(`Page ${currentPage + 1} crop reset.`);
  }

  function handleCancelCrop() {
    setActiveTool("select");
  }

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (historyIndexRef.current > 0) {
        const nextIdx = historyIndexRef.current - 1;
        setAnnotations(prev[nextIdx].annotations);
        setPages(prev[nextIdx].pages);
        historyIndexRef.current = nextIdx;
        setHistoryIndex(nextIdx);
      }
      return prev;
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((prev) => {
      if (historyIndexRef.current < prev.length - 1) {
        const nextIdx = historyIndexRef.current + 1;
        setAnnotations(prev[nextIdx].annotations);
        setPages(prev[nextIdx].pages);
        historyIndexRef.current = nextIdx;
        setHistoryIndex(nextIdx);
      }
      return prev;
    });
  }, []);

  const getEditableAnnotation = useCallback((id: string | null): EditableAnnotation | null => {
    if (!id) return null;
    const ann = annotations.find((a) => a.id === id);
    if (!ann || ann.kind === "watermark") return null;
    return ann;
  }, [annotations]);

  const cloneAnnotation = useCallback((ann: EditableAnnotation, pageIndex: number, offset = 0): EditableAnnotation => {
    if (ann.kind === "ink") {
      return {
        ...ann,
        id: generateId(),
        pageIndex,
        points: ann.points.map((point) => ({
          x: clamp(point.x + offset, 0, 1),
          y: clamp(point.y + offset, 0, 1),
        })),
      };
    }
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
      } else if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        setActiveTool("crop");
        setSelectedId(null);
        setEditingTextId(null);
      } else if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        setActiveTool("pan");
        setSelectedId(null);
        setEditingTextId(null);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setActiveTool("select");
        setHighlightDraw(null);
        setInkDraw(null);
        setEraserPreview(null);
      } else if (e.key === "PageDown") {
        e.preventDefault();
        selectPage(Math.min(pages.length - 1, currentPage + 1), { scrollIntoView: true });
      } else if (e.key === "PageUp") {
        e.preventDefault();
        selectPage(Math.max(0, currentPage - 1), { scrollIntoView: true });
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
  }, [undo, redo, selectedId, copiedAnnotation, annotations, pages, pushState, copyAnnotation, pasteAnnotation, currentPage]);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (scrollSyncFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollSyncFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleNewPdf = () => {
      uploadModeRef.current = "replace";
      fileInputRef.current?.click();
    };
    window.addEventListener("opendocs:new-pdf", handleNewPdf);
    return () => window.removeEventListener("opendocs:new-pdf", handleNewPdf);
  }, []);

  useEffect(() => {
    if (pages.length === 0 || !scrollContainerRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (isProgrammaticScrollRef.current) return;
      const visible = entries.find(e => e.isIntersecting);
      if (visible) {
        const idx = parseInt((visible.target as HTMLElement).dataset.pageIndex || "-1", 10);
        if (idx >= 0) setCurrentPage(idx);
      }
    }, { root: scrollContainerRef.current, rootMargin: "-10% 0px -50% 0px" });

    Object.values(pageRefs.current).forEach(el => {
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [pages]);

  useEffect(() => {
    if (!thumbnailContainerRef.current) return;
    const activeThumbnail = thumbnailContainerRef.current.querySelector(`[data-thumbnail-index="${currentPage}"]`);
    if (activeThumbnail) {
      activeThumbnail.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [currentPage]);



  const loadPdf = useCallback(async (f: File, password?: string, options?: { append?: boolean }) => {
    const append = options?.append ?? false;
    setIsLoading(true);
    onStatusMessage("Loading PDF pages...");
    try {
      const { pdfDocument, pages: loadedPages } = await loadPdfDocumentAndMetadata(f, 5.5, password);
      const pagesData: PageData[] = loadedPages.map((p) => ({
        id: generateId(),
        pdfDoc: pdfDocument,
        originalPageIndex: p.originalPageIndex,
        width: p.width,
        height: p.height,
        rotation: 0,
      }));
      const originalIds = pagesData.map((page) => page.id);

      if (append && pages.length > 0) {
        const nextPages = [...pages, ...pagesData];
        pushState(annotations, nextPages);
        setCurrentPdfFile(null);
        setOriginalPageIds([]);
        setCurrentPage(pages.length);
        setSelectedId(null);
        setEditingTextId(null);
        setCopiedAnnotation(null);
        setContextMenu(null);
        onStatusMessage(`${pagesData.length} page${pagesData.length > 1 ? "s" : ""} added.`);
      } else {
        setHistory([{ annotations: [], pages: pagesData }]);
        historyIndexRef.current = 0;
        setHistoryIndex(0);
        setCurrentPdfFile(f);
        setOriginalPageIds(originalIds);
        if (!append) {
          setExportFilename(f.name.replace(/\.pdf$/i, "") + "_edited.pdf");
        }

        onStatusMessage(`${pagesData.length} page${pagesData.length > 1 ? "s" : ""} loaded.`);
        setPages(pagesData);
        setCurrentPage(0);
        setAnnotations([]);
        setSelectedId(null);
        setEditingTextId(null);
        setCopiedAnnotation(null);
        setContextMenu(null);
        setActiveTool(initialToolForIntent(initialIntent));
        setDrawMode(initialDrawModeForIntent(initialIntent));
        setDrawSettings(DEFAULT_DRAW_SETTINGS);
        setProtectOnDownload(false);
        setFlattenOnDownload(initialIntent === "flatten");
        onStatusMessage(
          initialIntent === "flatten"
            ? "PDF loaded. Use Flatten to bake visible content into a clean export."
            : initialIntent === "unlock"
              ? "PDF loaded. Download it to save a rebuilt unlocked copy."
            : `${pagesData.length} page${pagesData.length > 1 ? "s" : ""} loaded.`
        );
      }

      setShowUnlockDialog(false);
      setUnlockPassword("");
      setUnlockError("");
      if (initialIntent === "protect" && !autoExportAfterLoadRef.current) setShowProtectDialog(true);
      if (initialIntent === "add-watermark") setShowWatermarkDialog(true);
      return true;
    } catch {
      setCurrentPdfFile(f);
      uploadModeRef.current = append ? "append" : "replace";
      setShowUnlockDialog(true);
      setUnlockError(
        password
          ? "That password did not unlock this PDF. Check the password and try again."
          : "This PDF is protected. Enter its password to unlock it."
      );
      onStatusMessage(
        password
          ? "Wrong password. Try again."
          : "Could not open that PDF. If it is locked, enter its password to unlock it."
      );
      return false;
    }
    finally { setIsLoading(false); }
  }, [annotations, initialIntent, onStatusMessage, pages, pushState]);

  usePasteFile((files) => {
    const f = files[0];
    if (f && f.type === "application/pdf") {
      void loadPdf(f, undefined, { append: pages.length > 0 });
    } else if (f) {
      onStatusMessage("Please upload a valid PDF file.");
    }
  }, isLoading || isExporting);

  useEffect(() => {
    if (pendingFilesLoadedRef.current) return;
    pendingFilesLoadedRef.current = true;

    void takePendingFiles("pdf-editor")
      .then((files) => {
        const file = files.find((item) => item.type === "application/pdf" || item.name.toLowerCase().endsWith(".pdf"));
        if (!file) return;
        onStatusMessage("Opening uploaded PDF in editor...");
        void loadPdf(file);
      })
      .catch(() => {});
  }, [loadPdf, onStatusMessage]);

  function openPdfPicker(mode: "replace" | "append") {
    uploadModeRef.current = mode;
    fileActionRef.current = "edit";
    fileInputRef.current?.click();
  }

  function openSecurePdfPicker(action: Exclude<PdfPickerAction, "edit">) {
    uploadModeRef.current = "replace";
    fileActionRef.current = action;
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const mode = uploadModeRef.current;
    const action = fileActionRef.current;
    fileActionRef.current = "edit";
    if (action === "unlock" || action === "flatten") {
      autoExportAfterLoadRef.current = action;
      if (action === "flatten") setFlattenOnDownload(true);
    }
    void loadPdf(f, undefined, { append: action === "edit" && mode === "append" }).then((loaded) => {
      if (action === "protect" && loaded) setShowProtectDialog(true);
    });
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

  function addTextAnnotation(x = 0.5, y = 0.24, pageIndex = currentPage) {
    if (!pages[pageIndex]) return;
    const textBox: AdvancedAnnotation = {
      kind: "text",
      id: generateId(),
      pageIndex,
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
    setCurrentPage(pageIndex);
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
    if (tool === "watermark") {
      if (!page) {
        onStatusMessage("Upload a PDF before adding a watermark.");
        return;
      }
      if (annotations.some((ann) => ann.kind === "watermark")) {
        pushState(annotations.filter((ann) => ann.kind !== "watermark"), pages);
        setShowWatermarkDialog(false);
        setWatermarkText("");
        setActiveTool("select");
        onStatusMessage("Watermark removed.");
        return;
      }
      setShowWatermarkDialog(true);
      return;
    }
    setActiveTool(tool);
  }

  function commitAnnotationEdits() {
    pushState(annotations, pages);
  }

  function selectPage(index: number, options?: { scrollIntoView?: boolean }) {
    setCurrentPage(index);
    setSelectedId(null);
    setContextMenu(null);
    if (editingTextId) {
      setEditingTextId(null);
      commitAnnotationEdits();
    }
    if (options?.scrollIntoView) {
      isProgrammaticScrollRef.current = true;
      window.requestAnimationFrame(() => {
        const pageEl = pageRefs.current[index];
        const scroller = scrollContainerRef.current;
        const transformRef = (window as any).__transformRef;
        if (pageEl && scroller) {
          if (transformRef && typeof transformRef.setTransform === "function") {
            const scrollerRect = scroller.getBoundingClientRect();
            const scale = transformRef.state?.scale || 1;
            
            let targetY = -(pageEl.offsetTop * scale) + (scrollerRect.height / 2) - ((pageEl.offsetHeight * scale) / 2);
            
            const wrapper = transformRef.wrapperComponent;
            const content = transformRef.contentComponent;
            if (wrapper && content) {
              const scaledHeight = content.offsetHeight * scale;
              const overscroll = 0;
              let b1Y = wrapper.offsetHeight - scaledHeight - overscroll;
              let b2Y = overscroll;
              const minY = Math.min(b1Y, b2Y);
              const maxY = Math.max(b1Y, b2Y);
              targetY = Math.max(minY, Math.min(maxY, targetY));
            }
            
            transformRef.setTransform(transformRef.state?.positionX || 0, targetY, scale, 300);
          } else {
            pageEl.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }

        setTimeout(() => {
          isProgrammaticScrollRef.current = false;
        }, 650);
      });
    }
  }

  function syncCurrentPageFromScroll() {
    if (scrollSyncFrameRef.current !== null || isProgrammaticScrollRef.current) return;
    scrollSyncFrameRef.current = window.requestAnimationFrame(() => {
      scrollSyncFrameRef.current = null;
      const scroller = scrollContainerRef.current;
      if (!scroller || pages.length === 0) return;
      const scrollerRect = scroller.getBoundingClientRect();
      const centerY = scrollerRect.top + scrollerRect.height / 2;
      let nearestIndex = currentPage;
      let nearestDistance = Number.POSITIVE_INFINITY;

      pages.forEach((_, index) => {
        const el = pageRefs.current[index];
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - centerY);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });

      if (nearestIndex !== currentPage) setCurrentPage(nearestIndex);
    });
  }

  function getRelCoords(e: React.PointerEvent | React.MouseEvent, pageIndex: number): {rx: number; ry: number} | null {
    const el = pageRefs.current[pageIndex];
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      rx: clamp((e.clientX - rect.left) / rect.width, 0, 1),
      ry: clamp((e.clientY - rect.top) / rect.height, 0, 1),
    };
  }

  function handlePageClick(e: React.MouseEvent, pageIndex: number) {
    setContextMenu(null);
    setCurrentPage(pageIndex);
    const coords = getRelCoords(e, pageIndex);
    if (!coords) return;
    if (activeTool === "pan" || activeTool === "draw") return;
    if (activeTool === "text") {
      addTextAnnotation(coords.rx, coords.ry, pageIndex);
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

  function handlePageContextMenu(e: React.MouseEvent, pageIndex: number) {
    if (pages.length === 0) return;
    e.preventDefault();
    setCurrentPage(pageIndex);
    const target = e.target as HTMLElement;
    const annotationEl = target.closest<HTMLElement>("[data-annotation-id]");
    const annotationId = annotationEl?.dataset.annotationId ?? null;
    if (annotationId) setSelectedId(annotationId);
    setContextMenu({ x: e.clientX, y: e.clientY, annotationId });
  }


  function handleDrawDown(e: React.PointerEvent, pageIndex: number) {
    if (activeTool !== "draw") return;
    const coords = getRelCoords(e, pageIndex);
    if (!coords) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setCurrentPage(pageIndex);
    if (drawMode === "highlighter") {
      setHighlightDraw({ pageIndex, startX: coords.rx, startY: coords.ry, curX: coords.rx, curY: coords.ry });
      return;
    }
    if (drawMode === "eraser") {
      eraserSessionRef.current = { deletedIds: new Set(), baseAnnotations: annotations };
      setEraserPreview({ pageIndex, x: coords.rx, y: coords.ry });
      eraseAnnotationAt(pageIndex, coords.rx, coords.ry);
      return;
    }
    setInkDraw({ pageIndex, points: [{ x: coords.rx, y: coords.ry }] });
  }

  function handleDrawMove(e: React.PointerEvent, pageIndex: number) {
    if (activeTool !== "draw") return;
    const coords = getRelCoords(e, pageIndex);
    if (!coords) return;
    if (drawMode === "highlighter" && highlightDraw?.pageIndex === pageIndex) {
      setHighlightDraw((h) => h ? { ...h, curX: coords.rx, curY: coords.ry } : null);
      return;
    }
    if (drawMode === "eraser") {
      setEraserPreview({ pageIndex, x: coords.rx, y: coords.ry });
      eraseAnnotationAt(pageIndex, coords.rx, coords.ry);
      return;
    }
    if (inkDraw?.pageIndex === pageIndex) {
      setInkDraw((draw) => draw ? { ...draw, points: [...draw.points, { x: coords.rx, y: coords.ry }] } : null);
    }
  }

  function handleDrawUp() {
    if (drawMode === "eraser") {
      finishEraseDraw();
      return;
    }
    if (highlightDraw) {
      finishHighlightDraw();
      return;
    }
    if (inkDraw) {
      finishInkDraw();
    }
  }

  function finishHighlightDraw() {
    setHighlightDraw((h) => {
      if (!h) return null;
      const startX = h.startX;
      const startY = h.startY;
      const curX = h.curX;
      const curY = h.curY;
      const w = Math.abs(curX - startX);
      const h_h = Math.abs(curY - startY);
      const cx = Math.min(startX, curX) + w/2;
      const cy = Math.min(startY, curY) + h_h/2;
  
      if (w > 0.01 && h_h > 0.005) {
        setAnnotations((a) => {
          const next = [...a, {
            kind: "highlight" as const, id: generateId(), pageIndex: h.pageIndex,
            x: cx, y: cy, w, h: h_h, rotation: 0, color: drawSettings.highlighterColor, opacity: drawSettings.highlighterOpacity,
          }];
          pushState(next, pages);
          return next;
        });
        setCurrentPage(h.pageIndex);
      }
      return null;
    });
  }

  function finishInkDraw() {
    setInkDraw((draw) => {
      if (!draw || draw.points.length < 2) return null;
      
      setAnnotations((a) => {
        const next = [...a, {
          kind: "ink" as const,
          id: generateId(),
          pageIndex: draw.pageIndex,
          points: draw.points,
          color: drawSettings.penColor,
          opacity: 1,
          strokeWidth: drawSettings.penSize,
        }];
        pushState(next, pages);
        return next;
      });
      setCurrentPage(draw.pageIndex);
      return null;
    });
  }

  function eraseAnnotationAt(pageIndex: number, rx: number, ry: number) {
    const radius = getEraserRadius(drawSettings.eraserSize);
    let erasedId: string | null = null;
    setAnnotations((prev) => {
      const target = [...prev]
        .reverse()
        .find((ann) => ann.pageIndex === pageIndex && ann.kind !== "watermark" && isAnnotationAtPoint(ann, rx, ry, radius));
      if (!target) return prev;
      erasedId = target.id;
      eraserSessionRef.current?.deletedIds.add(target.id);
      return prev.filter((ann) => ann.id !== target.id);
    });
    if (erasedId && selectedId === erasedId) setSelectedId(null);
  }

  function finishEraseDraw() {
    const session = eraserSessionRef.current;
    setEraserPreview(null);
    eraserSessionRef.current = null;
    if (!session || session.deletedIds.size === 0) return;
    setAnnotations(a => {
      pushState(a, pages);
      return a;
    });
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
      text: watermarkText.trim(), opacity: 0.055,
    }));
    const withoutWatermarks = annotations.filter((ann) => ann.kind !== "watermark");
    pushState([...withoutWatermarks, ...newAnns], pages);
    setShowWatermarkDialog(false);
    setWatermarkText("");
    setActiveTool("select");
    onStatusMessage("Repeating watermark applied to all pages.");
  }

  // --- Transform Logic ---
  function startDrag(id: string, e: React.PointerEvent) {
    if (activeTool !== "select") return;
    const ann = annotations.find((a) => a.id === id);
    if (!ann || !isBoxAnnotation(ann)) return;
    if (ann.kind === "text" && e.detail >= 2) {
      e.stopPropagation();
      setSelectedId(id);
      setEditingTextId(id);
      return;
    }
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSelectedId(id);
    setCurrentPage(ann.pageIndex);
    setDragState({ id, pageIndex: ann.pageIndex, startX: e.clientX, startY: e.clientY, origX: ann.x, origY: ann.y });
  }

  function onDragMove(e: React.PointerEvent) {
    if (!dragState) return;
    const el = pageRefs.current[dragState.pageIndex];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = (e.clientX - dragState.startX) / rect.width;
    const dy = (e.clientY - dragState.startY) / rect.height;
    setAnnotations((a) => a.map((an) =>
      an.id === dragState.id && isBoxAnnotation(an) ? { ...an, x: clamp(dragState.origX + dx, 0, 1), y: clamp(dragState.origY + dy, 0, 1) } : an
    ));
  }

  function onDragEnd() {
    if (dragState) {
      setAnnotations(a => {
        pushState(a, pages);
        return a;
      });
      setDragState(null);
    }
  }

  function startResize(id: string, e: React.PointerEvent, handle: string) {
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const ann = annotations.find((a) => a.id === id);
    if (!ann || !isBoxAnnotation(ann)) return;
    setCurrentPage(ann.pageIndex);
    setResizeState({ id, pageIndex: ann.pageIndex, startX: e.clientX, startY: e.clientY, origW: ann.w, origH: ann.h, origX: ann.x, origY: ann.y, handle });
  }

  function onResizeMove(e: React.PointerEvent) {
    if (!resizeState) return;
    const el = pageRefs.current[resizeState.pageIndex];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = (e.clientX - resizeState.startX) / rect.width;
    const dy = (e.clientY - resizeState.startY) / rect.height;
    
    setAnnotations((a) => a.map((an) => {
      if (an.id !== resizeState.id || !isBoxAnnotation(an)) return an;
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
      setAnnotations(a => {
        pushState(a, pages);
        return a;
      });
      setResizeState(null);
    }
  }

  function startRotate(id: string, e: React.PointerEvent) {
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const ann = annotations.find((a) => a.id === id);
    if (!ann || !isBoxAnnotation(ann)) return;
    const el = pageRefs.current[ann.pageIndex];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCurrentPage(ann.pageIndex);
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
      an.id === rotateState.id && isBoxAnnotation(an) ? { ...an, rotation: rotateState.origRot + delta } : an
    ));
  }

  function onRotateEnd() {
    if (rotateState) {
      setAnnotations(a => {
        pushState(a, pages);
        return a;
      });
      setRotateState(null);
    }
  }

  async function renderCurrentPdfBytes() {
    if (currentPdfFile) {
      const sourceBytes = new Uint8Array(await currentPdfFile.arrayBuffer());
      const pageExports = pages.map(pg => ({
        originalPageIndex: pg.originalPageIndex,
        rotation: pg.rotation,
        width: pg.width,
        height: pg.height,
        crop: pg.crop,
        // Optional canvas fallback not strictly needed if we just render it here,
        // but for now we skip rendering canvas if it has originalPageIndex
      }));
      
      // We need to pass canvases for pages that do NOT have originalPageIndex
      for (let i = 0; i < pages.length; i++) {
        const pg = pages[i];
        if (pg.originalPageIndex === undefined) {
          const canvas = document.createElement("canvas");
          const w = pg.rotation % 180 !== 0 ? pg.height : pg.width;
          const h = pg.rotation % 180 !== 0 ? pg.width : pg.height;
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, w, h);
            
            let imgCanvas: HTMLCanvasElement | HTMLImageElement | null = null;
            if (pg.dataUrl) {
              imgCanvas = await loadImg(pg.dataUrl);
            } else if (pg.pdfDoc && pg.originalPageIndex !== undefined) {
              const page = await pg.pdfDoc.getPage(pg.originalPageIndex + 1);
              const viewport = page.getViewport({ scale: 2.0 });
              const tmpCanvas = document.createElement("canvas");
              tmpCanvas.width = viewport.width;
              tmpCanvas.height = viewport.height;
              const tmpCtx = tmpCanvas.getContext("2d");
              if (tmpCtx) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await page.render({ canvasContext: tmpCtx, viewport } as any).promise;
              }
              imgCanvas = tmpCanvas;
            }

            if (imgCanvas) {
              ctx.save();
              ctx.translate(w / 2, h / 2);
              ctx.rotate((pg.rotation * Math.PI) / 180);
              ctx.drawImage(imgCanvas, -pg.width / 2, -pg.height / 2, pg.width, pg.height);
              ctx.restore();
            }
          }
          // @ts-expect-error - TS doesn't know about canvas property on PageDataExport
          pageExports[i].canvas = canvas;
        }
      }
      return await buildAnnotatedPdfFromSource(sourceBytes, pageExports, annotations);
    }

    // Fallback if no currentPdfFile (e.g. only appended pages without original)
    const canvases: HTMLCanvasElement[] = [];
    try {
      for (let i = 0; i < pages.length; i++) {
        const pg = pages[i];
        const canvas = document.createElement("canvas");
        const w = pg.rotation % 180 !== 0 ? pg.height : pg.width;
        const h = pg.rotation % 180 !== 0 ? pg.width : pg.height;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not create PDF canvas");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);

        let imgCanvas: HTMLCanvasElement | HTMLImageElement | null = null;
        if (pg.dataUrl) {
          imgCanvas = await loadImg(pg.dataUrl);
        } else if (pg.pdfDoc && pg.originalPageIndex !== undefined) {
          const page = await pg.pdfDoc.getPage(pg.originalPageIndex + 1);
          const viewport = page.getViewport({ scale: 2.0 });
          const tmpCanvas = document.createElement("canvas");
          tmpCanvas.width = viewport.width;
          tmpCanvas.height = viewport.height;
          const tmpCtx = tmpCanvas.getContext("2d");
          if (tmpCtx) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await page.render({ canvasContext: tmpCtx, viewport } as any).promise;
          }
          imgCanvas = tmpCanvas;
        }

        if (imgCanvas) {
          ctx.save();
          ctx.translate(w / 2, h / 2);
          ctx.rotate((pg.rotation * Math.PI) / 180);
          ctx.drawImage(imgCanvas, -pg.width / 2, -pg.height / 2, pg.width, pg.height);
          ctx.restore();
        }

        const pageAnns = annotations.filter((a) => a.pageIndex === i);
        for (const ann of pageAnns) {
          if (ann.kind === "watermark") {
            drawWatermarkPattern(ctx, ann.text, w, h, ann.opacity);
          } else if (ann.kind === "ink") {
            ctx.save();
            drawInkPath(ctx, ann, w, h);
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
              ctx.fillRect((-ann.w * w) / 2, (-ann.h * h) / 2, ann.w * w, ann.h * h);
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
      return await buildAnnotatedPdf(canvases);
    } finally {
      canvases.forEach((c) => c.remove());
    }
  }

  function downloadPdfBytes(bytes: Uint8Array, filename: string) {
    const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function canProtectOriginalPdf() {
    if (!currentPdfFile || annotations.length > 0 || pages.length !== originalPageIds.length) return false;
    return pages.every((page, index) => page.id === originalPageIds[index] && page.rotation % 360 === 0);
  }

  async function exportPdf(filename?: string, success = "PDF exported successfully.", options: ExportOptions = {}) {
    if (pages.length === 0) return;
    const shouldProtect = options.forceProtect ?? protectOnDownload;
    const shouldFlatten = options.forceFlatten ?? flattenOnDownload;
    if (shouldProtect && !protectPasswordValid) {
      onStatusMessage("Enter matching passwords with at least 6 characters before protecting the PDF.");
      return;
    }
    setIsExporting(true);
    onStatusMessage(shouldProtect ? "Protecting PDF..." : "Exporting PDF...");
    try {
      const sourceBytes =
        shouldProtect && !shouldFlatten && canProtectOriginalPdf()
          ? new Uint8Array(await currentPdfFile!.arrayBuffer())
          : await renderCurrentPdfBytes();
      const outputBytes = shouldProtect ? await encryptPDF(sourceBytes, protectPassword.trim()) : sourceBytes;
      
      const isCropped = pages.some(
        (p) => p.crop && (p.crop.top > 0 || p.crop.right > 0 || p.crop.bottom > 0 || p.crop.left > 0)
      );
      const isAnnotated = annotations.length > 0;

      let actionSuffix = "_edited";
      if (shouldProtect) actionSuffix = "_protected";
      else if (shouldFlatten) actionSuffix = "_flattened";
      else if (isCropped && !isAnnotated) actionSuffix = "_cropped";
      else if (isCropped && isAnnotated) actionSuffix = "_cropped_edited";

      const rawName = filename || exportFilename || "document.pdf";
      const cleanBase = rawName
        .replace(/\.pdf$/i, "")
        .replace(/[-_](edited|cropped|compressed|protected|flattened|unlocked)+$/gi, "");
      const outputName = `${cleanBase}${actionSuffix}.pdf`;
          
      downloadPdfBytes(outputBytes, outputName);
      onStatusMessage(
        shouldProtect ? "Protected PDF downloaded." : shouldFlatten ? "Flattened PDF downloaded." : success
      );
    } catch {
      onStatusMessage("Export failed.");
    } finally {
      setIsExporting(false);
    }
  }
  exportPdfRef.current = exportPdf;

  function toggleFlattenPdf() {
    if (pages.length === 0) {
      onStatusMessage("Upload a PDF before flattening it.");
      return;
    }
    const next = !flattenOnDownload;
    setFlattenOnDownload(next);
    onStatusMessage(next ? "Flatten will be applied when you download." : "Flatten export disabled.");
  }

  function protectPdf() {
    if (!protectPasswordValid) {
      onStatusMessage("Enter matching passwords with at least 6 characters.");
      return;
    }
    if (pages.length === 0) {
      onStatusMessage("Upload a PDF before protecting it.");
      return;
    }
    setProtectOnDownload(true);
    setShowProtectDialog(false);
    setShowProtectPassword(false);
    onStatusMessage("Protection will be applied when you download.");
  }

  async function unlockPdf() {
    const file = currentPdfFile;
    if (!file || !unlockPassword.trim()) return;
    setUnlockError("");
    const loaded = await loadPdf(file, unlockPassword.trim(), { append: uploadModeRef.current === "append" });
    if (loaded) onStatusMessage("Unlocked PDF loaded. Download it to save an unlocked copy.");
  }

  useEffect(() => {
    const action = autoExportAfterLoadRef.current;
    if (!action || isLoading || isExporting || pages.length === 0) return;

    autoExportAfterLoadRef.current = null;
    if (action === "flatten") {
      void exportPdfRef.current?.("opendocs-flattened.pdf", "Flattened PDF downloaded.", { forceFlatten: true });
      return;
    }

    void exportPdfRef.current?.("opendocs-unlocked.pdf", "Unlocked PDF downloaded.");
  }, [isExporting, isLoading, pages.length]);

  const page = pages[currentPage] ?? null;
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  function renderWorkspacePage(pageData: PageData, pageIndex: number) {
    const isCurrentPage = pageIndex === currentPage;
    const pageWidth = pageData.rotation % 180 !== 0 ? pageData.height : pageData.width;
    const pageHeight = pageData.rotation % 180 !== 0 ? pageData.width : pageData.height;
    const pageAnnotations = annotations.filter((a) => a.pageIndex === pageIndex);
    const pageCursor =
      activeTool === "pan"
        ? "cursor-grab active:cursor-grabbing"
        : activeTool === "draw"
          ? drawMode === "eraser" ? "cursor-cell" : "cursor-crosshair"
          : "cursor-default";

    return (
      <section key={pageData.id} data-page-index={pageIndex} className="mx-auto shrink-0 relative" style={{ width: "100%", maxWidth: "1200px" }}>
        <div
          ref={(el) => {
            pageRefs.current[pageIndex] = el;
          }}
          className={`relative overflow-hidden bg-white shadow-xl transition-shadow ${pageCursor} ${
            isCurrentPage ? "ring-2 ring-blue-400" : "ring-1 ring-slate-200"
          }`}
          style={{
            aspectRatio: `${pageWidth}/${pageHeight}`,
            touchAction: activeTool === "select" ? "pan-y" : "none",
            clipPath:
              pageData.crop && activeTool !== "crop" && (pageData.crop.top > 0 || pageData.crop.right > 0 || pageData.crop.bottom > 0 || pageData.crop.left > 0)
                ? `inset(${pageData.crop.top * 100}% ${pageData.crop.right * 100}% ${pageData.crop.bottom * 100}% ${pageData.crop.left * 100}%)`
                : undefined,
          }}
          onClick={(e) => handlePageClick(e, pageIndex)}
          onContextMenu={(e) => handlePageContextMenu(e, pageIndex)}
          onPointerDown={(e) => {
            setCurrentPage(pageIndex);
            handleDrawDown(e, pageIndex);
          }}
          onPointerMove={(e) => {
            handleDrawMove(e, pageIndex);
            onDragMove(e);
            onResizeMove(e);
            onRotateMove(e);
          }}
          onPointerUp={() => {
            handleDrawUp();
            onDragEnd();
            onResizeEnd();
            onRotateEnd();
          }}
          onPointerCancel={() => {
            finishEraseDraw();
            setHighlightDraw(null);
            setInkDraw(null);
            onDragEnd();
            onResizeEnd();
            onRotateEnd();
          }}
        >
          <PdfPageRenderer
            pageData={pageData}
            alt={`Page ${pageIndex + 1}`}
            className="h-full w-full object-contain pointer-events-none"
            style={{ transform: `rotate(${pageData.rotation}deg)` }}
          />

          <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden opacity-[0.08]">
            {pageAnnotations
              .filter((a): a is Extract<AdvancedAnnotation, { kind: "watermark" }> => a.kind === "watermark")
              .map((ann) => {
                const { fontSize, tiles } = getWatermarkTiles(pageWidth, pageHeight, ann.text);
                const previewFontSize = clamp((fontSize / Math.min(pageWidth, pageHeight)) * 100, 3.8, 7.2);

                return (
                  <div key={ann.id} className="absolute inset-0">
                    {tiles.map((tile, index) => (
                      <span
                        key={`${ann.id}-${index}`}
                        className="absolute whitespace-nowrap font-bold italic text-slate-500"
                        style={{
                          left: `${(tile.x / pageWidth) * 100}%`,
                          top: `${(tile.y / pageHeight) * 100}%`,
                          fontSize: `clamp(1.5rem, ${previewFontSize}vmin, 3.4rem)`,
                          transform: `translate(-50%, -50%) rotate(${WATERMARK_ANGLE}deg)`,
                        }}
                      >
                        {ann.text}
                      </span>
                    ))}
                  </div>
                );
              })}
          </div>

          {highlightDraw?.pageIndex === pageIndex && (
            <div className="absolute pointer-events-none border" style={{
              left: `${Math.min(highlightDraw.startX, highlightDraw.curX) * 100}%`,
              top: `${Math.min(highlightDraw.startY, highlightDraw.curY) * 100}%`,
              width: `${Math.abs(highlightDraw.curX - highlightDraw.startX) * 100}%`,
              height: `${Math.abs(highlightDraw.curY - highlightDraw.startY) * 100}%`,
              backgroundColor: drawSettings.highlighterColor,
              borderColor: drawSettings.highlighterColor,
              opacity: drawSettings.highlighterOpacity,
            }} />
          )}

          <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
            {pageAnnotations
              .filter((a): a is Extract<AdvancedAnnotation, { kind: "ink" }> => a.kind === "ink")
              .map((ann) => (
                <path
                  key={ann.id}
                  d={pointsToSvgPath(ann.points)}
                  fill="none"
                  stroke={ann.color}
                  strokeOpacity={ann.opacity}
                  strokeWidth={ann.strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            {inkDraw?.pageIndex === pageIndex && (
              <path
                d={pointsToSvgPath(inkDraw.points)}
                fill="none"
                stroke={drawSettings.penColor}
                strokeWidth={drawSettings.penSize}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {activeTool === "draw" && drawMode === "eraser" && eraserPreview?.pageIndex === pageIndex && (
              <circle
                cx={eraserPreview.x * 100}
                cy={eraserPreview.y * 100}
                r={getEraserRadius(drawSettings.eraserSize) * 100}
                fill="rgba(255,255,255,0.45)"
                stroke="#2563eb"
                strokeWidth={1}
                strokeDasharray="3 2"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {pageAnnotations.filter((a): a is Extract<AdvancedAnnotation, { kind: "text" | "highlight" | "signature" }> =>
            isBoxAnnotation(a)
          ).map((ann) => {
            const isSelected = selectedId === ann.id;
            return (
              <div key={ann.id} data-annotation-id={ann.id} className={`annotation-layer group absolute border ${
                activeTool === "select" ? "cursor-move pointer-events-auto" : "pointer-events-none"
              } ${isSelected ? `border-blue-400 ${ann.kind === "text" ? "bg-sky-50/70" : ""}` : "border-transparent hover:border-blue-300/80"}`}
                style={{
                  left: `${ann.x * 100}%`, top: `${ann.y * 100}%`,
                  width: `${ann.w * 100}%`, height: `${ann.h * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${ann.rotation}deg)`,
                }}
                onDoubleClick={(e) => {
                  if (ann.kind !== "text") return;
                  e.stopPropagation();
                  setCurrentPage(ann.pageIndex);
                  setSelectedId(ann.id);
                  setEditingTextId(ann.id);
                }}
                onPointerDown={(e) => startDrag(ann.id, e)}>
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
                          className="pdf-text-editor h-full w-full resize-none overflow-hidden border-none bg-sky-50/70 p-1 m-0 outline-none"
                        />
                      ) : (
                        <div
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setCurrentPage(ann.pageIndex);
                            setSelectedId(ann.id);
                            setEditingTextId(ann.id);
                          }}
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
                      className="absolute left-1/2 top-[calc(100%+14px)] z-20 flex h-11 w-12 -translate-x-1/2 items-center justify-center rounded-md bg-[#001b53] text-white shadow-lg transition hover:bg-[#00266f]"
                      aria-label="Delete annotation"
                    >
                      <TrashMiniIcon />
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => startRotate(ann.id, e)}
                      className="absolute left-[calc(100%+48px)] top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border-2 border-blue-400 bg-white text-blue-500 shadow-sm transition hover:bg-blue-50"
                      aria-label="Rotate annotation"
                    >
                      <RotateMiniIcon />
                    </button>
                  </>
                )}
              </div>
            );
          })}

          {activeTool === "crop" && isCurrentPage && (
            <PdfPageCropOverlay
              crop={transientCrop}
              pageWidth={pageWidth}
              pageHeight={pageHeight}
              onChangeCrop={setTransientCrop}
            />
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="panel h-[calc(100vh-140px)] min-h-[600px] overflow-hidden flex flex-col">
      <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
      <SignaturePad open={sigPadOpen} onApply={handleSignatureApply} onClose={() => setSigPadOpen(false)} />

      {/* Watermark dialog */}
      {showWatermarkDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-3">Add Repeating Watermark</h3>
            <input type="text" value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !watermarkText.trim()) return;
                e.preventDefault();
                handleWatermarkApply();
              }}
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

      {showUnlockDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-semibold text-slate-900">Unlock PDF</h3>
            <p className="mb-4 text-sm leading-6 text-slate-500">
              Enter the password for this PDF.
            </p>
            {currentPdfFile ? <p className="mb-3 truncate text-xs font-medium text-slate-500">{currentPdfFile.name}</p> : null}
            <label className="mb-4 block text-sm font-semibold text-slate-700">
              Password
              <input
                type="password"
                value={unlockPassword}
                onChange={(e) => {
                  setUnlockPassword(e.target.value);
                  setUnlockError("");
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || !currentPdfFile || !unlockPassword.trim() || isLoading) return;
                  e.preventDefault();
                  void unlockPdf();
                }}
                className="mt-2 block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-blue-300"
                autoFocus
              />
            </label>
            {unlockError ? <p className="-mt-2 mb-4 text-sm font-medium text-rose-600">{unlockError}</p> : null}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowUnlockDialog(false);
                  setUnlockPassword("");
                  setUnlockError("");
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void unlockPdf()}
                disabled={!currentPdfFile || !unlockPassword.trim() || isLoading}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
              >
                {isLoading ? "Opening" : "Unlock"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showProtectDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-semibold text-slate-900">Protect PDF</h3>
            <p className="mb-4 text-sm leading-6 text-slate-500">
              Protect your PDF with 128-bit AES encryption.
            </p>
            <label className="mb-4 block text-sm font-semibold text-slate-700">
              Password
              <span className="mt-2 flex overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-blue-300">
                <input
                  type={showProtectPassword ? "text" : "password"}
                  value={protectPassword}
                  onChange={(e) => {
                    setProtectPassword(e.target.value);
                    if (protectOnDownload) setProtectOnDownload(false);
                  }}
                  minLength={6}
                  className="min-w-0 flex-1 px-4 py-2.5 text-sm outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowProtectPassword((current) => !current)}
                  className="border-l border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  {showProtectPassword ? "Hide" : "Show"}
                </button>
              </span>
            </label>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Confirm password
              <input
                type={showProtectPassword ? "text" : "password"}
                value={protectPasswordConfirm}
                onChange={(e) => {
                  setProtectPasswordConfirm(e.target.value);
                  if (protectOnDownload) setProtectOnDownload(false);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || !protectPasswordValid || isExporting) return;
                  e.preventDefault();
                  protectPdf();
                }}
                minLength={6}
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-blue-300"
              />
            </label>
            <p className={`mb-4 text-sm ${protectPasswordValid ? "text-emerald-700" : "text-slate-500"}`}>
              Use at least 6 characters. Both fields must match before download.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowProtectDialog(false);
                  setShowProtectPassword(false);
                  setProtectPasswordConfirm("");
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void protectPdf()}
                disabled={!protectPasswordValid || isExporting}
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
              >
                Apply
              </button>
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
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">PDF Editor</h1>
              </div>
              <div className="flex flex-wrap gap-2">
                {initialIntent === "protect" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => openSecurePdfPicker("protect")}
                      disabled={isLoading || isExporting}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Choose PDF to protect
                    </button>
                  </>
                ) : null}
                <button type="button" onClick={() => openPdfPicker("replace")}
                  className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition">
                  Add PDF
                </button>
              </div>
            </div>

            <div 
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f && f.type === "application/pdf") {
                  void loadPdf(f, undefined, { append: pages.length > 0 });
                } else if (f) {
                  onStatusMessage("Please upload a valid PDF file.");
                }
              }}
              onClick={() => openPdfPicker("replace")}
              className="group flex min-h-[400px] cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50/50 transition">
              <div className="text-center">
                <h3 className="text-xl font-semibold text-slate-900">Drop or choose PDF</h3>
                <p className="mt-2 text-sm font-medium text-slate-400">Ctrl + V works too</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden bg-slate-100">
          <aside className="hidden h-full min-h-0 w-56 shrink-0 border-r border-slate-200 bg-slate-50 md:flex md:flex-col">
            <div className="border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Pages
            </div>
            <div ref={thumbnailContainerRef} className="min-h-0 flex-1 overflow-y-auto p-4 scroll-smooth">
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
                      onSelect={() => selectPage(i, { scrollIntoView: true })}
                      onMove={reorderPage}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              <button
                type="button"
                onClick={() => openPdfPicker("append")}
                className="mt-1 flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-2xl leading-none text-white shadow-sm transition hover:bg-blue-700"
                aria-label="Add PDF"
              >
                +
              </button>
              </div>
            </div>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm">
              <div className="w-1/3 truncate text-sm font-medium text-slate-500" aria-live="polite">
                {statusMessage}
              </div>
              <div className="flex flex-1 justify-center px-4">
                <input
                  type="text"
                  value={exportFilename}
                  onChange={(e) => setExportFilename(e.target.value)}
                  className="w-full max-w-md rounded-md border border-transparent bg-transparent px-2 py-1 text-center text-sm font-semibold text-slate-800 transition hover:border-slate-200 hover:bg-slate-50 focus:border-blue-500 focus:bg-white focus:outline-none"
                  aria-label="File name"
                  placeholder="document.pdf"
                />
              </div>
              <div className="flex w-1/3 shrink-0 items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => openPdfPicker("append")}
                  className="rounded-md border border-slate-200 bg-white px-4 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (initialIntent === "unlock") {
                      void exportPdf("document-unlocked.pdf", "Unlocked PDF downloaded.");
                    } else {
                      void exportPdf();
                    }
                  }}
                  disabled={isExporting || pages.length === 0}
                  className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {isExporting ? "Exporting..." : "Download"}
                </button>
              </div>
            </div>

            <AdvancedToolbar
              activeTool={activeTool} setActiveTool={handleToolChange}
              drawMode={drawMode} setDrawMode={setDrawMode}
              drawSettings={drawSettings} setDrawSettings={setDrawSettings}
              onRotatePage={rotatePage} onDeletePage={deletePage}
              onAddPageNumbers={addPageNumbers}
              onUnlockPdf={() => {
                if (!currentPdfFile) {
                  onStatusMessage("Upload a password-protected PDF first.");
                  return;
                }
                setUnlockError("");
                setShowUnlockDialog(true);
              }}
              onProtectPdf={() => setShowProtectDialog(true)}
              onFlattenPdf={toggleFlattenPdf}
              protectEnabled={protectOnDownload}
              flattenEnabled={flattenOnDownload}
              onUpload={() => openPdfPicker("append")}
              onDownload={() => exportPdf()}
              isExporting={isExporting}
              onNewPdf={() => openPdfPicker("replace")}
              hasPages={pages.length > 0}
              pageCount={pages.length} currentPage={currentPage}
              onPageChange={(idx) => selectPage(idx, { scrollIntoView: true })}
              annotations={annotations} onDeleteAnnotation={deleteAnnotation}
              onUpdateAnnotation={(id, updates) => {
                updateAnnotation(id, updates, true);
              }}
              selectedAnnotationId={selectedId}
              canUndo={canUndo} canRedo={canRedo} undo={undo} redo={redo}
            />

            {activeTool === "crop" && pages[currentPage] && (
              <PdfCropControlBar
                pageWidth={pages[currentPage].width}
                pageHeight={pages[currentPage].height}
                onChangeCrop={setTransientCrop}
                onApplyCrop={handleApplyCrop}
                onApplyToAll={handleApplyToAllCrops}
                onResetCrop={handleResetCrop}
                onCancel={handleCancelCrop}
              />
            )}

            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-200/60">
              {isLoading ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600"></div>
                  <div className="text-sm font-medium text-slate-500">Loading PDF pages...</div>
                </div>
              ) : (
                <>
                <TransformWrapper
                  initialScale={1}
                  minScale={0.1}
                  maxScale={5}
                  smooth={true}
                  centerOnInit={true}
                  centerZoomedOut={false}
                  wheel={{ disabled: true }}
                  panning={{ disabled: activeTool !== "pan", velocityDisabled: true }}
                  pinch={{ disabled: true }}
                  onTransform={(ref) => {
                    setZoomScale(ref.state.scale);
                    if (!isProgrammaticScrollRef.current) {
                      syncCurrentPageFromScroll();
                    }
                  }}
                >
                  {({ zoomIn, zoomOut, resetTransform, centerView, setTransform, instance }) => {
                    (window as any).__transformRef = { ...instance, setTransform };
                    const zoomWrapRef = (node: HTMLDivElement | null) => {
                      if (!node) return;
                      const nodeExt = node as HTMLDivElement & { __zoomBound?: boolean };
                      if (nodeExt.__zoomBound) return;
                      nodeExt.__zoomBound = true;
                      
                      // We add custom CSS padding `py-[120px]` so we don't need artificial overscroll in the JS logic
                      // and it naturally fixes the native Pan tool dragging bounds as well!
                      
                      node.addEventListener("wheel", (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        const { scale, positionX, positionY } = instance.state;
                        
                        if (e.ctrlKey || e.metaKey) {
                          // Zooming
                          const step = 0.05;
                          const direction = e.deltaY < 0 ? 1 : -1;
                          let newScale = Math.min(5, Math.max(0.1, scale * (1 + direction * step)));
                          
                          if (newScale !== scale) {
                            const rect = node.getBoundingClientRect();
                            const mouseX = e.clientX - rect.left;
                            const mouseY = e.clientY - rect.top;
                            
                            const targetX = (mouseX - positionX) / scale;
                            const targetY = (mouseY - positionY) / scale;
                            
                            const newPositionX = mouseX - targetX * newScale;
                            const newPositionY = mouseY - targetY * newScale;
                            
                            setTransform(newPositionX, newPositionY, newScale, 0);
                          }
                        } else {
                          // Panning
                          let newPositionX = positionX - e.deltaX;
                          let newPositionY = positionY - e.deltaY;
                          
                          const wrapper = instance.wrapperComponent;
                          const content = instance.contentComponent;
                          if (wrapper && content) {
                            const scaledWidth = content.offsetWidth * scale;
                            const scaledHeight = content.offsetHeight * scale;
                            
                            // Calculate boundaries. The CSS py-[120px] gives natural overscroll, so overscroll here is 0
                            const overscroll = 0;
                            
                            let b1X = wrapper.offsetWidth - scaledWidth - overscroll;
                            let b2X = overscroll;
                            const minX = Math.min(b1X, b2X);
                            const maxX = Math.max(b1X, b2X);
                            
                            let b1Y = wrapper.offsetHeight - scaledHeight - overscroll;
                            let b2Y = overscroll;
                            const minY = Math.min(b1Y, b2Y);
                            const maxY = Math.max(b1Y, b2Y);
                            
                            newPositionX = Math.max(minX, Math.min(maxX, newPositionX));
                            newPositionY = Math.max(minY, Math.min(maxY, newPositionY));
                          }
                          
                          setTransform(newPositionX, newPositionY, scale, 0);
                        }
                      }, { passive: false });
                    };
                    return (
                      <div className="flex-1 relative w-full h-full min-h-0 flex flex-col overflow-hidden bg-slate-200/60" ref={scrollContainerRef}>
                        <div className="absolute inset-0 flex flex-col w-full h-full outline-none" ref={zoomWrapRef}>
                          <TransformComponent wrapperClass="w-full h-full outline-none" contentClass="w-full transition-none">
                            <div className="w-full flex flex-col items-center gap-8" style={{ padding: "120px 16px" }}>
                              {pages.map((pg, index) => renderWorkspacePage(pg, index))}
                            </div>
                          </TransformComponent>
                        </div>

                          {/* Floating page indicator */}
                          <div
                            style={{
                              position: "absolute",
                              bottom: 16,
                              left: 16,
                              zIndex: 50,
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              background: "rgba(15, 23, 42, 0.82)",
                              backdropFilter: "blur(12px)",
                              WebkitBackdropFilter: "blur(12px)",
                              borderRadius: 10,
                              padding: "6px 12px",
                              boxShadow: "0 4px 24px rgba(0,0,0,0.22), 0 1px 4px rgba(0,0,0,0.12)",
                              userSelect: "none",
                              color: "#e2e8f0",
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            <span>Page {currentPage + 1} of {pages.length}</span>
                            <span style={{ color: "#60a5fa", fontWeight: 500, marginLeft: 4 }}>Editing</span>
                          </div>
                          {/* Canva-like floating zoom toolbar */}
                          <div
                            style={{
                              position: "absolute",
                              bottom: 16,
                              left: "50%",
                              transform: "translateX(-50%)",
                              zIndex: 50,
                              display: "flex",
                              alignItems: "center",
                              gap: 2,
                              background: "rgba(15, 23, 42, 0.82)",
                              backdropFilter: "blur(12px)",
                              WebkitBackdropFilter: "blur(12px)",
                              borderRadius: 10,
                              padding: "4px 6px",
                              boxShadow: "0 4px 24px rgba(0,0,0,0.22), 0 1px 4px rgba(0,0,0,0.12)",
                              userSelect: "none",
                            }}
                          >
                            <button
                              type="button"
                              title="Zoom out"
                              onClick={() => zoomOut(0.1)}
                              style={{
                                display: "flex", alignItems: "center", justifyContent: "center",
                                width: 32, height: 32, borderRadius: 7,
                                background: "transparent", border: "none",
                                color: "#e2e8f0", cursor: "pointer", fontSize: 18, fontWeight: 600,
                                transition: "background 0.15s",
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                            >
                              −
                            </button>

                            <button
                              type="button"
                              title="Reset to 100%"
                              onClick={() => {
                                resetTransform();
                                setZoomScale(1);
                              }}
                              style={{
                                display: "flex", alignItems: "center", justifyContent: "center",
                                minWidth: 52, height: 28, borderRadius: 5, padding: "0 6px",
                                background: "transparent", border: "none",
                                color: "#cbd5e1", cursor: "pointer",
                                fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                                letterSpacing: "0.01em",
                                transition: "background 0.15s",
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                            >
                              {Math.round(zoomScale * 100)}%
                            </button>

                            <button
                              type="button"
                              title="Zoom in"
                              onClick={() => zoomIn(0.1)}
                              style={{
                                display: "flex", alignItems: "center", justifyContent: "center",
                                width: 32, height: 32, borderRadius: 7,
                                background: "transparent", border: "none",
                                color: "#e2e8f0", cursor: "pointer", fontSize: 18, fontWeight: 600,
                                transition: "background 0.15s",
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                            >
                              +
                            </button>

                            <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.15)", margin: "0 2px" }} />

                            <button
                              type="button"
                              title="Fit to screen"
                              onClick={() => {
                                centerView(undefined, 300, "easeOut");
                              }}
                              style={{
                                display: "flex", alignItems: "center", justifyContent: "center",
                                width: 32, height: 32, borderRadius: 7,
                                background: "transparent", border: "none",
                                color: "#e2e8f0", cursor: "pointer",
                                transition: "background 0.15s",
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                            >
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="2" width="12" height="12" rx="2" />
                                <path d="M2 6h12M2 10h12M6 2v12M10 2v12" opacity="0.35" />
                              </svg>
                            </button>

                            <button
                              type="button"
                              title="Reset view"
                              onClick={() => {
                                resetTransform(300, "easeOut");
                                setZoomScale(1);
                              }}
                              style={{
                                display: "flex", alignItems: "center", justifyContent: "center",
                                width: 32, height: 32, borderRadius: 7,
                                background: "transparent", border: "none",
                                color: "#e2e8f0", cursor: "pointer",
                                transition: "background 0.15s",
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                            >
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 8a5 5 0 0 1 9.5-1.5" />
                                <path d="M13 8a5 5 0 0 1-9.5 1.5" />
                                <polyline points="3 3 3 6.5 6.5 6.5" />
                                <polyline points="13 13 13 9.5 9.5 9.5" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    }}
                </TransformWrapper>

                <div className="flex gap-3 overflow-x-auto pb-4 pt-2 w-full px-2 items-center md:hidden bg-white shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-40">
                  <DndContext sensors={pageSortSensors} collisionDetection={closestCenter} onDragEnd={handlePageSortEnd}>
                    <SortableContext items={pages.map((pg) => pg.id)} strategy={horizontalListSortingStrategy}>
                      {pages.map((pg, i) => (
                        <SortablePageThumbnail
                          key={pg.id}
                          page={pg}
                          index={i}
                          currentPage={currentPage}
                          pageCount={pages.length}
                          onSelect={() => selectPage(i, { scrollIntoView: true })}
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
      data-thumbnail-index={index}
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
              ? "rounded-md ring-2 ring-blue-500 shadow-md"
              : "rounded-md ring-1 ring-slate-200 hover:ring-blue-300"
        }`}
        style={thumbSize}
        aria-label={`Move or select page ${index + 1}`}
        {...attributes}
        {...listeners}
      >
        <PdfPageRenderer
          pageData={page}
          alt={`Page ${index + 1}`}
          className="h-full w-full object-cover pointer-events-none"
          style={{ transform: `rotate(${page.rotation}deg)` }}
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
          <ChevronMiniIcon dir={compact ? "left" : "up"} />
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
          <ChevronMiniIcon dir={compact ? "right" : "down"} />
        </button>
      </div>
    </div>
  );
}

function PdfPageRenderer({ pageData, className, style }: { pageData: PageData; className?: string; style?: React.CSSProperties; alt?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (!containerRef.current || isVisible) return;
    const observer = new IntersectionObserver((entries) => {
      const intersecting = entries[0].isIntersecting;
      if (intersecting) {
        setIsVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "150% 0px" });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible || rendered || !canvasRef.current) return;
    let isMounted = true;
    if (pageData.dataUrl) {
      const ctx = canvasRef.current.getContext("2d");
      const img = new Image();
      img.onload = () => {
        if (!isMounted) return;
        ctx?.drawImage(img, 0, 0, pageData.width, pageData.height);
        setRendered(true);
      };
      img.src = pageData.dataUrl;
      return () => { isMounted = false; };
    }

    if (pageData.pdfDoc && pageData.originalPageIndex !== undefined) {
      let renderTask: ReturnType<PDFPageProxy["render"]> | undefined;
      let loadedPage: PDFPageProxy | undefined;
      pageData.pdfDoc.getPage(pageData.originalPageIndex + 1).then((page: PDFPageProxy) => {
        loadedPage = page;
        if (!isMounted || !canvasRef.current) return;
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = canvasRef.current;
        // Fix: Update canvas native resolution to match the 2.0 scale viewport so it doesn't crop!
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        renderTask = page.render({ canvasContext: ctx, viewport } as any);
        renderTask.promise.then(() => {
          if (isMounted) setRendered(true);
        }).catch(() => {});
      });
      return () => {
        isMounted = false;
        renderTask?.cancel();
        loadedPage?.cleanup();
      };
    }
  }, [isVisible, rendered, pageData]);

  return (
    <div ref={containerRef} className={className} style={{ ...style, position: "relative" }}>
      {(!rendered || !isVisible) && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-slate-400">
          <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
        </div>
      )}
      {isVisible && (
        <canvas
          ref={canvasRef}
          width={pageData.width}
          height={pageData.height}
          className="h-full w-full object-contain pointer-events-none"
        />
      )}
    </div>
  );
}

function clamp(n: number, min: number, max: number) { return Math.min(max, Math.max(min, n)); }

function getEraserRadius(size: number) {
  return clamp(size / 1400, 0.006, 0.06);
}

function isBoxAnnotation(ann: AdvancedAnnotation): ann is Extract<AdvancedAnnotation, { kind: "text" | "highlight" | "signature" }> {
  return ann.kind === "text" || ann.kind === "highlight" || ann.kind === "signature";
}

function labelForAnnotation(ann: EditableAnnotation) {
  if (ann.kind === "text") return "Text box";
  if (ann.kind === "signature") return "Signature";
  if (ann.kind === "ink") return "Drawing";
  return "Highlight";
}

function isAnnotationAtPoint(ann: EditableAnnotation, rx: number, ry: number, radius: number) {
  if (ann.kind === "ink") {
    return ann.points.some((point, index) => {
      if (index === 0) return Math.hypot(point.x - rx, point.y - ry) <= radius;
      return distanceToSegment({ x: rx, y: ry }, ann.points[index - 1], point) <= radius;
    });
  }
  return (
    rx >= ann.x - ann.w / 2 - radius &&
    rx <= ann.x + ann.w / 2 + radius &&
    ry >= ann.y - ann.h / 2 - radius &&
    ry <= ann.y + ann.h / 2 + radius
  );
}

function distanceToSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number }
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq, 0, 1);
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function pointsToSvgPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return [`M ${first.x * 100} ${first.y * 100}`, ...rest.map((point) => `L ${point.x * 100} ${point.y * 100}`)].join(" ");
}

function drawInkPath(
  ctx: CanvasRenderingContext2D,
  ann: Extract<AdvancedAnnotation, { kind: "ink" }>,
  pageW: number,
  pageH: number
) {
  if (ann.points.length < 2) return;
  ctx.save();
  ctx.globalAlpha = ann.opacity;
  ctx.strokeStyle = ann.color;
  ctx.lineWidth = Math.max(1, ann.strokeWidth * (pageW / 800));
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(ann.points[0].x * pageW, ann.points[0].y * pageH);
  ann.points.slice(1).forEach((point) => {
    ctx.lineTo(point.x * pageW, point.y * pageH);
  });
  ctx.stroke();
  ctx.restore();
}

function TrashMiniIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 14h10l1-14" />
      <path d="M9 7V4h6v3" />
    </svg>
  );
}

function RotateMiniIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 4h4v4" />
      <path d="M20 8a8 8 0 1 1-2.3-5.7" />
    </svg>
  );
}

function ChevronMiniIcon({ dir }: { dir: "left" | "right" | "up" | "down" }) {
  const path =
    dir === "left"
      ? "M12 5l-5 5 5 5"
      : dir === "right"
        ? "M8 5l5 5-5 5"
        : dir === "up"
          ? "M5 12l5-5 5 5"
          : "M5 8l5 5 5-5";

  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
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
