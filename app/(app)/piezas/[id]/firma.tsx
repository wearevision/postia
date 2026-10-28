"use client"

import { useState, useTransition } from "react"
import type { Resultado } from "@/lib/marcas/acciones"
import { fechaLarga, instanteDesdeValorLocal, valorLocal } from "@/lib/piezas/fechas"

interface Props {
  piezaId: string
  huella: string
  texto: string
  fechaPropuesta: string
  ruta: "api" | "metricool" | "a_mano"
  firmar: (entrada: { piezaId: string; huella: string; programadaPara: string }) => Promise<Resultado>
}

export function FirmaDePieza({ piezaId, huella, texto, fechaPropuesta, ruta, firmar }: Props) {
  const [fecha, setFecha] = useState(() => valorLocal(fechaPropuesta))
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const instante = instanteDesdeValorLocal(fecha)

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    if (!instante) return setError("Elige la fecha y la hora.")
    setError(null)
    iniciar(async () => {
      const resultado = await firmar({ piezaId, huella, programadaPara: instante })
      if (!resultado.ok) setError(resultado.error)
    })
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <p className="whitespace-pre-wrap rounded-lg border border-borde p-3">{texto}</p>
      <p>
        Sale el <strong>{fechaLarga(fechaPropuesta)}</strong>
      </p>
      <label className="block space-y-1">
        <span className="text-sm">Fecha y hora de publicación</span>
        <input
          type="datetime-local"
          value={fecha}
          onChange={(evento) => setFecha(evento.target.value)}
          className="w-full rounded-lg border border-borde bg-background px-3 py-3"
        />
      </label>
      {instante && <p className="text-sm text-apagado">Hora de Chile. Quedaría para el {fechaLarga(instante)}.</p>}
      <button
        type="submit"
        disabled={pendiente}
        className="min-h-11 w-full rounded-lg bg-primario px-4 font-medium text-primario-texto disabled:opacity-60"
      >
        {ruta === "a_mano" ? "Firmar: te aviso a la hora para publicarla a mano" : "Firmar y programar"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-peligro">
          {error}
        </p>
      )}
    </form>
  )
}
