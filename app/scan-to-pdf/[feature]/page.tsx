import { notFound, permanentRedirect } from "next/navigation";
import { getRoute, toolRoutes } from "../../../src/lib/siteRoutes";

type Props = { params: Promise<{ feature: string }> };

export function generateStaticParams() {
  return toolRoutes
    .filter((route) => route.path.startsWith("/merge-images-pdf/"))
    .map((route) => ({ feature: route.path.split("/").at(-1)! }));
}

export default async function ScanToPdfFeaturePage({ params }: Props) {
  const { feature } = await params;
  const route = getRoute(`/merge-images-pdf/${feature}`);
  if (!route) notFound();
  permanentRedirect(route.path);
}
