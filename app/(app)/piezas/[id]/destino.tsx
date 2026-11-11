"use client"

import { useState, useTransition } from "react"
import type { Pagina, Web } from "@/lib/destino/paginas"
import type { Resultado } from "@/lib/marcas/acciones"

interface Props {
  piezaId: string
  destino: { web: Web; url: string } | null
  /** The piece has a destination but its latest text no longer carries the link (a correction removed it). */
  enlacePerdido: boolean
  cargar: (entrada: { piezaId: string; web: Web }) => Promise<Resultado<{ paginas: Pagina[] }>>
  poner: (entrada: { piezaId: string; web: Web | null; url: string | null }) => Promise<Resultado>
}

const CAMPO = "campo w-full"

export function DestinoDePieza({ piezaId, destino, enlacePerdido, cargar, poner }: Props) {
  const [web, setWeb] = useState<Web | "">(destino?.web ?? "")
  const [paginas, setPaginas] = useState<Pagina[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()

  function elegirWeb(nueva: Web | "") {
    setWeb(nueva)
    setError(null)
    setPaginas(null)
    iniciar(async () => {
      if (nueva === "") {
        if (!destino) return
        const r = await poner({ piezaId, web: null, url: null })
        if (!r.ok) setError(r.error)
        return
      }
      const r = await cargar({ piezaId, web: nueva })
      if (!r.ok) return setError(r.error)
      setPaginas(r.paginas)
    })
  }

  function elegirPagina(url: string) {
    if (!url || web === "") return
    setError(null)
    iniciar(async () => {
      const r = await poner({ piezaId, web, url })
      if (!r.ok) setError(r.error)
    })
  }

  return (
    <div className="space-y-2">
      <label className="block space-y-1">
        <span className="text-sm">Destino</span>
        <select
          className={CAMPO}
          value={web}
          disabled={pendiente}
          onChange={(e) => elegirWeb(e.target.value as Web | "")}
        >
          <option value="">Sin enlace</option>
          <option value="wr3">WR3</option>
          <option value="wav">wearevision.cl</option>
        </select>
      </label>
      {destino && !paginas && <p className="text-sm text-apagado break-all">Enlaza a {destino.url}</p>}
      {enlacePerdido && (
        <p className="text-sm text-peligro">El texto ya no lleva el enlace de destino. Elige la página de nuevo.</p>
      )}
      {paginas && (
        <label className="block space-y-1">
          <span className="text-sm">Página</span>
          <select className={CAMPO} defaultValue="" disabled={pendiente} onChange={(e) => elegirPagina(e.target.value)}>
            <option value="" disabled>
              Elige una página
            </option>
            {paginas.map((p) => (
              <option key={p.url} value={p.url}>
                {p.titulo}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-peligro">
          {error}
        </p>
      )}
    </div>
  )
}
