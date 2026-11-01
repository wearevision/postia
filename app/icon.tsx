import { ImageResponse } from "next/og"
import { srcDelIcono } from "@/lib/diseno/icono"

export const size = { width: 512, height: 512 }
export const contentType = "image/png"

export default function Icon() {
  // biome-ignore lint/performance/noImgElement: next/og draws plain img elements; it has no Next image component
  return new ImageResponse(<img src={srcDelIcono()} width={size.width} height={size.height} alt="" />, size)
}
