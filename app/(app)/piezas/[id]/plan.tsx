"use client"

import { useState, useTransition } from "react"
import type { Resultado } from "@/lib/marcas/acciones"
import { fechaLarga, instanteDesdeValorLocal, valorLocal } from "@/lib/piezas/fechas"

interface Props {
  piezaId: string
  planeadaPara: string | null
  planear: (entrada: { piezaId: string; planeadaPara: string }) => Promise<Resultado>
  /** The piece was just created and no planned date could be proposed for it. */
  sinPlanAlCrear?: boolean
}

export function PlanDePieza({ piezaId, planeadaPara, planear, sinPlanAlCrear = false }: Props) {
  const [moviendo, setMoviendo] = useState(false)
  const [fecha, setFecha] = useState(() => (planeadaPara ? valorLocal(planeadaPara) : ""))
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()

  function guardar(evento: React.FormEvent) {
    evento.preventDefault()
    const instante = instanteDesdeValorLocal(fecha)
    if (!instante) return setError("Elige la fecha y la hora.")
    setError(null)
    iniciar(async () => {
      const resultado = await planear({ piezaId, planeadaPara: instante })
      if (resultado.ok) setMoviendo(false)
      else setError(resultado.error)
    })
  }

  return (
    <section className="space-y-2 tarjeta p-3">
      <h2 className="font-medium">Fecha planeada</h2>
      <p>{planeadaPara ? fechaLarga(planeadaPara) : "Sin fecha planeada"}</p>
      <output className="block text-sm">
        {sinPlanAlCrear &&
          planeadaPara === null &&
          "La pieza se creó, pero no pude ponerle fecha planeada. Elígela aquí."}
      </output>
      <p className="text-sm text-apagado">Es una propuesta: sale solo si la firmas.</p>
      {moviendo ? (
        <form onSubmit={guardar} className="space-y-2">
          <label className="block space-y-1">
            <span className="text-sm">Nueva fecha planeada</span>
            <input
              type="datetime-local"
              value={fecha}
              onChange={(evento) => setFecha(evento.target.value)}
              className="campo w-full"
            />
          </label>
          <button type="submit" disabled={pendiente} className="boton-primario w-full">
            Guardar fecha
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setMoviendo(true)} className="boton w-full">
          Mover fecha
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-peligro">
          {error}
        </p>
      )}
    </section>
  )
}
