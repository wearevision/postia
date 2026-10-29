"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import type { Resultado } from "@/lib/marcas/acciones"
import {
  LARGO_DE_SECCION,
  MAXIMO_DE_PILARES,
  NOMBRE_DE_SECCION,
  type PilarDeLinea,
  SECCIONES,
  type SeccionesDeLinea,
} from "@/lib/voz/linea"

interface Props {
  marcaId: string
  base: number
  secciones: SeccionesDeLinea
  pilares: PilarDeLinea[]
  guardar: (entrada: unknown) => Promise<Resultado<{ version: number }>>
}

const CAMPO = "w-full rounded-lg border border-borde bg-background px-3 py-3"
const PILAR_NUEVO: PilarDeLinea = { nombre: "", deQueHabla: "", material: "", porSemana: 1 }
const POR_SEMANA = [0.5, 1, 2, 3]

function textoPorSemana(n: number): string {
  return n === 0.5 ? "1 cada dos semanas" : `${n.toLocaleString("es-CL")} por semana`
}

export function EditorDeLinea({ marcaId, base, secciones: iniciales, pilares: pilaresIniciales, guardar }: Props) {
  const router = useRouter()
  const [secciones, setSecciones] = useState(iniciales)
  const [pilares, setPilares] = useState(pilaresIniciales.length > 0 ? pilaresIniciales : [PILAR_NUEVO])
  const [error, setError] = useState<string | null>(null)
  const [guardada, setGuardada] = useState<number | null>(null)
  const [pendiente, iniciar] = useTransition()

  function cambiarPilar(i: number, cambios: Partial<PilarDeLinea>) {
    setPilares((ps) => ps.map((p, j) => (j === i ? { ...p, ...cambios } : p)))
  }

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setError(null)
    setGuardada(null)
    iniciar(async () => {
      const resultado = await guardar({ marcaId, base, secciones, pilares })
      if (!resultado.ok) return setError(resultado.error)
      setGuardada(resultado.version)
      router.refresh()
    })
  }

  return (
    <form onSubmit={enviar} className="space-y-5">
      {SECCIONES.map((s) => (
        <label key={s} className="block space-y-1">
          <span className="text-sm font-medium">{NOMBRE_DE_SECCION[s]}</span>
          <textarea
            value={secciones[s]}
            maxLength={LARGO_DE_SECCION[s]}
            rows={s === "ejemplos" ? 12 : 5}
            onChange={(e) => setSecciones((actual) => ({ ...actual, [s]: e.target.value }))}
            className={CAMPO}
          />
        </label>
      ))}

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Pilares</legend>
        {pilares.map((p, i) => (
          <div key={p.id ?? `nuevo-${i}`} className="space-y-2 rounded-lg border border-borde p-3">
            <label className="block space-y-1">
              <span className="text-sm">Nombre del pilar</span>
              <input
                value={p.nombre}
                maxLength={60}
                onChange={(e) => cambiarPilar(i, { nombre: e.target.value })}
                className={CAMPO}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">De qué habla</span>
              <input
                value={p.deQueHabla}
                maxLength={400}
                onChange={(e) => cambiarPilar(i, { deQueHabla: e.target.value })}
                className={CAMPO}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">De dónde sale el material</span>
              <input
                value={p.material}
                maxLength={400}
                onChange={(e) => cambiarPilar(i, { material: e.target.value })}
                className={CAMPO}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Por semana</span>
              <select
                value={p.porSemana}
                onChange={(e) => cambiarPilar(i, { porSemana: Number(e.target.value) })}
                className={CAMPO}
              >
                {/* A target saved outside the usual choices (from the import) stays selectable. */}
                {[...new Set([...POR_SEMANA, p.porSemana])]
                  .sort((a, b) => a - b)
                  .map((n) => (
                    <option key={n} value={n}>
                      {textoPorSemana(n)}
                    </option>
                  ))}
              </select>
            </label>
            {pilares.length > 1 && (
              <button
                type="button"
                onClick={() => setPilares((ps) => ps.filter((_, j) => j !== i))}
                className="min-h-11 text-sm text-apagado underline"
              >
                Quitar {p.nombre.trim() || "este pilar"}
              </button>
            )}
          </div>
        ))}
        {pilares.length < MAXIMO_DE_PILARES && (
          <button
            type="button"
            onClick={() => setPilares((ps) => [...ps, PILAR_NUEVO])}
            className="min-h-11 w-full rounded-lg border border-borde px-4"
          >
            Agregar pilar
          </button>
        )}
      </fieldset>

      <button
        type="submit"
        disabled={pendiente}
        className="min-h-11 w-full rounded-lg bg-primario px-4 font-medium text-primario-texto disabled:opacity-60"
      >
        {pendiente ? "Guardando…" : "Guardar versión nueva"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-peligro">
          {error}
        </p>
      )}
      <output className="block text-sm">{guardada !== null && `Guardada como versión ${guardada}.`}</output>
    </form>
  )
}
