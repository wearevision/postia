import type { MetadataRoute } from "next"
import { COLOR_DE_FONDO } from "@/lib/diseno/marca"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PostIA",
    short_name: "PostIA",
    description: "Publica en LinkedIn e Instagram con tu firma antes de cada publicación.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "es-CL",
    background_color: COLOR_DE_FONDO,
    theme_color: COLOR_DE_FONDO,
    icons: [{ src: "/icon", sizes: "512x512", type: "image/png" }],
  }
}
