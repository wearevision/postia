import { huellaCorta } from "@/lib/piezas/textos"

/** Shown once a piece is signed: names the exact version that will go out. */
export function FirmaConfirmada({ huella }: { huella: string }) {
  return (
    <output className="block rounded-lg border border-control p-3 text-sm shadow-hundido">
      <strong>Firmada.</strong> Se publica exactamente esta versión (huella{" "}
      <code className="font-mono">{huellaCorta(huella)}</code>).
    </output>
  )
}
