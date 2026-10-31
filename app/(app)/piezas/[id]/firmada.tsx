import { Check } from "lucide-react"
import { huellaCorta } from "@/lib/piezas/textos"

/** Shown once a piece is signed: names the exact version that will go out. */
export function FirmaConfirmada({ huella }: { huella: string }) {
  return (
    <output className="flex gap-2 rounded-lg border border-control p-3 text-sm shadow-hundido">
      <Check aria-hidden="true" data-forma="check" strokeWidth={2.5} className="mt-0.5 size-4 flex-none text-exito" />
      <span>
        <strong>Firmada.</strong> Se publica exactamente esta versión (huella{" "}
        <code className="font-mono">{huellaCorta(huella)}</code>).
      </span>
    </output>
  )
}
