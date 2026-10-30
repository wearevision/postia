"use client"

import { useState, useTransition } from "react"
import type { Resultado } from "@/lib/marcas/acciones"

const BOTON = "min-h-11 rounded-lg border border-borde px-4 font-medium disabled:opacity-60"
const RAPIDAS = ["Más corto", "Otro gancho", "Más directo"] as const

function Alerta({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p role="alert" className="text-sm text-peligro">
      {error}
    </p>
  )
}

export function CorregirTexto({
  piezaId,
  texto,
  corregir,
}: {
  piezaId: string
  texto: string
  corregir: (entrada: { piezaId: string; texto: string }) => Promise<Resultado>
}) {
  const [abierto, setAbierto] = useState(false)
  const [valor, setValor] = useState(texto)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className={`${BOTON} w-full`}>
        Corregir a mano
      </button>
    )
  }
  return (
    <form
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault()
        iniciar(async () => {
          const r = await corregir({ piezaId, texto: valor })
          if (!r.ok) return setError(r.error)
          setError(null)
          setAbierto(false)
        })
      }}
      className="space-y-2"
    >
      <label className="block space-y-1">
        <span className="font-medium">Texto</span>
        <textarea
          value={valor}
          onChange={(evento) => setValor(evento.target.value)}
          rows={12}
          className="w-full rounded-lg border border-borde bg-background px-3 py-3"
        />
      </label>
      <p className="text-sm text-apagado">{[...valor].length} de 3000 caracteres</p>
      <div className="flex gap-2">
        <button type="submit" disabled={pendiente} className={`${BOTON} flex-1`}>
          Guardar versión
        </button>
        <button type="button" onClick={() => setAbierto(false)} className={BOTON}>
          Cancelar
        </button>
      </div>
      <Alerta error={error} />
    </form>
  )
}

export function PedirOtraVersion({
  piezaId,
  quedan,
  pedir,
}: {
  piezaId: string
  quedan: number
  pedir: (entrada: { piezaId: string; instruccion: string }) => Promise<Resultado>
}) {
  const [instruccion, setInstruccion] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()

  if (quedan === 0) return <p className="text-sm text-apagado">Ya pediste 3 versiones. Corrígela a mano.</p>

  function enviar(texto: string) {
    iniciar(async () => {
      const r = await pedir({ piezaId, instruccion: texto })
      setError(r.ok ? null : r.error)
      if (r.ok) setInstruccion("")
    })
  }

  return (
    <section aria-labelledby="otra-version" className="space-y-2">
      <h2 id="otra-version" className="font-medium">
        Pedir otra versión
      </h2>
      <p className="text-sm text-apagado">
        Te quedan {quedan} {quedan === 1 ? "versión" : "versiones"} de Claude para esta pieza.
      </p>
      <div className="flex flex-wrap gap-2">
        {RAPIDAS.map((r) => (
          <button key={r} type="button" disabled={pendiente} onClick={() => enviar(r)} className={BOTON}>
            {r}
          </button>
        ))}
      </div>
      <form
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault()
          enviar(instruccion)
        }}
        className="flex gap-2"
      >
        <input
          value={instruccion}
          onChange={(evento) => setInstruccion(evento.target.value)}
          maxLength={500}
          placeholder="Otra instrucción"
          aria-label="Otra instrucción"
          className="min-h-11 flex-1 rounded-lg border border-borde bg-background px-3"
        />
        <button type="submit" disabled={pendiente} className={BOTON}>
          Pedir
        </button>
      </form>
      <Alerta error={error} />
    </section>
  )
}
