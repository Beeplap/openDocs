import Link from "next/link";
import OpendocsWorkspace from "./OpendocsWorkspace";
import EditorHeaderActions from "./EditorHeaderActions";
import ToolMegaMenu from "./ToolMegaMenu";
import { getRoute, getSiteUrl, siteDescription, siteName } from "../lib/siteRoutes";
import type { ToolRoute, WorkspaceMode } from "../lib/siteRoutes";

type Props = {
  route: ToolRoute;
};

const modeDetails: Record<WorkspaceMode, { label: string; steps: string[]; supports: string[]; limit: string }> = {
  scan: {
    label: "Image and scan workflow",
    steps: ["Upload photos, scanned pages, or PDF pages.", "Crop, reorder, rotate, and adjust page appearance.", "Export a clean PDF directly from your browser."],
    supports: ["JPG", "PNG", "WEBP", "HEIC", "PDF pages"],
    limit: "Very large PDFs or high-resolution image batches can take longer because processing happens locally in the browser.",
  },
  pdf: {
    label: "PDF merge workflow",
    steps: ["Add two or more PDF files.", "Preview page counts and arrange the merge order.", "Download one combined PDF without creating an account."],
    supports: ["PDF"],
    limit: "Password-protected or damaged PDFs may need to be unlocked or repaired before merging.",
  },
  convert: {
    label: "Conversion workflow",
    steps: ["Upload an image, SVG, HEIC, or PDF file.", "Choose the target format and quality.", "Download converted output files or a ZIP for multipage PDFs."],
    supports: ["PDF", "JPG", "PNG", "WEBP", "SVG", "HEIC"],
    limit: "PDF-to-image and image-to-SVG conversions rasterize pages; they do not recreate editable vector artwork.",
  },
  compress: {
    label: "Compression workflow",
    steps: ["Upload a supported PDF or image.", "Adjust quality when the format supports lossy output.", "Download the smaller file and compare the estimated size."],
    supports: ["PDF", "JPG", "PNG", "WEBP", "SVG"],
    limit: "Lossless formats may not shrink much without changing format or quality.",
  },
  advanced: {
    label: "PDF editing workflow",
    steps: ["Upload a PDF.", "Add text, signatures, drawings, highlights, watermarks, or security changes.", "Export the edited PDF from your browser."],
    supports: ["PDF"],
    limit: "Some advanced edits flatten pages during export so the final file is easier to share consistently.",
  },
};

function jsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function buildToolJsonLd(route: ToolRoute) {
  const siteUrl = getSiteUrl();
  const url = `${siteUrl}${route.path}`;
  const relatedRoutes = route.related.map((path) => getRoute(path)).filter((item): item is ToolRoute => item !== null);

  return [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: `${route.title} | ${siteName}`,
      applicationCategory: "ProductivityApplication",
      operatingSystem: "Any",
      url,
      description: route.description,
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: siteName, item: siteUrl },
        { "@type": "ListItem", position: 2, name: route.title, item: url },
      ],
    },
    relatedRoutes.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `Related ${route.title} tools`,
          itemListElement: relatedRoutes.map((relatedRoute, index) => ({
            "@type": "ListItem",
            position: index + 1,
            url: `${siteUrl}${relatedRoute.path}`,
            name: relatedRoute.title,
          })),
        }
      : null,
  ].filter(Boolean);
}

export default function ToolRoutePage({ route }: Props) {
  const details = modeDetails[route.mode];
  const relatedRoutes = route.related.map((path) => getRoute(path)).filter((item): item is ToolRoute => item !== null);

  return (
    <main className="app-shell min-h-screen">
      <ToolMegaMenu />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(buildToolJsonLd(route)),
        }}
      />
      <section className="page-intro border-b px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{route.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6">{route.description}</p>
          </div>
          <EditorHeaderActions enabled={route.mode === "advanced"} />
        </div>
      </section>

      <OpendocsWorkspace initialMode={route.mode} editorIntent={route.intent} />

      <section className="px-4 pb-12 pt-4 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-700">
            <h2 className="text-lg font-semibold text-slate-950">{details.label}</h2>
            <p className="mt-2">
              {route.title} is part of {siteName}, a browser-first document toolkit. {siteDescription}
            </p>
            <ol className="mt-4 grid gap-2 sm:grid-cols-3">
              {details.steps.map((step, index) => (
                <li key={step} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Step {index + 1}</span>
                  <span className="mt-1 block text-slate-800">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <aside className="rounded-lg border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-700">
            <h2 className="text-lg font-semibold text-slate-950">Tool details</h2>
            <div className="mt-3">
              <h3 className="font-semibold text-slate-900">Supported files</h3>
              <p className="mt-1">{details.supports.join(", ")}</p>
            </div>
            <div className="mt-3">
              <h3 className="font-semibold text-slate-900">Privacy</h3>
              <p className="mt-1">Default processing stays in your browser. Temporary cloud storage is disabled unless explicitly enabled by the deployment.</p>
            </div>
            <div className="mt-3">
              <h3 className="font-semibold text-slate-900">Limit</h3>
              <p className="mt-1">{details.limit}</p>
            </div>
          </aside>
        </div>

        {relatedRoutes.length > 0 ? (
          <div className="mx-auto mt-4 max-w-7xl rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-950">Related tools</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {relatedRoutes.map((relatedRoute) => (
                <Link
                  key={relatedRoute.path}
                  href={relatedRoute.path}
                  className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm transition hover:border-emerald-200 hover:bg-emerald-50"
                >
                  <span className="block font-semibold text-slate-950">{relatedRoute.title}</span>
                  <span className="mt-1 block leading-5 text-slate-600">{relatedRoute.description}</span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
