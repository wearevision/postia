"use client"

import { ChevronLeft } from "lucide-react"
import { useRouter } from "next/navigation"
import { RUTA_DE_INICIO } from "@/lib/sesion/rutas"

/** Back to where the person came from; a piece opened from a notification has no history, so it goes home. */
export function Volver() {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(RUTA_DE_INICIO))}
      className="inline-flex min-h-11 items-center gap-1 text-sm text-apagado"
    >
      <ChevronLeft aria-hidden="true" strokeWidth={1.75} className="size-4" />
      Volver
    </button>
  )
}
