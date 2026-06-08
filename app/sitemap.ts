import type { MetadataRoute } from "next";
import { getSiteUrl, toolRoutes } from "../src/lib/siteRoutes";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();

  return toolRoutes.map((route) => ({
    url: `${siteUrl}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
