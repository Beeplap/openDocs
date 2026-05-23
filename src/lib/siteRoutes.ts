import type { Metadata } from "next";
import type { WorkspaceIntent } from "../components/OpendocsWorkspace";

export type WorkspaceMode = "scan" | "pdf" | "convert" | "advanced";
export type ToolSectionId = "scan" | "organize" | "convert" | "edit" | "secure";

export type ToolRoute = {
  path: string;
  title: string;
  description: string;
  mode: WorkspaceMode;
  intent?: WorkspaceIntent;
  priority: number;
  changeFrequency: "weekly" | "monthly";
  related: string[];
};

export type ToolNavGroup = {
  id: ToolSectionId;
  label: string;
  description: string;
  items: string[];
};

export const siteName = "Opendocs";
export const siteTitle = "Opendocs - Open-source and client side document manager";
export const siteDescription =
  "Opendocs is an open-source, client-side document manager for scanning, merging, converting, and editing documents in your browser.";

export function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://opendocs.app").replace(/\/$/, "");
}

export const toolRoutes: ToolRoute[] = [
  {
    path: "/",
    title: "Open-source and client side document manager",
    description: siteDescription,
    mode: "scan",
    priority: 1,
    changeFrequency: "weekly",
    related: ["/merge-images-pdf", "/merge-pdfs", "/convert", "/pdf-editor"],
  },
  {
    path: "/merge-images-pdf",
    title: "Merge images to PDF",
    description: "Create clean PDFs from images, photos, and scanned pages.",
    mode: "scan",
    priority: 0.95,
    changeFrequency: "weekly",
    related: ["/merge-images-pdf/crop", "/merge-images-pdf/reorder-pages", "/merge-images-pdf/two-up", "/merge-pdfs"],
  },
  {
    path: "/merge-images-pdf/crop",
    title: "Crop scanned pages",
    description: "Crop scanned images and document pages before export.",
    mode: "scan",
    priority: 0.78,
    changeFrequency: "monthly",
    related: ["/merge-images-pdf", "/merge-images-pdf/reorder-pages", "/merge-images-pdf/two-up"],
  },
  {
    path: "/merge-images-pdf/reorder-pages",
    title: "Reorder scanned pages",
    description: "Arrange scanned pages and images in the right order.",
    mode: "scan",
    priority: 0.78,
    changeFrequency: "monthly",
    related: ["/merge-images-pdf", "/merge-pdfs/reorder-pages", "/pdf-editor"],
  },
  {
    path: "/merge-images-pdf/two-up",
    title: "Create two-up PDF pages",
    description: "Place two scanned pages on one PDF sheet.",
    mode: "scan",
    priority: 0.72,
    changeFrequency: "monthly",
    related: ["/merge-images-pdf", "/merge-pdfs", "/convert"],
  },
  {
    path: "/merge-pdfs",
    title: "Merge PDFs",
    description: "Combine multiple PDF files into one document.",
    mode: "pdf",
    priority: 0.95,
    changeFrequency: "weekly",
    related: ["/merge-pdfs/reorder-pages", "/merge-pdfs/combine-pdfs", "/merge-images-pdf"],
  },
  {
    path: "/merge-pdfs/reorder-pages",
    title: "Reorder PDF files",
    description: "Drag PDF files into the right order before merging.",
    mode: "pdf",
    priority: 0.78,
    changeFrequency: "monthly",
    related: ["/merge-pdfs", "/merge-images-pdf/reorder-pages", "/pdf-editor"],
  },
  {
    path: "/merge-pdfs/combine-pdfs",
    title: "Combine PDF files",
    description: "Join PDF files into one clean document.",
    mode: "pdf",
    priority: 0.78,
    changeFrequency: "monthly",
    related: ["/merge-pdfs", "/convert", "/merge-images-pdf"],
  },
  {
    path: "/convert",
    title: "Convert documents and images",
    description: "Convert images and PDF files to PDF, JPG, PNG, or WEBP.",
    mode: "convert",
    priority: 0.9,
    changeFrequency: "weekly",
    related: ["/convert/pdf-to-jpg", "/convert/jpg-to-pdf", "/convert/heic-to-jpg", "/convert/compress-pdf"],
  },
  {
    path: "/convert/pdf-to-jpg",
    title: "Convert PDF to JPG",
    description: "Turn PDF pages into high-quality JPG images.",
    mode: "convert",
    priority: 0.76,
    changeFrequency: "monthly",
    related: ["/convert", "/convert/pdf-to-png", "/merge-images-pdf"],
  },
  {
    path: "/convert/pdf-to-png",
    title: "Convert PDF to PNG",
    description: "Export PDF pages as sharp PNG images.",
    mode: "convert",
    priority: 0.72,
    changeFrequency: "monthly",
    related: ["/convert", "/convert/pdf-to-jpg", "/convert/png-to-pdf"],
  },
  {
    path: "/convert/jpg-to-pdf",
    title: "Convert JPG to PDF",
    description: "Convert JPG images into PDF documents.",
    mode: "convert",
    priority: 0.76,
    changeFrequency: "monthly",
    related: ["/convert", "/convert/png-to-pdf", "/merge-images-pdf"],
  },
  {
    path: "/convert/png-to-pdf",
    title: "Convert PNG to PDF",
    description: "Create PDF files from PNG images.",
    mode: "convert",
    priority: 0.72,
    changeFrequency: "monthly",
    related: ["/convert", "/convert/jpg-to-pdf", "/merge-images-pdf"],
  },
  {
    path: "/convert/heic-to-jpg",
    title: "Convert HEIC to JPG",
    description: "Convert HEIC or HEIF images to JPG.",
    mode: "convert",
    priority: 0.72,
    changeFrequency: "monthly",
    related: ["/convert", "/convert/jpg-to-pdf", "/merge-images-pdf"],
  },
  {
    path: "/convert/compress-pdf",
    title: "Compress PDF",
    description: "Reduce PDF size with adjustable quality settings.",
    mode: "convert",
    priority: 0.7,
    changeFrequency: "monthly",
    related: ["/convert", "/merge-pdfs", "/merge-images-pdf"],
  },
  {
    path: "/pdf-editor",
    title: "PDF editor",
    description: "Edit PDF pages with text, signatures, watermarks, drawings, highlights, and secure exports.",
    mode: "advanced",
    priority: 0.95,
    changeFrequency: "weekly",
    related: ["/pdf-editor/add-text", "/pdf-editor/add-signature", "/pdf-editor/add-watermark", "/pdf-editor/draw", "/pdf-editor/protect"],
  },
  {
    path: "/pdf-editor/add-text",
    title: "Add text to PDF",
    description: "Add editable text boxes with font, size, color, and style controls.",
    mode: "advanced",
    intent: "add-text",
    priority: 0.82,
    changeFrequency: "monthly",
    related: ["/pdf-editor", "/pdf-editor/add-signature", "/pdf-editor/add-watermark"],
  },
  {
    path: "/pdf-editor/add-signature",
    title: "Add signature to PDF",
    description: "Draw and place signatures with line size and color controls.",
    mode: "advanced",
    intent: "add-signature",
    priority: 0.82,
    changeFrequency: "monthly",
    related: ["/pdf-editor", "/pdf-editor/add-text", "/pdf-editor/draw"],
  },
  {
    path: "/pdf-editor/add-watermark",
    title: "Add watermark to PDF",
    description: "Apply repeating watermark text across PDF pages.",
    mode: "advanced",
    intent: "add-watermark",
    priority: 0.78,
    changeFrequency: "monthly",
    related: ["/pdf-editor", "/pdf-editor/add-text", "/pdf-editor/highlight"],
  },
  {
    path: "/pdf-editor/draw",
    title: "Draw on PDF",
    description: "Use pen tools to draw directly on PDF pages.",
    mode: "advanced",
    intent: "draw",
    priority: 0.78,
    changeFrequency: "monthly",
    related: ["/pdf-editor", "/pdf-editor/highlight", "/pdf-editor/erase"],
  },
  {
    path: "/pdf-editor/highlight",
    title: "Highlight PDF",
    description: "Highlight important areas on PDF pages.",
    mode: "advanced",
    intent: "highlight",
    priority: 0.76,
    changeFrequency: "monthly",
    related: ["/pdf-editor", "/pdf-editor/draw", "/pdf-editor/add-text"],
  },
  {
    path: "/pdf-editor/erase",
    title: "Erase PDF annotations",
    description: "Remove added annotations and drawings from PDF pages.",
    mode: "advanced",
    intent: "erase",
    priority: 0.62,
    changeFrequency: "monthly",
    related: ["/pdf-editor", "/pdf-editor/draw", "/pdf-editor/highlight"],
  },
  {
    path: "/pdf-editor/unlock",
    title: "Unlock PDF",
    description: "Remove password protection from PDFs you can open.",
    mode: "advanced",
    intent: "unlock",
    priority: 0.78,
    changeFrequency: "monthly",
    related: ["/pdf-editor", "/pdf-editor/protect", "/pdf-editor/flatten"],
  },
  {
    path: "/pdf-editor/protect",
    title: "Protect PDF",
    description: "Protect your PDF with 128-bit AES encryption.",
    mode: "advanced",
    intent: "protect",
    priority: 0.78,
    changeFrequency: "monthly",
    related: ["/pdf-editor", "/pdf-editor/unlock", "/pdf-editor/flatten"],
  },
  {
    path: "/pdf-editor/flatten",
    title: "Flatten PDF",
    description: "Make PDF content uneditable before download.",
    mode: "advanced",
    intent: "flatten",
    priority: 0.76,
    changeFrequency: "monthly",
    related: ["/pdf-editor", "/pdf-editor/add-text", "/pdf-editor/protect"],
  },
];

export const toolNavGroups: ToolNavGroup[] = [
  {
    id: "scan",
    label: "Scan",
    description: "Create PDFs from images and scanned pages.",
    items: ["/merge-images-pdf", "/merge-images-pdf/crop", "/merge-images-pdf/reorder-pages", "/merge-images-pdf/two-up"],
  },
  {
    id: "organize",
    label: "Organize",
    description: "Merge and arrange PDF documents.",
    items: ["/merge-pdfs", "/merge-pdfs/reorder-pages", "/merge-pdfs/combine-pdfs"],
  },
  {
    id: "convert",
    label: "Convert",
    description: "Convert images and PDFs between common formats.",
    items: ["/convert", "/convert/compress-pdf", "/convert/pdf-to-jpg", "/convert/pdf-to-png", "/convert/jpg-to-pdf", "/convert/png-to-pdf", "/convert/heic-to-jpg"],
  },
  {
    id: "edit",
    label: "View & Edit",
    description: "Annotate, sign, watermark, and adjust PDFs.",
    items: ["/pdf-editor", "/pdf-editor/add-text", "/pdf-editor/add-signature", "/pdf-editor/add-watermark", "/pdf-editor/draw", "/pdf-editor/highlight", "/pdf-editor/erase"],
  },
  {
    id: "secure",
    label: "Secure",
    description: "Unlock, protect, and flatten PDF files.",
    items: ["/pdf-editor/unlock", "/pdf-editor/protect", "/pdf-editor/flatten"],
  },
];

export function getRoute(path: string) {
  return toolRoutes.find((route) => route.path === path) ?? null;
}

export function routeMetadata(route: ToolRoute): Metadata {
  const url = `${getSiteUrl()}${route.path}`;
  return {
    title: route.title,
    description: route.description,
    alternates: { canonical: route.path },
    openGraph: {
      title: `${route.title} | ${siteName}`,
      description: route.description,
      url,
      siteName,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: `${route.title} | ${siteName}`,
      description: route.description,
    },
  };
}
