"use client"

import { usePathname } from "next/navigation"
import { mostrarChip } from "@/lib/gasto/chip"
import { ChipDeGasto } from "./chip-de-gasto"

export function Encabezado({ gastadoMicro, topeMicro }: { gastadoMicro: number; topeMicro: number }) {
  if (!mostrarChip(usePathname(), gastadoMicro, topeMicro)) return null
  return (
    <header className="flex justify-end px-4 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <ChipDeGasto gastadoMicro={gastadoMicro} topeMicro={topeMicro} />
    </header>
  )
}
