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
  const guardada: Web | "" = destino?.web ?? ""
  const [web, setWeb] = useState<Web | "">(guardada)
  const [paginas, setPaginas] = useState<Pagina[] | null>(null)
  const [pagina, setPagina] = useState("")
  const [quitando, setQuitando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()

  /** Any failure leaves the selects showing what the database holds. */
  function fallar(mensaje: string) {
    setError(mensaje)
    setWeb(guardada)
    setPaginas(null)
    setPagina("")
    setQuitando(false)
  }

  function cargarPaginas(nueva: Web) {
    setWeb(nueva)
    setError(null)
    setPaginas(null)
    setPagina("")
    setQuitando(false)
    iniciar(async () => {
      const r = await cargar({ piezaId, web: nueva })
      if (!r.ok) return fallar(r.error)
      setPaginas(r.paginas)
    })
  }

  function elegirWeb(nueva: Web | "") {
    if (nueva !== "") return cargarPaginas(nueva)
    setWeb("")
    setError(null)
    setPaginas(null)
    setPagina("")
    // Removing the link writes a new text version: it waits for a second, explicit tap.
    setQuitando(destino !== null)
  }

  function cancelarQuitar() {
    setQuitando(false)
    setWeb(guardada)
  }

  function quitar() {
    setError(null)
    iniciar(async () => {
      const r = await poner({ piezaId, web: null, url: null })
      if (!r.ok) return fallar(r.error)
      setQuitando(false)
    })
  }

  function elegirPagina(url: string) {
    if (!url || web === "") return
    setPagina(url)
    setError(null)
    iniciar(async () => {
      const r = await poner({ piezaId, web, url })
      if (!r.ok) return fallar(r.error)
      setPaginas(null)
      setPagina("")
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
      {destino && !paginas && !quitando && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-apagado break-all">Enlaza a {destino.url}</p>
          <button type="button" className="boton" disabled={pendiente} onClick={() => cargarPaginas(destino.web)}>
            Cambiar página
          </button>
        </div>
      )}
      {quitando && (
        <div className="space-y-2 tarjeta p-3">
          <p className="text-sm">¿Quitar el enlace del texto?</p>
          <div className="flex gap-2">
            <button type="button" className="boton-primario flex-1" disabled={pendiente} onClick={cancelarQuitar}>
              Cancelar
            </button>
            <button type="button" className="boton flex-1" disabled={pendiente} onClick={quitar}>
              Quitar el enlace
            </button>
          </div>
        </div>
      )}
      {enlacePerdido && (
        <p className="text-sm text-peligro">El texto ya no lleva el enlace de destino. Elige la página de nuevo.</p>
      )}
      {paginas && (
        <label className="block space-y-1">
          <span className="text-sm">Página</span>
          <select className={CAMPO} value={pagina} disabled={pendiente} onChange={(e) => elegirPagina(e.target.value)}>
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
