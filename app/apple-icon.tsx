import { ImageResponse } from "next/og"
import { COLOR_DE_FONDO, COLOR_DEL_TEXTO } from "@/lib/diseno/marca"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: COLOR_DE_FONDO,
        color: COLOR_DEL_TEXTO,
        fontSize: 100,
        fontWeight: 700,
      }}
    >
      P
    </div>,
    size,
  )
}
