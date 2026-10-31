"use client"

import { Lock } from "lucide-react"
import { useState, useTransition } from "react"
import type { Resultado } from "@/lib/marcas/acciones"
import { fechaLarga, instanteDesdeValorLocal, valorLocal } from "@/lib/piezas/fechas"
import { explicacionDeReserva } from "@/lib/piezas/textos"
import { FinDelTexto, useLectura } from "./lectura"

interface Props {
  piezaId: string
  huella: string
  texto: string
  fechaPropuesta: string
  /** When the server rendered the page: a signature is refused if an exception was marked after it. */
  abiertaEn: string
  ruta: "api" | "metricool" | "a_mano"
  cuenta: string
  firmar: (entrada: {
    piezaId: string
    huella: string
    programadaPara: string
    abiertaEn: string
  }) => Promise<Resultado>
  firmarParaReserva: (entrada: { piezaId: string; huella: string; abiertaEn: string }) => Promise<Resultado>
  /** A rewrite is open: signing now keeps this version and Claude's is dropped as obsolete. */
  reescribiendo?: boolean
}

export function FirmaDePieza({
  piezaId,
  huella,
  texto,
  fechaPropuesta,
  abiertaEn,
  ruta,
  cuenta,
  firmar,
  firmarParaReserva,
  reescribiendo = false,
}: Props) {
  const [fecha, setFecha] = useState(() => valorLocal(fechaPropuesta))
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const lectura = useLectura()
  const bloqueada = pendiente || !lectura.puedeFirmar
  const instante = instanteDesdeValorLocal(fecha)

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    if (!instante) return setError("Elige la fecha y la hora.")
    setError(null)
    iniciar(async () => {
      const resultado = await firmar({ piezaId, huella, programadaPara: instante, abiertaEn })
      if (!resultado.ok) setError(resultado.error)
    })
  }

  function paraLaReserva() {
    setError(null)
    iniciar(async () => {
      const resultado = await firmarParaReserva({ piezaId, huella, abiertaEn })
      if (!resultado.ok) setError(resultado.error)
    })
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <p className="whitespace-pre-wrap rounded-lg border border-borde p-3">{texto}</p>
      <FinDelTexto />
      <label className="block space-y-1">
        <span className="text-sm">Fecha y hora de publicación</span>
        <input
          type="datetime-local"
          value={fecha}
          onChange={(evento) => setFecha(evento.target.value)}
          className="w-full rounded-lg border border-borde bg-background px-3 py-3"
        />
      </label>
      {instante && (
        <p>
          Sale el <strong>{fechaLarga(instante)}</strong>
          <span className="block text-sm text-apagado">Hora de Chile.</span>
        </p>
      )}
      {reescribiendo && (
        <p className="text-sm">Claude está reescribiendo. Si firmas ahora, esa versión no se aplica.</p>
      )}
      {lectura.motivo && (
        <p id="motivo-de-lectura" className="flex items-start gap-2 text-sm">
          <Lock aria-hidden="true" strokeWidth={1.75} className="mt-0.5 size-4 flex-none" />
          {lectura.motivo}
        </p>
      )}
      <button
        type="submit"
        disabled={bloqueada}
        aria-describedby={lectura.motivo ? "motivo-de-lectura" : undefined}
        className="min-h-11 w-full rounded-lg bg-primario px-4 font-medium text-primario-texto disabled:cursor-not-allowed disabled:border disabled:border-dashed disabled:border-control disabled:bg-borde disabled:text-foreground disabled:shadow-hundido"
      >
        {ruta === "a_mano" ? "Firmar: te aviso a la hora para publicarla a mano" : "Firmar y programar"}
      </button>
      <button
        type="button"
        disabled={bloqueada}
        onClick={paraLaReserva}
        aria-describedby={lectura.motivo ? "explicacion-de-reserva motivo-de-lectura" : "explicacion-de-reserva"}
        className="min-h-11 w-full rounded-lg border border-borde px-4 font-medium disabled:cursor-not-allowed disabled:border-dashed disabled:border-control disabled:bg-borde disabled:shadow-hundido"
      >
        Firmar para la reserva
      </button>
      <p id="explicacion-de-reserva" className="text-sm text-apagado">
        {explicacionDeReserva(ruta, cuenta)}
      </p>
      {error && (
        <p role="alert" className="text-sm text-peligro">
          {error}
        </p>
      )}
    </form>
  )
}
