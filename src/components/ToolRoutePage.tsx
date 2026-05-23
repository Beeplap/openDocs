import OpendocsWorkspace from "./OpendocsWorkspace";
import EditorHeaderActions from "./EditorHeaderActions";
import ToolMegaMenu from "./ToolMegaMenu";
import type { ToolRoute } from "../lib/siteRoutes";

type Props = {
  route: ToolRoute;
};

export default function ToolRoutePage({ route }: Props) {
  return (
    <main className="app-shell min-h-screen">
      <ToolMegaMenu />
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
    </main>
  );
}
