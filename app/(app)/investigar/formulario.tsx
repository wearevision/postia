"use client"

import { useState, useTransition } from "react"
import type { Enfoque, FormatoDeInvestigacion } from "@/lib/investigacion/acciones"
import type { Sugerencia } from "@/lib/investigacion/lectura"
import type { Resultado } from "@/lib/marcas/acciones"

interface Props {
  sugerencias: Sugerencia[]
  pedir: (entrada: {
    tema: string
    cantidad: number
    formato: FormatoDeInvestigacion
    enfoque: Enfoque | null
  }) => Promise<Resultado<{ investigacionId: string }>>
}

const CANTIDADES = [3, 5, 10] as const
const FORMATOS: { valor: FormatoDeInvestigacion; nombre: string }[] = [
  { valor: "texto", nombre: "Post de texto" },
  { valor: "carrusel_pdf", nombre: "Carrusel PDF" },
]
const ENFOQUES: { valor: Enfoque; nombre: string }[] = [
  { valor: "tendencias", nombre: "Tendencias" },
  { valor: "desafios", nombre: "Desafíos" },
  { valor: "mitos", nombre: "Mitos" },
  { valor: "guia", nombre: "Guía" },
]

const CAMPO = "campo w-full"
const OPCION = "boton text-sm aria-pressed:bg-primario aria-pressed:text-primario-texto aria-pressed:shadow-hundido"

export function FormularioDeInvestigacion({ sugerencias, pedir }: Props) {
  const [tema, setTema] = useState("")
  const [cantidad, setCantidad] = useState<number>(5)
  const [formato, setFormato] = useState<FormatoDeInvestigacion>("carrusel_pdf")
  const [enfoque, setEnfoque] = useState<Enfoque | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)
  const [pendiente, iniciar] = useTransition()

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setError(null)
    setListo(false)
    iniciar(async () => {
      const resultado = await pedir({ tema, cantidad, formato, enfoque })
      if (!resultado.ok) return setError(resultado.error)
      setTema("")
      setListo(true)
    })
  }

  return (
    <>
      <form onSubmit={enviar} noValidate className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm">¿Qué quieres investigar?</span>
          <textarea
            value={tema}
            onChange={(evento) => setTema(evento.target.value)}
            rows={3}
            maxLength={300}
            placeholder="Por ejemplo: WR3 y focus groups"
            className={CAMPO}
          />
        </label>
        <fieldset className="space-y-2">
          <legend className="text-sm">¿Cuántas piezas?</legend>
          <div className="flex gap-2">
            {CANTIDADES.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={cantidad === n}
                onClick={() => setCantidad(n)}
                className={`${OPCION} flex-1`}
              >
                {n}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm">Formato</legend>
          {FORMATOS.map((f) => (
            <label key={f.valor} className="tarjeta flex min-h-11 items-center gap-3 px-3">
              <input
                type="radio"
                name="formato"
                value={f.valor}
                checked={formato === f.valor}
                onChange={() => setFormato(f.valor)}
              />
              {f.nombre}
            </label>
          ))}
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm">Enfoque (opcional)</legend>
          <div className="flex flex-wrap gap-2">
            {ENFOQUES.map((e) => (
              <button
                key={e.valor}
                type="button"
                aria-pressed={enfoque === e.valor}
                onClick={() => setEnfoque(enfoque === e.valor ? null : e.valor)}
                className={`${OPCION} rounded-full`}
              >
                {e.nombre}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="space-y-1">
          <button type="submit" disabled={pendiente} className="boton-primario w-full">
            Investigar
          </button>
          <p className="text-sm text-apagado">Cada investigación busca en la web y cuesta cerca de US$1.</p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-peligro">
            {error}
          </p>
        )}
        {listo && <p className="text-sm">Listo. El informe aparece abajo en unos minutos.</p>}
      </form>
      {sugerencias.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Sugerencias</h2>
          <ul className="space-y-2">
            {sugerencias.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setTema(s.tema)}
                  className="block min-h-11 w-full space-y-1 tarjeta p-3 text-left"
                >
                  <span className="block font-medium">{s.tema}</span>
                  <span className="block text-sm text-apagado">{s.enriquece}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
