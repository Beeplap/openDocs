import OpendocsWorkspace from "./OpendocsWorkspace";
import ToolMegaMenu from "./ToolMegaMenu";
import type { ToolRoute } from "../lib/siteRoutes";

type Props = {
  route: ToolRoute;
};

export default function ToolRoutePage({ route }: Props) {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <ToolMegaMenu />
      <section className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{route.title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{route.description}</p>
        </div>
      </section>

      <OpendocsWorkspace initialMode={route.mode} editorIntent={route.intent} />
    </main>
  );
}
