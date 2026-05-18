import Link from "next/link";
import OpendocsWorkspace from "./OpendocsWorkspace";
import type { ToolRoute } from "../lib/siteRoutes";
import { getRoute } from "../lib/siteRoutes";

type Props = {
  route: ToolRoute;
};

export default function ToolRoutePage({ route }: Props) {
  const relatedRoutes = route.related.map((path) => getRoute(path)).filter((item): item is ToolRoute => Boolean(item));

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <section className="border-b border-slate-200 bg-white px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm font-semibold text-blue-700">Opendocs</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{route.title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{route.description}</p>
          {relatedRoutes.length > 0 ? (
            <nav className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Related document tools">
              {relatedRoutes.map((related) => (
                <Link
                  key={related.path}
                  href={related.path}
                  className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                >
                  {related.title}
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
      </section>

      <OpendocsWorkspace initialMode={route.mode} editorIntent={route.intent} />
    </main>
  );
}
