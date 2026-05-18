import type { Metadata } from "next";
import type { WorkspaceIntent } from "../components/OpendocsWorkspace";

export type WorkspaceMode = "scan" | "pdf" | "convert" | "advanced";

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
    related: ["/scan-to-pdf", "/merge-pdfs", "/convert", "/pdf-editor"],
  },
  {
    path: "/scan-to-pdf",
    title: "Scan to PDF",
    description: "Create clean PDF documents from images, photos, and uploaded PDF pages directly in your browser.",
    mode: "scan",
    priority: 0.95,
    changeFrequency: "weekly",
    related: ["/scan-to-pdf/crop", "/scan-to-pdf/reorder-pages", "/scan-to-pdf/two-up", "/merge-pdfs"],
  },
  {
    path: "/scan-to-pdf/crop",
    title: "Crop scanned pages",
    description: "Crop scanned images and document pages before exporting a clean browser-generated PDF.",
    mode: "scan",
    priority: 0.78,
    changeFrequency: "monthly",
    related: ["/scan-to-pdf", "/scan-to-pdf/reorder-pages", "/scan-to-pdf/two-up"],
  },
  {
    path: "/scan-to-pdf/reorder-pages",
    title: "Reorder scanned pages",
    description: "Arrange scanned pages and images in the right order before downloading a PDF.",
    mode: "scan",
    priority: 0.78,
    changeFrequency: "monthly",
    related: ["/scan-to-pdf", "/merge-pdfs/reorder-pages", "/pdf-editor"],
  },
  {
    path: "/scan-to-pdf/two-up",
    title: "Create two-up PDF pages",
    description: "Place two scanned pages on one PDF sheet for compact document exports.",
    mode: "scan",
    priority: 0.72,
    changeFrequency: "monthly",
    related: ["/scan-to-pdf", "/merge-pdfs", "/convert"],
  },
  {
    path: "/merge-pdfs",
    title: "Merge PDFs",
    description: "Combine multiple PDF files into one document with client-side processing.",
    mode: "pdf",
    priority: 0.95,
    changeFrequency: "weekly",
    related: ["/merge-pdfs/reorder-pages", "/merge-pdfs/combine-pdfs", "/scan-to-pdf"],
  },
  {
    path: "/merge-pdfs/reorder-pages",
    title: "Reorder PDF files before merging",
    description: "Drag PDF files into the right sequence before combining them into one document.",
    mode: "pdf",
    priority: 0.78,
    changeFrequency: "monthly",
    related: ["/merge-pdfs", "/scan-to-pdf/reorder-pages", "/pdf-editor"],
  },
  {
    path: "/merge-pdfs/combine-pdfs",
    title: "Combine PDF files",
    description: "Join PDF files in the browser without sending document contents through a server workflow.",
    mode: "pdf",
    priority: 0.78,
    changeFrequency: "monthly",
    related: ["/merge-pdfs", "/convert", "/scan-to-pdf"],
  },
  {
    path: "/convert",
    title: "Convert documents and images",
    description: "Convert images and PDF files to PDF, JPG, PNG, or WEBP with browser-side processing.",
    mode: "convert",
    priority: 0.9,
    changeFrequency: "weekly",
    related: ["/convert/pdf-to-jpg", "/convert/jpg-to-pdf", "/convert/heic-to-jpg", "/convert/compress-pdf"],
  },
  {
    path: "/convert/pdf-to-jpg",
    title: "Convert PDF to JPG",
    description: "Turn PDF pages into JPG images with adjustable output quality.",
    mode: "convert",
    priority: 0.76,
    changeFrequency: "monthly",
    related: ["/convert", "/convert/pdf-to-png", "/scan-to-pdf"],
  },
  {
    path: "/convert/pdf-to-png",
    title: "Convert PDF to PNG",
    description: "Export PDF pages as PNG images from a client-side document workflow.",
    mode: "convert",
    priority: 0.72,
    changeFrequency: "monthly",
    related: ["/convert", "/convert/pdf-to-jpg", "/convert/png-to-pdf"],
  },
  {
    path: "/convert/jpg-to-pdf",
    title: "Convert JPG to PDF",
    description: "Convert JPG images into PDF documents from your browser.",
    mode: "convert",
    priority: 0.76,
    changeFrequency: "monthly",
    related: ["/convert", "/convert/png-to-pdf", "/scan-to-pdf"],
  },
  {
    path: "/convert/png-to-pdf",
    title: "Convert PNG to PDF",
    description: "Create PDF files from PNG images with a simple browser-based converter.",
    mode: "convert",
    priority: 0.72,
    changeFrequency: "monthly",
    related: ["/convert", "/convert/jpg-to-pdf", "/scan-to-pdf"],
  },
  {
    path: "/convert/heic-to-jpg",
    title: "Convert HEIC to JPG",
    description: "Convert HEIC or HEIF images to JPG when the browser supports decoding the source file.",
    mode: "convert",
    priority: 0.72,
    changeFrequency: "monthly",
    related: ["/convert", "/convert/jpg-to-pdf", "/scan-to-pdf"],
  },
  {
    path: "/convert/compress-pdf",
    title: "Compress PDF",
    description: "Reduce PDF output size by choosing quality settings before download.",
    mode: "convert",
    priority: 0.7,
    changeFrequency: "monthly",
    related: ["/convert", "/merge-pdfs", "/scan-to-pdf"],
  },
  {
    path: "/pdf-editor",
    title: "PDF editor",
    description: "Edit PDF pages with text, signatures, watermarks, drawings, highlights, and page tools.",
    mode: "advanced",
    priority: 0.95,
    changeFrequency: "weekly",
    related: ["/pdf-editor/add-text", "/pdf-editor/add-signature", "/pdf-editor/add-watermark", "/pdf-editor/draw"],
  },
  {
    path: "/pdf-editor/add-text",
    title: "Add text to PDF",
    description: "Add editable text boxes to PDF pages with font, size, color, and style controls.",
    mode: "advanced",
    intent: "add-text",
    priority: 0.82,
    changeFrequency: "monthly",
    related: ["/pdf-editor", "/pdf-editor/add-signature", "/pdf-editor/add-watermark"],
  },
  {
    path: "/pdf-editor/add-signature",
    title: "Add signature to PDF",
    description: "Draw and place signatures on PDF pages with line size and color controls.",
    mode: "advanced",
    intent: "add-signature",
    priority: 0.82,
    changeFrequency: "monthly",
    related: ["/pdf-editor", "/pdf-editor/add-text", "/pdf-editor/draw"],
  },
  {
    path: "/pdf-editor/add-watermark",
    title: "Add watermark to PDF",
    description: "Apply repeating watermark text across PDF pages in a browser-based PDF editor.",
    mode: "advanced",
    intent: "add-watermark",
    priority: 0.78,
    changeFrequency: "monthly",
    related: ["/pdf-editor", "/pdf-editor/add-text", "/pdf-editor/highlight"],
  },
  {
    path: "/pdf-editor/draw",
    title: "Draw on PDF",
    description: "Use pen tools to draw directly on PDF pages and export the edited document.",
    mode: "advanced",
    intent: "draw",
    priority: 0.78,
    changeFrequency: "monthly",
    related: ["/pdf-editor", "/pdf-editor/highlight", "/pdf-editor/erase"],
  },
  {
    path: "/pdf-editor/highlight",
    title: "Highlight PDF",
    description: "Highlight areas of a PDF page using browser-side PDF annotation tools.",
    mode: "advanced",
    intent: "highlight",
    priority: 0.76,
    changeFrequency: "monthly",
    related: ["/pdf-editor", "/pdf-editor/draw", "/pdf-editor/add-text"],
  },
  {
    path: "/pdf-editor/erase",
    title: "Erase PDF annotations",
    description: "Remove added annotations and drawings from PDF pages while editing in the browser.",
    mode: "advanced",
    intent: "erase",
    priority: 0.62,
    changeFrequency: "monthly",
    related: ["/pdf-editor", "/pdf-editor/draw", "/pdf-editor/highlight"],
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
