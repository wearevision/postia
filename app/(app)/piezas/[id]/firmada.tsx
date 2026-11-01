"use client"

import { Check } from "lucide-react"
import Link from "next/link"
import { useEffect } from "react"
import { fechaCorta, fechaLarga } from "@/lib/piezas/fechas"
import type { SiguientePorFirmar } from "@/lib/piezas/siguiente"
import { huellaCorta } from "@/lib/piezas/textos"
import { RUTA_DE_INICIO, rutaDePieza } from "@/lib/sesion/rutas"

/**
 * Shown once a piece is signed: says when it goes out and names the exact version that will.
 * Signing re-renders the page in place, deep below; the confirmation sits at the top, so the page goes there.
 */
export function FirmaConfirmada({ huella, programadaPara }: { huella: string; programadaPara: string | null }) {
  useEffect(() => window.scrollTo({ top: 0 }), [])
  return (
    <output className="flex gap-2 rounded-lg border border-control p-3 text-sm shadow-hundido">
      <Check aria-hidden="true" data-forma="check" strokeWidth={2.5} className="mt-0.5 size-4 flex-none text-exito" />
      <span>
        <strong className="block text-base">
          {programadaPara ? `Firmada · sale el ${fechaLarga(programadaPara)}` : "Firmada · en la reserva"}
        </strong>
        Se publica exactamente esta versión (huella <code className="font-mono">{huellaCorta(huella)}</code>).
      </span>
    </output>
  )
}

/** What comes after a signature: the next piece waiting for one, or the end of the day's signing. */
export function DespuesDeFirmar({ siguiente }: { siguiente: SiguientePorFirmar | null }) {
  if (!siguiente) {
    return (
      <div className="space-y-2">
        <p className="font-medium">Listo por hoy</p>
        <Link href={RUTA_DE_INICIO} className="boton w-full py-3">
          Ir a Inicio
        </Link>
      </div>
    )
  }
  const fecha = siguiente.planeadaPara ? ` · ${fechaCorta(siguiente.planeadaPara)}` : ""
  return (
    <Link href={rutaDePieza(siguiente.id)} className="boton-primario w-full">
      {`Siguiente: ${siguiente.cuenta}${fecha} (quedan ${siguiente.quedan})`}
    </Link>
  )
}
