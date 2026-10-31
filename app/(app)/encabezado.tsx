"use client"

import { usePathname } from "next/navigation"
import { mostrarChip } from "@/lib/gasto/chip"
import { ChipDeGasto } from "./chip-de-gasto"

/** Owns the notch's safe area on every screen, chip or not, so `main` only adds its own spacing below it. */
export function Encabezado({ gastadoMicro, topeMicro }: { gastadoMicro: number; topeMicro: number }) {
  const conChip = mostrarChip(usePathname(), gastadoMicro, topeMicro)
  return (
    <header className="flex justify-end px-4 pt-[env(safe-area-inset-top)]">
      {conChip && (
        <div className="pt-2">
          <ChipDeGasto gastadoMicro={gastadoMicro} topeMicro={topeMicro} />
        </div>
      )}
    </header>
  )
}
