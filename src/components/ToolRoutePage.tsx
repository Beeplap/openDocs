import Link from "next/link";
import OpendocsWorkspace from "./OpendocsWorkspace";
import EditorHeaderActions from "./EditorHeaderActions";
import ToolMegaMenu from "./ToolMegaMenu";
import { getRoute, getSiteUrl, siteName } from "../lib/siteRoutes";
import type { ToolRoute } from "../lib/siteRoutes";

type Props = {
  route: ToolRoute;
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

      {route.related && route.related.length > 0 && (
        <section className="border-t border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/30 px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white mb-4">
              Related Document Tools
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {route.related.map((relPath) => {
                const relRoute = getRoute(relPath);
                if (!relRoute) return null;
                return (
                  <Link
                    key={relPath}
                    href={relPath}
                    className="group flex items-center justify-between rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 transition-all hover:border-blue-500 hover:shadow-md dark:hover:border-blue-400"
                  >
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                        {relRoute.title}
                      </h3>
                      <p className="mt-1 line-clamp-1 text-xs text-slate-500 dark:text-zinc-400">
                        {relRoute.description}
                      </p>
                    </div>
                    <span className="ml-2 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                      →
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
