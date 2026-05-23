import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ToolRoutePage from "../../../src/components/ToolRoutePage";
import { getRoute, routeMetadata, toolRoutes } from "../../../src/lib/siteRoutes";

type Props = { params: Promise<{ feature: string }> };

export function generateStaticParams() {
  return toolRoutes
    .filter((route) => route.path.startsWith("/merge-images-pdf/"))
    .map((route) => ({ feature: route.path.split("/").at(-1)! }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { feature } = await params;
  const route = getRoute(`/merge-images-pdf/${feature}`);
  if (!route) return {};
  return routeMetadata(route);
}

export default async function MergeImagesPdfFeaturePage({ params }: Props) {
  const { feature } = await params;
  const route = getRoute(`/merge-images-pdf/${feature}`);
  if (!route) notFound();
  return <ToolRoutePage route={route} />;
}
