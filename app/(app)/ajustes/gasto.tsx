"use client"

import { useId, useState, useTransition } from "react"
import type { ResumenDeGasto } from "@/lib/gasto/lectura"
import { enDolares } from "@/lib/gasto/precios"
import type { Resultado } from "@/lib/marcas/acciones"

const CAMPO = "w-full rounded-lg border border-borde bg-background px-3 py-3"

export function GastoDelMes({
  resumen,
  guardar,
}: {
  resumen: ResumenDeGasto
  guardar: (entrada: { marcaId: string | null; dolares: number | null }) => Promise<Resultado>
}) {
  const id = useId()
  const [dolares, setDolares] = useState(String(resumen.topeMicro / 1_000_000))
  const [pendiente, empezar] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)
  const porcentaje = Math.floor((resumen.gastadoMicro * 100) / resumen.topeMicro)

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setError(null)
    setGuardado(false)
    empezar(async () => {
      try {
        const resultado = await guardar({ marcaId: null, dolares: Number(dolares) })
        if (resultado.ok) setGuardado(true)
        else setError(resultado.error)
      } catch (falla) {
        // An expired session or a dropped network rejects the action; uncaught, the error boundary replaces the page.
        console.error("No pude guardar el tope", falla)
        setError("No pude guardar el tope. Inténtalo de nuevo en un rato.")
      }
    })
  }

  return (
    <section aria-labelledby={`${id}-titulo`} className="space-y-3">
      <h2 id={`${id}-titulo`} className="text-lg font-semibold">
        Gasto del mes
      </h2>
      <p>
        <span>
          {enDolares(resumen.gastadoMicro)} de {enDolares(resumen.topeMicro)}
        </span>{" "}
        <span className="text-sm text-apagado">({porcentaje} %)</span>
      </p>
      <ul className="space-y-1 text-sm">
        {resumen.filas.map((f) => (
          <li key={f.marcaId ?? "general"} className="flex justify-between gap-3">
            <span>{f.nombre}</span>
            <span>
              {enDolares(f.gastadoMicro)}
              {f.topeMicro !== null && ` de ${enDolares(f.topeMicro)}`}
            </span>
          </li>
        ))}
      </ul>
      <form noValidate className="space-y-2" onSubmit={enviar}>
        <label className="block space-y-1">
          <span className="text-sm">Tope mensual (US$)</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={1000}
            step={1}
            value={dolares}
            onChange={(e) => setDolares(e.target.value)}
            className={CAMPO}
          />
        </label>
        <button
          type="submit"
          disabled={pendiente}
          className="min-h-11 w-full rounded-lg border border-borde px-4 font-medium disabled:opacity-60"
        >
          Guardar tope
        </button>
        {error && (
          <p role="alert" className="text-sm text-peligro">
            {error}
          </p>
        )}
        <output className="block text-sm">{guardado && "Tope guardado."}</output>
      </form>
    </section>
  )
}
