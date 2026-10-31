"use client"

import { useState, useTransition } from "react"
import type { Resultado } from "@/lib/marcas/acciones"

type Ruta = "api" | "a_mano"
type Cambiar = (cuentaId: string, ruta: Ruta) => Promise<Resultado>

const OPCIONES: { ruta: Ruta; texto: string }[] = [
  { ruta: "api", texto: "Sale sola" },
  { ruta: "a_mano", texto: "A mano" },
]

interface Props {
  cuentaId: string
  nombre: string
  ruta: string
  conectada: boolean
  cambiar: Cambiar
}

export function RutaDeCuenta({ cuentaId, nombre, ruta, conectada, cambiar }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()

  function elegir(nueva: Ruta) {
    if (nueva === ruta) return
    setError(null)
    iniciar(async () => {
      const resultado = await cambiar(cuentaId, nueva)
      if (!resultado.ok) setError(resultado.error)
    })
  }

  return (
    <div className="space-y-1">
      <fieldset aria-label={`Cómo sale ${nombre}`} className="inline-flex rounded-lg border border-borde p-0.5">
        {OPCIONES.map((opcion) => {
          const actual = opcion.ruta === ruta
          return (
            <button
              key={opcion.ruta}
              type="button"
              aria-pressed={actual}
              disabled={pendiente}
              onClick={() => elegir(opcion.ruta)}
              className={`min-h-11 rounded-md px-3 text-sm ${actual ? "bg-primario text-primario-texto" : "text-apagado"}`}
            >
              {opcion.texto}
            </button>
          )
        })}
      </fieldset>
      {conectada && ruta === "api" && <p className="text-xs text-apagado">Pasar a mano desconecta LinkedIn.</p>}
      {error && (
        <p role="alert" className="text-sm text-peligro">
          {error}
        </p>
      )}
    </div>
  )
}
