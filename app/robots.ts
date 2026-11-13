import type { MetadataRoute } from "next";
import { allowIndexing } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  // Preview deployments must not be indexed.
  if (!allowIndexing()) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/" } };
}
