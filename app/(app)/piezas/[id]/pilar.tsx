"use client"

import { useState, useTransition } from "react"
import type { Resultado } from "@/lib/marcas/acciones"

interface Props {
  piezaId: string
  pilarId: string | null
  pilarNombre: string | null
  /** The active pillars of the piece's brand. */
  pilares: { id: string; nombre: string }[]
  poner: (entrada: { piezaId: string; pilarId: string | null }) => Promise<Resultado>
}

const CAMPO = "w-full rounded-lg border border-borde bg-background px-3 py-3"

export function PilarDePieza({ piezaId, pilarId, pilarNombre, pilares, poner }: Props) {
  const [guardado, setGuardado] = useState(pilarId ?? "")
  const [valor, setValor] = useState(pilarId ?? "")
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const retirado = pilarId !== null && !pilares.some((p) => p.id === pilarId)

  function cambiar(nuevo: string) {
    setValor(nuevo)
    setError(null)
    iniciar(async () => {
      const resultado = await poner({ piezaId, pilarId: nuevo || null })
      if (!resultado.ok) {
        setValor(guardado)
        return setError(resultado.error)
      }
      setGuardado(nuevo)
    })
  }

  return (
    <div className="space-y-1">
      <label className="block space-y-1">
        <span className="text-sm">Pilar</span>
        <select
          value={valor}
          disabled={pendiente}
          onChange={(evento) => cambiar(evento.target.value)}
          className={`${CAMPO} disabled:opacity-60`}
        >
          <option value="">Sin pilar</option>
          {retirado && pilarId && <option value={pilarId}>{pilarNombre ?? "Pilar"} (ya no está en la línea)</option>}
          {pilares.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="text-sm text-peligro">
          {error}
        </p>
      )}
    </div>
  )
}
