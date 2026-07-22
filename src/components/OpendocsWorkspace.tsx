"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { getPdfFirstPagePreview, getPdfPageCount, imagesToFullPageA4PDF, mergePdfFiles, pdfToImages } from "../utils/pdfUtils";
import { isRemoteScanStorageEnabled, supabase, SUPABASE_SCANS_BUCKET, SUPABASE_SCAN_PAGES_TABLE } from "../lib/supabaseClient";
import ExportPanel from "./scanner/ExportPanel";
import ScanGrid from "./scanner/ScanGrid";
import { A4_RATIO, defaultPageEdit } from "./scanner/types";
import type { CropPoint, EditorBox, EditorFrame, ImageSize, MergeMode, PageEdit, PageFilter, PdfMergeItem, ScanItem, TransformHandle } from "./scanner/types";

type WorkspaceMode = "scan" | "pdf" | "convert" | "compress" | "advanced";
export type WorkspaceIntent =
  | "crop"
  | "add-text"
  | "add-signature"
  | "add-watermark"
  | "draw"
  | "highlight"
  | "erase"
  | "unlock"
  | "protect"
  | "flatten";

const ImageConverter = dynamic(() => import("./ImageConverter"), { ssr: false });
const PdfMergePanel = dynamic(() => import("./scanner/PdfMergePanel"), { ssr: false });
const PdfEditorModal = dynamic(() => import("./scanner/PdfEditorModal"), { ssr: false });
const AdvancedPdfEditor = dynamic(() => import("./scanner/AdvancedPdfEditor"), { ssr: false });

function generateId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 15);
}

type Props = {
  initialMode?: WorkspaceMode;
  editorIntent?: WorkspaceIntent;
};

const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;
const MAX_WORKSPACE_PDF_PAGES = 100;

function formatLimitBytes(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export default function OpendocsWorkspace({ initialMode = "scan", editorIntent }: Props) {
  const [items, setItems] = useState<ScanItem[]>([]);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(initialMode);
  const [activeEditorIntent, setActiveEditorIntent] = useState<WorkspaceIntent | undefined>(editorIntent);
  const [pdfFiles, setPdfFiles] = useState<PdfMergeItem[]>([]);
  const [pdfOrderIds, setPdfOrderIds] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Ready.");
  const [supabaseReady, setSupabaseReady] = useState(false);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [mergePreviewUrls, setMergePreviewUrls] = useState<string[]>([]);
  const SESSION_TTL_MS = 1000 * 60 * 30; // 30 minutes
  const isSupabaseConfigured = isRemoteScanStorageEnabled && supabase !== null;
  const [mergeMode, setMergeMode] = useState<MergeMode>("single");
  const [cropOpen, setCropOpen] = useState(false);
  const [cropQueue, setCropQueue] = useState<string[]>([]);
  const [cropCursor, setCropCursor] = useState(0);
  const [pdfEditorPageIndex, setPdfEditorPageIndex] = useState<number | null>(null);
  const [pdfEditorActiveId, setPdfEditorActiveId] = useState<string | null>(null);
  const [pdfEditorPreviewUrl, setPdfEditorPreviewUrl] = useState<string | null>(null);
  const [isRenderingPdfEditor, setIsRenderingPdfEditor] = useState(false);
  const [pdfEditorImageSizes, setPdfEditorImageSizes] = useState<Record<string, ImageSize>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const pdfEditorPageRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<ScanItem[]>([]);
  const pdfFilesRef = useRef<PdfMergeItem[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const supabaseUserIdRef = useRef<string | null>(null);
  const dragPdfIdRef = useRef<string | null>(null);
  const previewTokenRef = useRef<symbol | null>(null);
  const pdfEditorTokenRef = useRef<symbol | null>(null);
  const transformRef = useRef<{
    mode: "move" | "resize";
    handle?: TransformHandle;
    pointerId: number;
    startPointer: { x: number; y: number };
    startEdit: PageEdit;
    startBox: EditorBox;
    frame: EditorFrame;
  } | null>(null);
  const [draggingPdfId, setDraggingPdfId] = useState<string | null>(null);
  const [dragOverPdfId, setDragOverPdfId] = useState<string | null>(null);
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const pdfOrderItems = useMemo(() => {
    const byId = new Map(items.map((it) => [it.id, it]));
    return pdfOrderIds.map((id) => byId.get(id)).filter(Boolean) as ScanItem[];
  }, [items, pdfOrderIds]);

  const previewOrderedItems = pdfOrderItems;

  const displayItems = useMemo(() => {
    const selectedSet = new Set(pdfOrderIds);
    const unselected = items.filter((item) => !selectedSet.has(item.id));
    return [...pdfOrderItems, ...unselected];
  }, [items, pdfOrderIds, pdfOrderItems]);

  const cropTargetId = cropQueue[cropCursor] ?? null;
  const cropTarget = useMemo(
    () => (cropTargetId ? items.find((item) => item.id === cropTargetId) ?? null : null),
    [cropTargetId, items]
  );
  const pdfEditorItems = useMemo(() => {
    if (pdfEditorPageIndex === null) return [];
    if (mergeMode === "twoUp") {
      return pdfOrderItems.slice(pdfEditorPageIndex * 2, pdfEditorPageIndex * 2 + 2);
    }
    return pdfOrderItems.slice(pdfEditorPageIndex, pdfEditorPageIndex + 1);
  }, [mergeMode, pdfEditorPageIndex, pdfOrderItems]);

  const pdfEditorActiveItem = useMemo(
    () => (pdfEditorActiveId ? pdfEditorItems.find((item) => item.id === pdfEditorActiveId) ?? null : null),
    [pdfEditorActiveId, pdfEditorItems]
  );
  const pdfEditorActiveIndex = useMemo(
    () => (pdfEditorActiveId ? pdfEditorItems.findIndex((item) => item.id === pdfEditorActiveId) : -1),
    [pdfEditorActiveId, pdfEditorItems]
  );
  const pdfEditorActiveSize = pdfEditorActiveItem ? pdfEditorImageSizes[pdfEditorActiveItem.id] ?? null : null;
  const pdfEditorBox = useMemo(() => {
    if (!pdfEditorActiveItem || !pdfEditorActiveSize || pdfEditorActiveIndex < 0) return null;
    return getEditorBox(pdfEditorActiveItem, pdfEditorActiveSize, mergeMode, pdfEditorActiveIndex);
  }, [mergeMode, pdfEditorActiveIndex, pdfEditorActiveItem, pdfEditorActiveSize]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    pdfFilesRef.current = pdfFiles;
  }, [pdfFiles]);

  useEffect(() => {
    const missingPreview = pdfFiles.find((item) => !item.previewUrl && !item.previewFailed);
    if (!missingPreview) return;

    let cancelled = false;
    void getPdfFirstPagePreview(missingPreview.file)
      .then((blob) => {
        if (cancelled) return;
        const previewUrl = URL.createObjectURL(blob);
        setPdfFiles((current) =>
          current.map((item) => (item.id === missingPreview.id ? { ...item, previewUrl, previewFailed: false } : item))
        );
      })
      .catch(() => {
        if (cancelled) return;
        setPdfFiles((current) =>
          current.map((item) => (item.id === missingPreview.id ? { ...item, previewFailed: true } : item))
        );
      });

    return () => {
      cancelled = true;
    };
  }, [pdfFiles]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      const existing = sessionStorage.getItem("opendocs_session_id");
      if (existing) {
        sessionIdRef.current = existing;
      } else {
        const id = generateId();
        sessionStorage.setItem("opendocs_session_id", id);
        sessionIdRef.current = id;
      }
    } catch {
      // sessionStorage may be blocked in some environments; fall back to a ref-only id.
      sessionIdRef.current = generateId();
    }

    (async () => {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;

        if (userData.user) {
          supabaseUserIdRef.current = userData.user.id;
          setSupabaseReady(true);
          return;
        }

        const { data: signInData, error: signInError } = await supabase.auth.signInAnonymously();
        if (signInError) throw signInError;

        if (signInData.user) {
          supabaseUserIdRef.current = signInData.user.id;
          setSupabaseReady(true);
        }
      } catch {
        // If Supabase auth is blocked, we still keep the app fully functional in-memory.
        setSupabaseReady(false);
      }
    })();
  }, [isSupabaseConfigured]);

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => {
        URL.revokeObjectURL(item.previewUrl);
        if (item.originalPreviewUrl !== item.previewUrl) {
          URL.revokeObjectURL(item.originalPreviewUrl);
        }
      });
      pdfFilesRef.current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, []);

  const cleanupSessionBestEffort = useCallback(async () => {
    const userId = supabaseUserIdRef.current;
    const sessionId = sessionIdRef.current;
    if (!isSupabaseConfigured || !supabase || !supabaseReady || !userId || !sessionId) return;

    try {
      const { data: rows } = await supabase
        .from(SUPABASE_SCAN_PAGES_TABLE)
        .select("storage_path")
        .eq("user_id", userId)
        .eq("session_id", sessionId);

      const paths =
        (rows ?? [])
          .map((r: { storage_path: string | null }) => r.storage_path)
          .filter((p): p is string => typeof p === "string" && p.length > 0);

      if (paths.length > 0) {
        await supabase.storage.from(SUPABASE_SCANS_BUCKET).remove(paths);
      }

      await supabase
        .from(SUPABASE_SCAN_PAGES_TABLE)
        .delete()
        .eq("user_id", userId)
        .eq("session_id", sessionId);
    } catch {
    }
  }, [isSupabaseConfigured, supabaseReady]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabaseReady) return;

    const handler = () => {
      void cleanupSessionBestEffort();
    };

    window.addEventListener("pagehide", handler);
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("pagehide", handler);
      window.removeEventListener("beforeunload", handler);
    };
  }, [cleanupSessionBestEffort, isSupabaseConfigured, supabaseReady]);

  const generateMergePreview = useCallback(async () => {
    if (pdfOrderItems.length === 0) {
      setMergePreviewUrls([]);
      return;
    }

    const runToken = Symbol("preview");
    previewTokenRef.current = runToken;

    setIsGeneratingPreview(true);
    try {
      const previewItems =
        mergeMode === "single"
          ? pdfOrderItems.slice(0, 4)
          : pdfOrderItems.slice(0, Math.min(pdfOrderItems.length, 8));
      const renderedPages = await renderEditedPdfPages(previewItems, mergeMode, 900);
      if (previewTokenRef.current !== runToken) return;
      const previews = await Promise.all(renderedPages.map((page) => blobToDataUrl(page)));

      setMergePreviewUrls(previews);
    } catch {
      setMergePreviewUrls([]);
    } finally {
      setIsGeneratingPreview(false);
    }
  }, [mergeMode, pdfOrderItems]);

  useEffect(() => {
    if (pdfOrderIds.length === 0) {
      const timeout = window.setTimeout(() => setMergePreviewUrls([]), 0);
      return () => window.clearTimeout(timeout);
    }

    const timeout = window.setTimeout(() => {
      void generateMergePreview();
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [generateMergePreview, items, mergeMode, pdfOrderIds]);

  useEffect(() => {
    if (pdfEditorPageIndex === null || pdfEditorItems.length === 0) {
      const timeout = window.setTimeout(() => setPdfEditorPreviewUrl(null), 0);
      return () => window.clearTimeout(timeout);
    }

    const runToken = Symbol("pdf-editor");
    pdfEditorTokenRef.current = runToken;
    let nextUrl: string | null = null;
    const startTimeout = window.setTimeout(() => setIsRenderingPdfEditor(true), 0);

    void renderEditedPdfPages(pdfEditorItems, mergeMode, 900)
      .then(async (pages) => {
        if (pdfEditorTokenRef.current !== runToken) return;
        if (!pages[0]) return;
        nextUrl = await blobToDataUrl(pages[0]);
        if (pdfEditorTokenRef.current !== runToken) return;
        setPdfEditorPreviewUrl((current) => {
          return nextUrl ?? current;
        });
      })
      .finally(() => {
        if (pdfEditorTokenRef.current === runToken) {
          setIsRenderingPdfEditor(false);
        }
      });

    return () => {
      window.clearTimeout(startTimeout);
    };
  }, [pdfEditorItems, mergeMode, pdfEditorPageIndex]);

  useEffect(() => {
    if (pdfEditorPageIndex === null) return;
    if (pdfEditorItems.length === 0) {
      const timeout = window.setTimeout(() => {
        setPdfEditorPageIndex(null);
        setPdfEditorActiveId(null);
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    if (!pdfEditorActiveId || !pdfEditorItems.some((item) => item.id === pdfEditorActiveId)) {
      const timeout = window.setTimeout(() => {
        setPdfEditorActiveId(pdfEditorItems[0].id);
      }, 0);
      return () => window.clearTimeout(timeout);
    }
  }, [pdfEditorActiveId, pdfEditorItems, pdfEditorPageIndex]);

  useEffect(() => {
    if (!pdfEditorActiveItem) return;
    if (pdfEditorImageSizes[pdfEditorActiveItem.id]) return;

    let cancelled = false;
    void loadImage(pdfEditorActiveItem.previewUrl)
      .then((image) => {
        if (cancelled) return;
        setPdfEditorImageSizes((current) => ({
          ...current,
          [pdfEditorActiveItem.id]: {
            w: image.naturalWidth || image.width,
            h: image.naturalHeight || image.height,
          },
        }));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [pdfEditorActiveItem, pdfEditorImageSizes]);

  function getExtFromBlobType(type: string) {
    if (type.includes("png")) return "png";
    if (type.includes("webp")) return "webp";
    return "jpg";
  }

  async function uploadItemToSupabase(params: {
    itemId: string;
    kind: ScanItem["kind"];
    name: string;
    blob: Blob;
  }) {
    const userId = supabaseUserIdRef.current;
    const sessionId = sessionIdRef.current;
    if (!isSupabaseConfigured || !supabase || !supabaseReady || !userId || !sessionId) return null;

    const ext = getExtFromBlobType(params.blob.type || "");
    const storagePath = `${userId}/${sessionId}/${params.itemId}.${ext}`;
    const expiresAt = Date.now() + SESSION_TTL_MS;

    try {
      const contentType = params.blob.type || "image/jpeg";
      const { error: uploadError } = await supabase
        .storage
        .from(SUPABASE_SCANS_BUCKET)
        .upload(storagePath, params.blob, { contentType, upsert: false });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from(SUPABASE_SCAN_PAGES_TABLE).insert({
        id: params.itemId,
        user_id: userId,
        session_id: sessionId,
        storage_path: storagePath,
        kind: params.kind,
        name: params.name,
        created_at: new Date().toISOString(),
        expires_at: new Date(expiresAt).toISOString(),
      });

      if (insertError) {
        // Avoid orphan objects if metadata insert fails.
        await supabase.storage.from(SUPABASE_SCANS_BUCKET).remove([storagePath]).catch(() => {});
        throw insertError;
      }

      return { storagePath, expiresAt };
    } catch {
      return null;
    }
  }

  async function deleteItemFromSupabase(item: ScanItem) {
    const userId = supabaseUserIdRef.current;
    const sessionId = sessionIdRef.current;
    if (!isSupabaseConfigured || !supabase || !supabaseReady || !userId || !sessionId) return;
    if (!item.storagePath) return;

    const storagePath = item.storagePath;

    try {
      await supabase.storage.from(SUPABASE_SCANS_BUCKET).remove([storagePath]);
    } catch {
      // best-effort
    }

    try {
      await supabase
        .from(SUPABASE_SCAN_PAGES_TABLE)
        .delete()
        .eq("id", item.id)
        .eq("user_id", userId)
        .eq("session_id", sessionId);
    } catch {
      // best-effort
    }
  }

  async function addBlobItems(blobs: { blob: Blob; name: string; kind: ScanItem["kind"] }[]) {
    if (blobs.length === 0) return;

    const nextItems: ScanItem[] = blobs.map(({ blob, name, kind }) => ({
      id: generateId(),
      name,
      kind,
      file: blob,
      originalFile: blob,
      previewUrl: URL.createObjectURL(blob),
      originalPreviewUrl: URL.createObjectURL(blob),
      createdAt: Date.now(),
      storagePath: null,
      expiresAt: null,
      edit: { ...defaultPageEdit, crop: { ...defaultPageEdit.crop } },
    }));

    // Persist to Supabase (best-effort). If this fails, the app still works in-memory.
    if (isSupabaseConfigured && supabaseReady && nextItems.length > 0) {
      for (const item of nextItems) {
        const uploaded = await uploadItemToSupabase({
          itemId: item.id,
          kind: item.kind,
          name: item.name,
          blob: item.file,
        });
        if (uploaded) {
          item.storagePath = uploaded.storagePath;
          item.expiresAt = uploaded.expiresAt;
        }
      }
    }

    setItems((current) => [...nextItems, ...current]);
    setPdfOrderIds((current) => {
      const ids = nextItems.map((item) => item.id);
      return [...current, ...ids];
    });
  }

  async function handlePickedFiles(fileList: FileList | null) {
    if (!fileList?.length) return;

    const pickedFiles = Array.from(fileList);
    const oversizedFile = pickedFiles.find((file) => file.size > MAX_UPLOAD_BYTES);
    if (oversizedFile) {
      setStatusMessage(`${oversizedFile.name} is larger than ${formatLimitBytes(MAX_UPLOAD_BYTES)}. Choose a smaller file.`);
      return;
    }

    setIsProcessing(true);
    setStatusMessage("Preparing your scans...");

    try {
      const nextBlobs: { blob: Blob; name: string; kind: ScanItem["kind"] }[] = [];

      for (const file of pickedFiles) {
        if (file.type === "application/pdf") {
          const pageCount = await getPdfPageCount(file);
          if (pageCount > MAX_WORKSPACE_PDF_PAGES) {
            throw new Error("PDF_PAGE_LIMIT");
          }
          const pdfPages = await pdfToImages(file);
          pdfPages.forEach((blob, index) => {
            nextBlobs.push({
              blob,
              name: `${file.name.replace(/\.pdf$/i, "")} page ${index + 1}`,
              kind: "pdf-page",
            });
          });
          continue;
        }

        nextBlobs.push({
          blob: file,
          name: file.name,
          kind: "upload",
        });
      }

      await addBlobItems(nextBlobs);
      setStatusMessage(`${nextBlobs.length} item${nextBlobs.length > 1 ? "s" : ""} added to your workspace.`);
    } catch (error) {
      setStatusMessage(
        error instanceof Error && error.message === "PDF_PAGE_LIMIT"
          ? `PDFs are limited to ${MAX_WORKSPACE_PDF_PAGES} pages for browser processing.`
          : "Could not process one of the files. Try images or a standard PDF."
      );
    } finally {
      setIsProcessing(false);
    }
  }

  async function handlePickedPdfFiles(fileList: FileList | null) {
    if (!fileList?.length) return;

    const files = Array.from(fileList).filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (files.length === 0) {
      setStatusMessage("Choose PDF files to merge.");
      return;
    }
    const oversizedFile = files.find((file) => file.size > MAX_UPLOAD_BYTES);
    if (oversizedFile) {
      setStatusMessage(`${oversizedFile.name} is larger than ${formatLimitBytes(MAX_UPLOAD_BYTES)}. Choose a smaller PDF.`);
      return;
    }

    setWorkspaceMode("pdf");
    setIsProcessing(true);
    setStatusMessage("Reading PDF details...");

    try {
      const nextItems = await Promise.all(
        files.map(async (file) => {
          const [pageCount, previewBlob] = await Promise.all([
            getPdfPageCount(file).catch(() => null),
            getPdfFirstPagePreview(file).catch(() => null),
          ]);
          if (pageCount !== null && pageCount > MAX_WORKSPACE_PDF_PAGES) {
            throw new Error("PDF_PAGE_LIMIT");
          }

          return {
            id: generateId(),
            file,
            name: file.name,
            size: file.size,
            pageCount,
            previewUrl: previewBlob ? URL.createObjectURL(previewBlob) : null,
            previewFailed: false,
            createdAt: Date.now(),
          };
        })
      );

      setPdfFiles((current) => [...current, ...nextItems]);
      setStatusMessage(`${nextItems.length} PDF${nextItems.length === 1 ? "" : "s"} added to merge queue.`);
    } catch (error) {
      setStatusMessage(
        error instanceof Error && error.message === "PDF_PAGE_LIMIT"
          ? `PDFs are limited to ${MAX_WORKSPACE_PDF_PAGES} pages for browser processing.`
          : "Could not read one of the PDFs. Try a standard, unlocked PDF."
      );
    } finally {
      setIsProcessing(false);
    }
  }

  function handlePickedImageFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setWorkspaceMode("scan");
    void handlePickedFiles(fileList);
  }

  function removePdfFile(id: string) {
    setPdfFiles((current) => {
      const target = current.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }

  function reorderPdfFile(id: string, overId: string) {
    setPdfFiles((current) => {
      const from = current.findIndex((item) => item.id === id);
      const to = current.findIndex((item) => item.id === overId);
      if (from === -1 || to === -1 || from === to) return current;

      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function movePdfFile(id: string, direction: -1 | 1) {
    setPdfFiles((current) => {
      const from = current.findIndex((item) => item.id === id);
      if (from === -1) return current;
      const to = from + direction;
      if (to < 0 || to >= current.length) return current;

      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function exportMergedPdfs() {
    if (pdfFiles.length < 2) {
      setStatusMessage("Add at least two PDFs to merge.");
      return;
    }

    setIsProcessing(true);
    setStatusMessage("Merging PDFs...");

    try {
      const pdfBytes = await mergePdfFiles(pdfFiles.map((item) => item.file));
      const pdfBlob = new Blob([Uint8Array.from(pdfBytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(pdfBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      const firstBase = pdfFiles[0]?.name.replace(/\.pdf$/i, "") || "documents";
      anchor.download = `${firstBase}_merged.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatusMessage("Merged PDF downloaded successfully.");
    } catch {
      setStatusMessage("Could not merge the PDFs. Try unlocked PDF files.");
    } finally {
      setIsProcessing(false);
    }
  }

  function handlePdfDragStart(id: string) {
    if (!pdfOrderIds.includes(id)) return;
    dragPdfIdRef.current = id;
    setDraggingPdfId(id);
    setDragOverPdfId(id);
  }

  function handlePdfDragOver(overId: string) {
    const draggedId = dragPdfIdRef.current;
    if (!draggedId || draggedId === overId) return;

    setPdfOrderIds((current) => {
      const from = current.indexOf(draggedId);
      const to = current.indexOf(overId);
      if (from === -1 || to === -1 || from === to) return current;
      const next = [...current];
      next.splice(from, 1);
      next.splice(to, 0, draggedId);
      return next;
    });
  }

  function handlePdfDragEnd() {
    dragPdfIdRef.current = null;
    setDraggingPdfId(null);
    setDragOverPdfId(null);
  }

  function onReorderHandlePointerDown(id: string, e: React.PointerEvent<HTMLElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!pdfOrderIds.includes(id)) return;

    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    handlePdfDragStart(id);
  }

  function onReorderHandlePointerMove(e: React.PointerEvent<HTMLElement>) {
    if (!dragPdfIdRef.current) return;

    e.preventDefault();
    e.stopPropagation();

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const overCard = target?.closest<HTMLElement>("[data-pdf-card='true'][data-selected='true']");
    const overId = overCard?.dataset.pdfId;

    if (!overId) return;
    setDragOverPdfId(overId);
    handlePdfDragOver(overId);
  }

  function onReorderHandlePointerEnd(e: React.PointerEvent<HTMLElement>) {
    if (!dragPdfIdRef.current) return;

    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    handlePdfDragEnd();
  }

  function moveScanPage(id: string, direction: -1 | 1) {
    setPdfOrderIds((current) => {
      const from = current.indexOf(id);
      if (from === -1) return current;
      const to = from + direction;
      if (to < 0 || to >= current.length) return current;

      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setMergePreviewUrls([]);
  }

  function startCropForOne(_itemId?: string) {
    setActiveEditorIntent("crop");
    setWorkspaceMode("advanced");
    setStatusMessage("Opening advanced 8-handle PDF cropper...");
  }

  function removeItem(id: string) {
    const target = itemsRef.current.find((item) => item.id === id) ?? null;
    setItems((current) => {
      const target = current.find((item) => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        if (target.originalPreviewUrl !== target.previewUrl) URL.revokeObjectURL(target.originalPreviewUrl);
      }
      return current.filter((item) => item.id !== id);
    });

    setPdfOrderIds((current) => current.filter((itemId) => itemId !== id));
    setPdfEditorActiveId((current) => (current === id ? null : current));

    if (target) {
      void deleteItemFromSupabase(target);
    }
  }

  function openPdfPageEditor(pageIndex: number) {
    const pageItems =
      mergeMode === "twoUp"
        ? pdfOrderItems.slice(pageIndex * 2, pageIndex * 2 + 2)
        : pdfOrderItems.slice(pageIndex, pageIndex + 1);
    if (pageItems.length === 0) return;
    setPdfEditorPageIndex(pageIndex);
    setPdfEditorActiveId(pageItems[0].id);
    setStatusMessage("Adjust the A4 PDF page before downloading.");
  }

  function closePdfPageEditor() {
    setPdfEditorPageIndex(null);
    setPdfEditorActiveId(null);
    setPdfEditorPreviewUrl(null);
  }

  function updatePageEdit(
    id: string,
    patch: Partial<Omit<PageEdit, "crop">> & { crop?: Partial<PageEdit["crop"]> }
  ) {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          edit: {
            ...item.edit,
            ...patch,
            crop: patch.crop ? { ...item.edit.crop, ...patch.crop } : item.edit.crop,
          },
        };
      })
    );
    setMergePreviewUrls([]);
  }

  function resetPageEdit(id: string) {
    updatePageEdit(id, { ...defaultPageEdit, crop: { ...defaultPageEdit.crop } });
  }

  function swapPdfEditorSlots() {
    if (pdfEditorPageIndex === null || mergeMode !== "twoUp") return;
    const firstIndex = pdfEditorPageIndex * 2;
    setPdfOrderIds((current) => {
      if (!current[firstIndex] || !current[firstIndex + 1]) return current;
      const next = [...current];
      [next[firstIndex], next[firstIndex + 1]] = [next[firstIndex + 1], next[firstIndex]];
      return next;
    });
    setMergePreviewUrls([]);
  }

  function getEditorPointer(e: React.PointerEvent) {
    const el = pdfEditorPageRef.current;
    if (!el) return { x: e.clientX, y: e.clientY };
    const rect = el.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function beginTransform(e: React.PointerEvent<HTMLDivElement>, mode: "move" | "resize", handle?: TransformHandle) {
    if (!pdfEditorActiveItem || !pdfEditorBox || !pdfEditorActiveSize || pdfEditorActiveIndex < 0) return;
    e.preventDefault();
    e.stopPropagation();
    const frame = getEditorFrame(mergeMode, pdfEditorActiveIndex);
    transformRef.current = {
      mode,
      handle,
      pointerId: e.pointerId,
      startPointer: getEditorPointer(e),
      startEdit: pdfEditorActiveItem.edit,
      startBox: pdfEditorBox,
      frame,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleTransformMove(e: React.PointerEvent<HTMLDivElement>) {
    const transform = transformRef.current;
    if (!transform || !pdfEditorActiveItem) return;
    const rect = pdfEditorPageRef.current?.getBoundingClientRect();
    if (!rect) return;

    const pointer = getEditorPointer(e);
    const dx = pointer.x - transform.startPointer.x;
    const dy = pointer.y - transform.startPointer.y;
    const frameW = transform.frame.w * rect.width;
    const frameH = transform.frame.h * rect.height;

    if (transform.mode === "move") {
      updatePageEdit(pdfEditorActiveItem.id, {
        offsetX: clamp(transform.startEdit.offsetX + dx / frameW, -1.2, 1.2),
        offsetY: clamp(transform.startEdit.offsetY + dy / frameH, -1.2, 1.2),
      });
      return;
    }

    const boxCenter = {
      x: (transform.startBox.x + transform.startBox.w / 2) * rect.width,
      y: (transform.startBox.y + transform.startBox.h / 2) * rect.height,
    };
    const startCorner = getBoxCorner(transform.startBox, transform.handle ?? "se", rect);
    const startDistance = Math.max(16, Math.hypot(startCorner.x - boxCenter.x, startCorner.y - boxCenter.y));
    const nextDistance = Math.max(16, Math.hypot(pointer.x - boxCenter.x, pointer.y - boxCenter.y));
    updatePageEdit(pdfEditorActiveItem.id, {
      zoom: clamp(transform.startEdit.zoom * (nextDistance / startDistance), 0.25, 4),
    });
  }

  function endTransform(e?: React.PointerEvent<HTMLDivElement>) {
    if (e && transformRef.current?.pointerId === e.pointerId) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
    transformRef.current = null;
  }

  async function exportPdf() {
    if (pdfOrderItems.length === 0) {
      setStatusMessage("Select pages to merge.");
      return;
    }

    setIsProcessing(true);
    setStatusMessage("Building your PDF...");
    try {
      const renderedPages = await renderEditedPdfPages(pdfOrderItems, mergeMode, 1800);
      const pdfBytes = await imagesToFullPageA4PDF(renderedPages);
      const pdfBlob = new Blob([Uint8Array.from(pdfBytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(pdfBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      const firstItemName = items[0]?.name.replace(/\.[^/.]+$/, "") || "document";
      const actionSuffix = mergeMode === "twoUp" ? "_two_up" : "_exported";
      anchor.download = `${firstItemName}${actionSuffix}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatusMessage("PDF downloaded successfully.");
    } catch {
      setStatusMessage("Could not build the PDF. Try fewer pages or smaller images.");
    } finally {
      setIsProcessing(false);
    }
  }


  return (
    <div className="min-h-screen px-4 py-4 text-foreground sm:px-6 lg:px-8">
      {!isClient ? (
        <div className="mx-auto max-w-7xl glass-panel p-8 text-sm text-muted">
          Loading OpenDocs...
        </div>
      ) : null}
      {isClient ? (
        <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(event) => {
          void handlePickedFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*,.avif,.bmp,.gif,.heic,.heif,.jpg,.jpeg,.png,.svg,.tif,.tiff,.webp"
        multiple
        className="hidden"
        onChange={(event) => {
          handlePickedImageFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={(event) => {
          void handlePickedPdfFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <div className="mx-auto max-w-7xl">
        {workspaceMode !== "advanced" && (
          <div className="mb-6 glass-panel px-5 py-4 text-sm font-medium text-foreground shadow-sm transition-all duration-300" role="status" aria-live="polite">
            <span className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent"></span>
              </span>
              {statusMessage}
            </span>
          </div>
        )}
        <main className="space-y-5">
          {workspaceMode === "scan" ? (
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <ScanGrid
                items={items}
                displayItems={displayItems}
                pdfOrderIds={pdfOrderIds}
                mergeMode={mergeMode}
                draggingPdfId={draggingPdfId}
                dragOverPdfId={dragOverPdfId}
                onReorderHandlePointerDown={onReorderHandlePointerDown}
                onReorderHandlePointerMove={onReorderHandlePointerMove}
                onReorderHandlePointerEnd={onReorderHandlePointerEnd}
                moveScanPage={moveScanPage}
                startCropForOne={startCropForOne}
                removeItem={removeItem}
                onAddScans={(files) => {
                  if (files && files.length > 0) {
                    void handlePickedFiles(files);
                    return;
                  }
                  fileInputRef.current?.click();
                }}
                onAddPhotos={(files) => {
                  if (files && files.length > 0) {
                    void handlePickedFiles(files);
                    return;
                  }
                  photoInputRef.current?.click();
                }}
                isProcessing={isProcessing}
              />
              <ExportPanel
                mergeMode={mergeMode}
                setMergeMode={setMergeMode}
                pdfOrderItems={pdfOrderItems}
                previewOrderedItems={previewOrderedItems}
                mergePreviewUrls={mergePreviewUrls}
                isGeneratingPreview={isGeneratingPreview}
                isProcessing={isProcessing}
                statusMessage={statusMessage}
                exportPdf={exportPdf}
                openPdfPageEditor={openPdfPageEditor}
              />
            </section>
          ) : workspaceMode === "pdf" ? (
            <PdfMergePanel
              pdfFiles={pdfFiles}
              isProcessing={isProcessing}
              onAddPdfs={(files) => {
                if (files && files.length > 0) {
                  void handlePickedPdfFiles(files);
                  return;
                }
                pdfInputRef.current?.click();
              }}
              onAddImages={(files) => {
                if (files && files.length > 0) {
                  handlePickedImageFiles(files);
                  return;
                }
                setWorkspaceMode("scan");
                photoInputRef.current?.click();
              }}
              onMergePdfs={exportMergedPdfs}
              onRemovePdf={removePdfFile}
              onMovePdf={movePdfFile}
              onReorderPdf={reorderPdfFile}
            />
          ) : workspaceMode === "advanced" ? (
            <AdvancedPdfEditor onStatusMessage={setStatusMessage} statusMessage={statusMessage} initialIntent={activeEditorIntent ?? editorIntent} />
          ) : (
            <ImageConverter purpose={workspaceMode === "compress" ? "compress" : "convert"} />
          )}
        </main>
      </div>



      <PdfEditorModal
        open={pdfEditorPageIndex !== null}
        pageIndex={pdfEditorPageIndex}
        mergeMode={mergeMode}
        pdfEditorPageRef={pdfEditorPageRef}
        pdfEditorPreviewUrl={pdfEditorPreviewUrl}
        isRenderingPdfEditor={isRenderingPdfEditor}
        pdfEditorBox={pdfEditorBox}
        pdfEditorItems={pdfEditorItems}
        pdfEditorActiveId={pdfEditorActiveId}
        pdfEditorActiveItem={pdfEditorActiveItem}
        closePdfPageEditor={closePdfPageEditor}
        setPdfEditorActiveId={setPdfEditorActiveId}
        startCropForOne={startCropForOne}
        swapPdfEditorSlots={swapPdfEditorSlots}
        resetPageEdit={resetPageEdit}
        updatePageEdit={updatePageEdit}
        beginTransform={beginTransform}
        handleTransformMove={handleTransformMove}
        endTransform={endTransform}
      />

        </>
      ) : null}
    </div>
  );
}

async function renderEditedPdfPages(
  items: ScanItem[],
  mergeMode: "single" | "twoUp",
  width: number
) {
  const pages: Blob[] = [];

  if (mergeMode === "single") {
    for (const item of items) {
      const pageRatio = await getEditedItemAspectRatio(item);
      const canvasWidth = pageRatio >= 1 ? width : Math.round(width * pageRatio);
      const canvasHeight = pageRatio >= 1 ? Math.round(width / pageRatio) : width;
      const canvas = createA4Canvas(canvasWidth, canvasHeight);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;

      drawPageBackground(ctx, canvasWidth, canvasHeight);
      await drawEditedItem(ctx, item, {
        x: 0,
        y: 0,
        w: canvasWidth,
        h: canvasHeight,
      });

      pages.push(await canvasToBlob(canvas));
    }
    return pages;
  }

  const height = Math.round(width / A4_RATIO);
  for (let i = 0; i < items.length; i += 2) {
    const canvas = createA4Canvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    drawPageBackground(ctx, width, height);

    const marginX = width * 0.07;
    const marginY = height * 0.055;
    const gap = height * 0.035;
    const frameW = width - marginX * 2;
    const frameH = (height - marginY * 2 - gap) / 2;

    if (items[i]) {
      await drawEditedItem(ctx, items[i], { x: marginX, y: marginY, w: frameW, h: frameH });
    }

    if (items[i + 1]) {
      await drawEditedItem(ctx, items[i + 1], {
        x: marginX,
        y: marginY + frameH + gap,
        w: frameW,
        h: frameH,
      });
    }

    pages.push(await canvasToBlob(canvas));
  }

  return pages;
}

async function getEditedItemAspectRatio(item: ScanItem) {
  const image = await loadImage(item.previewUrl);
  const imageSize = {
    w: image.naturalWidth || image.width,
    h: image.naturalHeight || image.height,
  };
  const crop = item.edit.crop;
  const documentCropSize = item.edit.documentCrop ? getDocumentCropSize(item.edit.documentCrop.points, imageSize) : null;
  const contentW = documentCropSize?.w ?? imageSize.w * Math.max(0.04, 1 - crop.left - crop.right);
  const contentH = documentCropSize?.h ?? imageSize.h * Math.max(0.04, 1 - crop.top - crop.bottom);
  const normalizedRotation = ((item.edit.rotation % 360) + 360) % 360;
  const ratio = normalizedRotation === 90 || normalizedRotation === 270 ? contentH / contentW : contentW / contentH;
  return clamp(ratio, 0.2, 5);
}

function createA4Canvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function getEditorFrame(mergeMode: "single" | "twoUp", slotIndex: number): EditorFrame {
  if (mergeMode === "single") {
    return { x: 0.08, y: 0.065, w: 0.84, h: 0.87 };
  }

  const marginX = 0.07;
  const marginY = 0.055;
  const gap = 0.035;
  const frameH = (1 - marginY * 2 - gap) / 2;

  return {
    x: marginX,
    y: slotIndex === 0 ? marginY : marginY + frameH + gap,
    w: 1 - marginX * 2,
    h: frameH,
  };
}

function getDocumentCropSize(points: [CropPoint, CropPoint, CropPoint, CropPoint], imageSize: ImageSize): ImageSize {
  const [tl, tr, br, bl] = points;
  const top = Math.hypot((tr.x - tl.x) * imageSize.w, (tr.y - tl.y) * imageSize.h);
  const bottom = Math.hypot((br.x - bl.x) * imageSize.w, (br.y - bl.y) * imageSize.h);
  const left = Math.hypot((bl.x - tl.x) * imageSize.w, (bl.y - tl.y) * imageSize.h);
  const right = Math.hypot((br.x - tr.x) * imageSize.w, (br.y - tr.y) * imageSize.h);
  return {
    w: Math.max(1, (top + bottom) / 2),
    h: Math.max(1, (left + right) / 2),
  };
}

function getEditorBox(
  item: ScanItem,
  imageSize: ImageSize,
  mergeMode: "single" | "twoUp",
  slotIndex: number
): EditorBox {
  const frame = getEditorFrame(mergeMode, slotIndex);
  const crop = item.edit.crop;
  const cropLeft = clamp(crop.left, 0, 0.48);
  const cropTop = clamp(crop.top, 0, 0.48);
  const cropRight = clamp(crop.right, 0, 0.48);
  const cropBottom = clamp(crop.bottom, 0, 0.48);
  const documentCropSize = item.edit.documentCrop ? getDocumentCropSize(item.edit.documentCrop.points, imageSize) : null;
  const sourceW = documentCropSize?.w ?? Math.max(1, imageSize.w * (1 - cropLeft - cropRight));
  const sourceH = documentCropSize?.h ?? Math.max(1, imageSize.h * (1 - cropTop - cropBottom));
  const pageHeightForWidthOne = 1 / A4_RATIO;
  const sourceRatio = sourceW / sourceH;
  const frameRatio = frame.w / (frame.h * pageHeightForWidthOne);
  const fitByWidth = sourceRatio > frameRatio;

  const baseW = fitByWidth ? frame.w : frame.h * pageHeightForWidthOne * sourceRatio;
  const baseH = fitByWidth ? frame.w / sourceRatio / pageHeightForWidthOne : frame.h;
  const w = baseW * item.edit.zoom;
  const h = baseH * item.edit.zoom;
  const centerX = frame.x + frame.w / 2 + item.edit.offsetX * frame.w;
  const centerY = frame.y + frame.h / 2 + item.edit.offsetY * frame.h;

  return {
    x: centerX - w / 2,
    y: centerY - h / 2,
    w,
    h,
    rotation: item.edit.rotation,
  };
}

function getBoxCorner(box: EditorBox, handle: TransformHandle, rect: DOMRect) {
  const x = handle.includes("w") ? box.x : box.x + box.w;
  const y = handle.includes("n") ? box.y : box.y + box.h;
  return { x: x * rect.width, y: y * rect.height };
}

function drawPageBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
}

async function drawEditedItem(
  ctx: CanvasRenderingContext2D,
  item: ScanItem,
  frame: { x: number; y: number; w: number; h: number }
) {
  const image = await loadImage(item.previewUrl);
  const cropLongEdge = Math.max(720, Math.min(1800, Math.ceil(Math.max(frame.w, frame.h) * 1.5)));
  const croppedCanvas = item.edit.documentCrop
    ? await import("../utils/documentCrop").then((mod) =>
        mod.cropImageWithDocumentCrop(image, item.edit.documentCrop!, cropLongEdge)
      )
    : null;
  const sourceImage = croppedCanvas ?? image;
  const crop = item.edit.crop;
  const cropLeft = croppedCanvas ? 0 : clamp(crop.left, 0, 0.48);
  const cropTop = croppedCanvas ? 0 : clamp(crop.top, 0, 0.48);
  const cropRight = croppedCanvas ? 0 : clamp(crop.right, 0, 0.48);
  const cropBottom = croppedCanvas ? 0 : clamp(crop.bottom, 0, 0.48);

  const naturalW = croppedCanvas ? croppedCanvas.width : image.naturalWidth || image.width;
  const naturalH = croppedCanvas ? croppedCanvas.height : image.naturalHeight || image.height;
  const sx = naturalW * cropLeft;
  const sy = naturalH * cropTop;
  const sw = Math.max(1, naturalW * (1 - cropLeft - cropRight));
  const sh = Math.max(1, naturalH * (1 - cropTop - cropBottom));

  const fitScale = Math.min(frame.w / sw, frame.h / sh);
  const drawW = sw * fitScale * item.edit.zoom;
  const drawH = sh * fitScale * item.edit.zoom;
  const centerX = frame.x + frame.w / 2 + item.edit.offsetX * frame.w;
  const centerY = frame.y + frame.h / 2 + item.edit.offsetY * frame.h;

  ctx.save();
  ctx.beginPath();
  ctx.rect(frame.x, frame.y, frame.w, frame.h);
  ctx.clip();
  ctx.translate(centerX, centerY);
  ctx.rotate((item.edit.rotation * Math.PI) / 180);
  ctx.filter = getCanvasFilter(item.edit.filter);
  ctx.drawImage(sourceImage, sx, sy, sw, sh, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
  ctx.filter = "none";
  croppedCanvas?.remove();

  if (item.edit.filter === "bw" || item.edit.filter === "enhanced") {
    applyScannerThreshold(ctx, frame, item.edit.filter);
  }
}

function getCanvasFilter(filter: PageFilter) {
  if (filter === "grayscale") return "grayscale(1)";
  if (filter === "bw") return "grayscale(1) contrast(1.8)";
  if (filter === "enhanced") return "grayscale(1) contrast(2.4) brightness(1.08)";
  return "none";
}

function applyScannerThreshold(
  ctx: CanvasRenderingContext2D,
  frame: { x: number; y: number; w: number; h: number },
  filter: Extract<PageFilter, "bw" | "enhanced">
) {
  const x = Math.max(0, Math.round(frame.x));
  const y = Math.max(0, Math.round(frame.y));
  const w = Math.max(1, Math.round(frame.w));
  const h = Math.max(1, Math.round(frame.h));
  const imageData = ctx.getImageData(x, y, w, h);
  const data = imageData.data;
  const threshold = filter === "enhanced" ? 185 : 150;

  for (let i = 0; i < data.length; i += 4) {
    const luminance = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const value = luminance > threshold ? 255 : 0;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }

  ctx.putImageData(imageData, x, y);
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to render PDF page"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      0.94
    );
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read preview"));
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image failed to load"));
    image.src = src;
  });
}
