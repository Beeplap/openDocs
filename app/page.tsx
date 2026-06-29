import type { Metadata } from "next";
import Link from "next/link";
import LandingUploadButton from "../src/components/LandingUploadButton";
import ToolMegaMenu from "../src/components/ToolMegaMenu";
import { getRoute, routeMetadata, toolRoutes } from "../src/lib/siteRoutes";

const route = getRoute("/")!;

export const metadata: Metadata = routeMetadata(route);

const popularToolPaths = [
  "/merge-pdfs",
  "/compress",
  "/pdf-editor",
  "/pdf-editor/add-text",
  "/merge-images-pdf",
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
  compress: "bg-amber-600",
  advanced: "bg-cyan-600",
};

const toolLabelOverrides: Record<string, string> = {
  "/compress": "Compress",
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
    <main className="app-shell min-h-screen relative overflow-hidden">
      {/* Decorative Background Blob */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-accent opacity-5 blur-[100px] pointer-events-none" />
      <div className="absolute top-[20%] right-[-5%] w-[40%] h-[40%] rounded-full bg-brand opacity-5 blur-[120px] pointer-events-none" />

      <ToolMegaMenu />

      <section className="landing-page px-4 py-16 sm:px-6 lg:px-8 relative z-10">
        <div className="mx-auto max-w-7xl">
          {/* Hero Section */}
          <div className="mb-16 flex flex-col items-center text-center animate-fade-up" style={{ animationDelay: '0ms' }}>
            <h1 className="display-font text-5xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl mb-4 bg-clip-text text-transparent bg-gradient-to-r from-foreground to-muted">
              Your Complete PDF Suite
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-muted mb-8">
              Fast, private document tools for scanning, merging, converting, editing, signing, and securing files entirely in
              your browser. Zero uploads to external servers.
            </p>
            <div className="flex justify-center scale-110">
              <LandingUploadButton>
                <UploadIcon />
                <span>Upload a Document</span>
                <ChevronDownIcon />
              </LandingUploadButton>
            </div>
          </div>

          <div className="animate-fade-up" style={{ animationDelay: '200ms' }}>
            <h2 className="mb-6 text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <span className="w-8 h-[2px] bg-accent rounded-full"></span>
              Most Popular Tools
            </h2>
            <ToolGrid tools={popularTools} delayStart={300} />
          </div>

          <div className="animate-fade-up mt-20" style={{ animationDelay: '400ms' }}>
            <h2 className="mb-6 text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <span className="w-8 h-[2px] bg-brand rounded-full"></span>
              More Capabilities
            </h2>
            <ToolGrid tools={moreTools} delayStart={500} />
          </div>
        </div>
      </section>
    </main>
  );
}

function ToolGrid({ tools, delayStart = 0 }: { tools: NonNullable<ReturnType<typeof getRoute>>[], delayStart?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {tools.map((tool, idx) => {
        const label = getToolLabel(tool.path, tool.title);
        return (
          <Link 
            key={tool.path} 
            href={tool.path} 
            className="landing-tool-card animate-fade-up group" 
            style={{ animationDelay: `${delayStart + idx * 50}ms` }}
          >
            <span className={`landing-tool-icon shadow-lg transition-transform duration-300 group-hover:scale-110 ${sectionTone[tool.mode]}`} aria-hidden="true">
              {toolInitials(label)}
            </span>
            <span className="landing-tool-content">
              <span className="landing-tool-title text-base font-bold text-foreground transition-colors duration-300 group-hover:text-accent">{label}</span>
              <span className="landing-tool-description mt-1 text-xs text-muted opacity-80">{tool.description}</span>
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
