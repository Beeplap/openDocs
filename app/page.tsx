import type { Metadata } from "next";
import Link from "next/link";
import ToolMegaMenu from "../src/components/ToolMegaMenu";
import { getRoute, routeMetadata, toolRoutes } from "../src/lib/siteRoutes";

const route = getRoute("/")!;

export const metadata: Metadata = routeMetadata(route);

const popularToolPaths = [
  "/merge-pdfs",
  "/convert/compress-pdf",
  "/pdf-editor",
  "/pdf-editor/add-text",
  "/scan-to-pdf",
  "/convert/pdf-to-jpg",
  "/pdf-editor/draw",
  "/convert/pdf-to-png",
  "/pdf-editor/protect",
  "/pdf-editor/add-signature",
  "/pdf-editor/unlock",
  "/pdf-editor/flatten",
];

const sectionTone = {
  scan: "bg-blue-600",
  pdf: "bg-violet-600",
  convert: "bg-emerald-600",
  advanced: "bg-cyan-600",
};

const toolLabelOverrides: Record<string, string> = {
  "/convert/compress-pdf": "Compress",
  "/convert/pdf-to-jpg": "PDF to JPG",
  "/convert/pdf-to-png": "PDF to PNG",
  "/pdf-editor": "Annotate",
  "/pdf-editor/add-text": "Edit Text",
  "/pdf-editor/add-signature": "Sign",
  "/pdf-editor/draw": "Draw",
  "/pdf-editor/protect": "Protect",
  "/pdf-editor/unlock": "Unlock",
  "/pdf-editor/flatten": "Flatten",
};

function toolInitials(title: string) {
  return title
    .replace(/PDF/gi, "PDF")
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function getToolLabel(path: string, title: string) {
  return toolLabelOverrides[path] ?? title;
}

export default function HomePage() {
  const popularTools = popularToolPaths.map((path) => getRoute(path)).filter((tool) => tool !== null);
  const moreTools = toolRoutes.filter((tool) => tool.path !== "/" && !popularToolPaths.includes(tool.path));

  return (
    <main className="app-shell min-h-screen">
      <ToolMegaMenu />

      <section className="landing-page px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Most Popular PDF Tools</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6">
                Fast, private document tools for scanning, merging, converting, editing, signing, and securing files in
                your browser.
              </p>
            </div>
            <Link href="/scan-to-pdf" className="landing-upload-button" aria-label="Upload files">
              <UploadIcon />
              <span>Upload</span>
              <ChevronDownIcon />
            </Link>
          </div>

          <ToolGrid tools={popularTools} />

          <h2 className="mb-6 mt-12 text-2xl font-bold tracking-tight">More tools</h2>
          <ToolGrid tools={moreTools} />
        </div>
      </section>
    </main>
  );
}

function ToolGrid({ tools }: { tools: NonNullable<ReturnType<typeof getRoute>>[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {tools.map((tool) => {
        const label = getToolLabel(tool.path, tool.title);
        return (
          <Link key={tool.path} href={tool.path} className="landing-tool-card">
            <span className={`landing-tool-icon ${sectionTone[tool.mode]}`} aria-hidden="true">
              {toolInitials(label)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-bold">{label}</span>
              <span className="mt-1 block truncate text-sm">{tool.description}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function UploadIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 13V4.5M10 4.5 6.75 7.75M10 4.5l3.25 3.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 14.5v1h11v-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="m5.5 7.5 4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
