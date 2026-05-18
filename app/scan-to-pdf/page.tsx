import type { Metadata } from "next";
import ToolRoutePage from "../../src/components/ToolRoutePage";
import { getRoute, routeMetadata } from "../../src/lib/siteRoutes";

const route = getRoute("/scan-to-pdf")!;

export const metadata: Metadata = routeMetadata(route);

export default function ScanToPdfPage() {
  return <ToolRoutePage route={route} />;
}
