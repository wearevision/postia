"use client"

import { useState, useTransition } from "react"
import type { Resultado } from "@/lib/marcas/acciones"

interface Props {
  piezaId: string
  texto: string
  archivoUrl: string | null
  cerrar: (entrada: { piezaId: string; enlace: string }) => Promise<Resultado>
}

const BOTON = "min-h-11 w-full rounded-lg border border-borde px-4 text-center font-medium leading-[2.75rem]"

export function PublicarAMano({ piezaId, texto, archivoUrl, cerrar }: Props) {
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enlace, setEnlace] = useState("")
  const [pendiente, iniciar] = useTransition()

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setAviso("Texto copiado.")
    } catch {
      setAviso("No pude copiar. Mantén apretado el texto para copiarlo.")
    }
  }

  function cerrarPieza(evento: React.FormEvent) {
    evento.preventDefault()
    setError(null)
    iniciar(async () => {
      const resultado = await cerrar({ piezaId, enlace })
      if (!resultado.ok) setError(resultado.error)
    })
  }

  return (
    <section className="space-y-3">
      <h2 className="font-medium">Publícala a mano</h2>
      <button type="button" onClick={copiar} className={BOTON}>
        Copiar texto
      </button>
      {archivoUrl && (
        <a href={archivoUrl} download className={`block ${BOTON}`}>
          Descargar PDF
        </a>
      )}
      {aviso && <output className="block text-sm text-apagado">{aviso}</output>}
      <form onSubmit={cerrarPieza} className="space-y-2">
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
          Ya lo publiqué
        </button>
        {error && (
          <p role="alert" className="text-sm text-peligro">
            {error}
          </p>
        )}
      </form>
    </section>
  )
}
