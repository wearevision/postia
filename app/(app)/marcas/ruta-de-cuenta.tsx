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
  /** Signed, scheduled pieces: some may already have gone out by hand, and by API they would go out again. */
  programadas: number
  cambiar: Cambiar
}

const avisoDeProgramadas = (n: number) =>
  `Esta cuenta tiene ${n} ${n === 1 ? "pieza programada" : "piezas programadas"}. Si ya publicaste alguna a mano, márcala como publicada antes, para que no salga dos veces.`

export function RutaDeCuenta({ cuentaId, nombre, ruta, conectada, programadas, cambiar }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [pendiente, iniciar] = useTransition()

  function elegir(nueva: Ruta) {
    if (nueva === ruta) return
    if (nueva === "api" && programadas > 0) {
      setConfirmando(true)
      return
    }
    cambiarA(nueva)
  }

  function cambiarA(nueva: Ruta) {
    setError(null)
    setConfirmando(false)
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
      {confirmando && (
        <div
          role="alertdialog"
          aria-label="Antes de que salga sola"
          className="space-y-2 rounded-lg border border-borde p-3"
        >
          <p className="text-sm">{avisoDeProgramadas(programadas)}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pendiente}
              onClick={() => cambiarA("api")}
              className="min-h-11 rounded-md bg-primario px-3 text-sm text-primario-texto"
            >
              Sí, que salga sola
            </button>
            <button type="button" onClick={() => setConfirmando(false)} className="min-h-11 px-3 text-sm text-apagado">
              Cancelar
            </button>
          </div>
        </div>
      )}
      {conectada && ruta === "a_mano" && (
        <p className="text-xs text-apagado">En pausa: las piezas se publican a mano.</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-peligro">
          {error}
        </p>
      )}
    </div>
  )
}
