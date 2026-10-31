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

export function DescartarHallazgo({
  investigacionId,
  hallazgoId,
  descartar,
}: {
  investigacionId: string
  hallazgoId: string
  descartar: (investigacionId: string, hallazgoId: string) => Promise<Resultado>
}) {
  const { error, pendiente, ejecutar } = useAccion()
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pendiente}
        onClick={() => ejecutar(() => descartar(investigacionId, hallazgoId))}
        className="min-h-11 text-sm text-apagado underline disabled:opacity-60"
      >
        Descartar
      </button>
      <Alerta error={error} />
    </div>
  )
}

export function AmpliarAngulo({
  investigacionId,
  angulo,
  ampliar,
}: {
  investigacionId: string
  angulo: string
  ampliar: (investigacionId: string, angulo: string) => Promise<Resultado>
}) {
  const { error, pendiente, ejecutar } = useAccion()
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pendiente}
        aria-label={`Ampliar ${angulo}`}
        onClick={() => ejecutar(() => ampliar(investigacionId, angulo))}
        className={BOTON}
      >
        Ampliar
      </button>
      <Alerta error={error} />
    </div>
  )
}

export function AprobarInforme({
  investigacionId,
  aprobar,
}: {
  investigacionId: string
  aprobar: (investigacionId: string) => Promise<Resultado>
}) {
  const { error, pendiente, ejecutar } = useAccion()
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pendiente}
        onClick={() => ejecutar(() => aprobar(investigacionId))}
        className="min-h-11 w-full rounded-lg bg-primario px-4 font-medium text-primario-texto disabled:opacity-60"
      >
        Aprobar informe
      </button>
      <p className="text-sm text-apagado">Al aprobarlo, PostIA arma la serie de propuestas.</p>
      <Alerta error={error} />
    </div>
  )
}

export function DescartarInforme({
  investigacionId,
  descartar,
}: {
  investigacionId: string
  descartar: (investigacionId: string) => Promise<Resultado>
}) {
  const [confirmando, setConfirmando] = useState(false)
  const { error, pendiente, ejecutar } = useAccion()
  if (!confirmando) {
    return (
      <button type="button" onClick={() => setConfirmando(true)} className="min-h-11 w-full text-sm text-apagado">
        Descartar informe
      </button>
    )
  }
  return (
    <div className="space-y-2 rounded-lg border border-borde p-3">
      <p className="text-sm">¿Descartar el informe? Sus hallazgos no se vuelven a usar. No se puede deshacer.</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => setConfirmando(false)} className={BOTON}>
          Cancelar
        </button>
        <button
          type="button"
          disabled={pendiente}
          onClick={() => ejecutar(() => descartar(investigacionId))}
          className="min-h-11 w-full rounded-lg bg-peligro px-4 font-medium text-primario-texto disabled:opacity-60"
        >
          Sí, descartar
        </button>
      </div>
      <Alerta error={error} />
    </div>
  )
}

/** For a report approved before 4f, or whose series did not come out. */
export function ArmarSerie({
  investigacionId,
  pedir,
}: {
  investigacionId: string
  pedir: (investigacionId: string) => Promise<Resultado>
}) {
  const { error, pendiente, ejecutar } = useAccion()
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pendiente}
        onClick={() => ejecutar(() => pedir(investigacionId))}
        className="min-h-11 w-full rounded-lg bg-primario px-4 font-medium text-primario-texto disabled:opacity-60"
      >
        Armar la serie
      </button>
      <p className="text-sm text-apagado">PostIA propone las ideas de este informe. Cuesta cerca de US$0,50.</p>
      <Alerta error={error} />
    </div>
  )
}
