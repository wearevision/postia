import { ImageResponse } from "next/og"
import { srcDelIcono } from "@/lib/diseno/icono"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
  // biome-ignore lint/performance/noImgElement: next/og draws plain img elements; it has no Next image component
  return new ImageResponse(<img src={srcDelIcono()} width={size.width} height={size.height} alt="" />, size)
}
