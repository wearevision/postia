"use client"

import { useState, useTransition } from "react"
import type { Resultado } from "@/lib/marcas/acciones"

const BOTON = "min-h-11 w-full rounded-lg border border-borde px-4 font-medium disabled:opacity-60"

function useAccion() {
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  function ejecutar(accion: () => Promise<Resultado>) {
    setError(null)
    iniciar(async () => {
      const resultado = await accion()
      if (!resultado.ok) setError(resultado.error)
    })
  }
  return { error, pendiente, ejecutar }
}

function Alerta({ error }: { error: string | null }) {
  return (
    error && (
      <p role="alert" className="text-sm text-peligro">
        {error}
      </p>
    )
  )
}

export function Desprogramar({
  piezaId,
  desprogramar,
}: {
  piezaId: string
  desprogramar: (id: string) => Promise<Resultado>
}) {
  const { error, pendiente, ejecutar } = useAccion()
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pendiente}
        onClick={() => ejecutar(() => desprogramar(piezaId))}
        className={BOTON}
      >
        Desprogramar
      </button>
      <Alerta error={error} />
    </div>
  )
}

export function Descartar({
  piezaId,
  descartar,
}: {
  piezaId: string
  descartar: (id: string, motivo: string) => Promise<Resultado>
}) {
  const [confirmando, setConfirmando] = useState(false)
  const [motivo, setMotivo] = useState("")
  const { error, pendiente, ejecutar } = useAccion()
  if (!confirmando) {
    return (
      <button type="button" onClick={() => setConfirmando(true)} className="min-h-11 w-full text-sm text-apagado">
        Descartar
      </button>
    )
  }
  return (
    <div className="space-y-2 rounded-lg border border-borde p-3">
      <p className="text-sm">¿Descartar esta pieza? No se puede deshacer.</p>
      <label className="block space-y-1">
        <span className="text-sm">Motivo (opcional)</span>
        <input
          // biome-ignore lint/a11y/noAutofocus: the person just tapped Descartar; the reason field is the next step.
          autoFocus
          value={motivo}
          maxLength={500}
          onChange={(evento) => setMotivo(evento.target.value)}
          className="w-full rounded-lg border border-borde bg-background px-3 py-3"
        />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={() => setConfirmando(false)} className={BOTON}>
          Cancelar
        </button>
        <button
          type="button"
          disabled={pendiente}
          onClick={() => ejecutar(() => descartar(piezaId, motivo))}
          className="min-h-11 w-full rounded-lg bg-peligro px-4 font-medium text-primario-texto disabled:opacity-60"
        >
          Sí, descartar
        </button>
      </div>
      <Alerta error={error} />
    </div>
  )
}

export function EnvioDudoso({
  piezaId,
  cerrar,
  noSalio,
}: {
  piezaId: string
  cerrar: (entrada: { piezaId: string; enlace: string }) => Promise<Resultado>
  noSalio: (id: string) => Promise<Resultado>
}) {
  const [enlace, setEnlace] = useState("")
  const { error, pendiente, ejecutar } = useAccion()
  return (
    <section className="space-y-3">
      <h2 className="font-medium">Revisa tu LinkedIn</h2>
      <p className="text-sm text-apagado">No sé si esta pieza salió. Mira si está publicada y dime qué viste.</p>
      <form
        onSubmit={(evento) => {
          evento.preventDefault()
          ejecutar(() => cerrar({ piezaId, enlace }))
        }}
        className="space-y-2"
      >
        <label className="block space-y-1">
          <span className="text-sm">Enlace de la publicación</span>
          <input
            type="url"
            value={enlace}
            onChange={(evento) => setEnlace(evento.target.value)}
            placeholder="https://www.linkedin.com/…"
            className="w-full rounded-lg border border-borde bg-background px-3 py-3"
          />
        </label>
        <button
          type="submit"
          disabled={pendiente}
          className="min-h-11 w-full rounded-lg bg-primario px-4 font-medium text-primario-texto disabled:opacity-60"
        >
          Sí salió
        </button>
      </form>
      <button type="button" disabled={pendiente} onClick={() => ejecutar(() => noSalio(piezaId))} className={BOTON}>
        No salió
      </button>
      <Alerta error={error} />
    </section>
  )
}
