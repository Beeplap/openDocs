import type { Metadata } from "next";
import ToolRoutePage from "../../src/components/ToolRoutePage";
import { getRoute, routeMetadata } from "../../src/lib/siteRoutes";

const route = getRoute("/convert")!;

export const metadata: Metadata = routeMetadata(route);

export default function ConvertPage() {
  return <ToolRoutePage route={route} />;
}
