import type { Metadata } from "next";
import ToolRoutePage from "../../src/components/ToolRoutePage";
import { getRoute, routeMetadata } from "../../src/lib/siteRoutes";

const route = getRoute("/compress")!;

export const metadata: Metadata = routeMetadata(route);

export default function CompressPage() {
  return <ToolRoutePage route={route} />;
}
