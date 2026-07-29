import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.shortName,
    description: BRAND.description,
    start_url: "/",
    display: "standalone",
    background_color: "#070708",
    theme_color: "#6F1AD1",
    icons: [
      {
        src: BRAND.logoSymbolPath,
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
