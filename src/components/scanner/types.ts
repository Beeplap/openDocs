"use client";

export type PageFilter = "none" | "grayscale" | "bw" | "enhanced";
export type CropPoint = { x: number; y: number };
export type DocumentCrop = {
  points: [CropPoint, CropPoint, CropPoint, CropPoint];
};

export type PageEdit = {
  offsetX: number;
  offsetY: number;
  zoom: number;
  rotation: number;
  documentCrop: DocumentCrop | null;
  crop: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  filter: PageFilter;
};

export type ScanItem = {
  id: string;
  name: string;
  kind: "upload" | "camera" | "pdf-page";
  file: Blob;
  originalFile: Blob;
  previewUrl: string;
  originalPreviewUrl: string;
  createdAt: number;
  storagePath?: string | null;
  expiresAt?: number | null;
  edit: PageEdit;
};

export type PdfMergeItem = {
  id: string;
  file: File;
  name: string;
  size: number;
  pageCount: number | null;
  previewUrl: string | null;
  previewFailed?: boolean;
  createdAt: number;
};

export type ImageSize = { w: number; h: number };
export type EditorFrame = { x: number; y: number; w: number; h: number };
export type EditorBox = EditorFrame & { rotation: number };
export type TransformHandle = "nw" | "ne" | "se" | "sw";
export type MergeMode = "single" | "twoUp";
export type CollageLayout = "grid" | "story" | "strip";

export type SignatureStamp = {
  id: string;
  dataUrl: string;     // base64 PNG of the drawn signature
  pageIndex: number;   // 0-based PDF page index
  x: number;           // 0..1 relative to page width
  y: number;           // 0..1 relative to page height
  w: number;           // relative width (0..1)
  h: number;           // relative height (0..1)
  opacity: number;     // 0..1
};

export type AdvancedAnnotation =
  | { kind: "text"; id: string; pageIndex: number; x: number; y: number; w: number; h: number; rotation: number; text: string; fontSize: number; fontFamily: string; color: string; bold: boolean; italic: boolean }
  | { kind: "highlight"; id: string; pageIndex: number; x: number; y: number; w: number; h: number; rotation: number; color: string; opacity: number }
  | { kind: "signature"; id: string; pageIndex: number; x: number; y: number; w: number; h: number; rotation: number; dataUrl: string; opacity: number; color: string; strokeWidth: number }
  | { kind: "watermark"; id: string; pageIndex: number; text: string; opacity: number };

export const A4_RATIO = 595.28 / 841.89;

export const defaultPageEdit: PageEdit = {
  offsetX: 0,
  offsetY: 0,
  zoom: 1,
  rotation: 0,
  documentCrop: null,
  crop: { top: 0, right: 0, bottom: 0, left: 0 },
  filter: "none",
};

export const filterOptions: { id: PageFilter; label: string }[] = [
  { id: "none", label: "Original" },
  { id: "grayscale", label: "Grayscale" },
  { id: "bw", label: "Black & white" },
  { id: "enhanced", label: "Enhanced B/W" },
];
