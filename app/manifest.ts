import type { MetadataRoute } from "next";
import { brand } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${brand.name} — ${brand.tagline}`,
    short_name: brand.name,
    description: brand.description,
    lang: "ru",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f5f9",
    theme_color: "#15253d",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
