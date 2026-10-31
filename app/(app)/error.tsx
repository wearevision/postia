"use client"

import Link from "next/link"
import { useEffect } from "react"
import { RUTA_DE_INICIO } from "@/lib/sesion/rutas"

export default function ErrorDeLaApp({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Pantalla con error", error.digest ?? error.message)
  }, [error])
  return (
    <section className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">Algo falló</h1>
      <p className="text-apagado">No se perdió nada de lo que ya firmaste. Vuelve a intentarlo en un momento.</p>
      <button type="button" onClick={reset} className="boton-primario w-full">
        Reintentar
      </button>
      <Link href={RUTA_DE_INICIO} className="boton w-full py-3">
        Ir a Inicio
      </Link>
    </section>
  )
}
