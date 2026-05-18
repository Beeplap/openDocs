import type { Metadata } from "next";
import ToolRoutePage from "../../src/components/ToolRoutePage";
import { getRoute, routeMetadata } from "../../src/lib/siteRoutes";

const route = getRoute("/merge-pdfs")!;

export const metadata: Metadata = routeMetadata(route);

export default function MergePdfsPage() {
  return <ToolRoutePage route={route} />;
}
