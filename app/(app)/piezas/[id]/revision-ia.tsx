"use client"

import { useState, useTransition } from "react"
import type { Resultado } from "@/lib/marcas/acciones"
import type { VeredictoGuardado } from "@/lib/redaccion/lectura"

/** Claude's gate 1 review: it shows, it never blocks (plano: veredictoDeVoz). */
export function RevisionDeClaude({
  piezaId,
  revision,
  pedirRevision,
  puedePedir,
}: {
  piezaId: string
  revision: VeredictoGuardado | null
  pedirRevision: (piezaId: string) => Promise<Resultado>
  /** False while another request on the piece is open. */
  puedePedir: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()

  if (!revision) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-apagado">Esta versión no tiene revisión de Claude.</p>
        {puedePedir && (
          <button
            type="button"
            disabled={pendiente}
            onClick={() =>
              iniciar(async () => {
                const r = await pedirRevision(piezaId)
                setError(r.ok ? null : r.error)
              })
            }
            className="boton w-full"
          >
            Revisar con Claude
          </button>
        )}
        {error && (
          <p role="alert" className="text-sm text-peligro">
            {error}
          </p>
        )}
      </div>
    )
  }
  return (
    <section aria-labelledby="revision-ia" className="space-y-2 tarjeta p-3">
      <h2 id="revision-ia" className="font-medium">
        Revisión de Claude
      </h2>
      <p className="text-sm">{revision.voz.ok ? "Voz: calza con la línea." : `Voz: ${revision.voz.comentario}`}</p>
      {revision.hallazgos.length === 0 ? (
        <p className="text-sm text-apagado">No encontró clientes aludidos, citas sin fuente ni atribuciones dudosas.</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {revision.hallazgos.map((h) => (
            <li key={`${h.tipo}:${h.fragmento}:${h.comentario}`}>{`«${h.fragmento}»: ${h.comentario}`}</li>
          ))}
        </ul>
      )}
      <p className="text-sm text-apagado">Puedes firmar igual: tú decides.</p>
    </section>
  )
}
