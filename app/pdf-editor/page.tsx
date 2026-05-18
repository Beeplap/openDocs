import type { Metadata } from "next";
import ToolRoutePage from "../../src/components/ToolRoutePage";
import { getRoute, routeMetadata } from "../../src/lib/siteRoutes";

const route = getRoute("/pdf-editor")!;

export const metadata: Metadata = routeMetadata(route);

export default function PdfEditorPage() {
  return <ToolRoutePage route={route} />;
}
