"use client"

import { useState, useTransition } from "react"
import type { Resultado } from "@/lib/marcas/acciones"
import type { AprendizajeLeido, AprendizajesDeCuenta } from "@/lib/rendimiento/lectura"
import { LARGO_MAXIMO_DEL_APRENDIZAJE } from "@/lib/rendimiento/limites"

export interface AccionesDeAprendizajes {
  decidir: (id: string, estado: "aprobado" | "descartado", texto?: string) => Promise<Resultado>
  pedirLectura: (cuentaId: string) => Promise<Resultado>
}

const COSTO_DE_UNA_LECTURA = "Cuesta cerca de US$0,30"

function useAccion() {
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  function ejecutar(accion: () => Promise<Resultado>, alTerminar?: () => void) {
    setError(null)
    iniciar(async () => {
      const resultado = await accion()
      if (resultado.ok) alTerminar?.()
      else setError(resultado.error)
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

function respaldo(n: number): string {
  return n === 1 ? "Lo respalda 1 publicación" : `Lo respaldan ${n} publicaciones`
}

function PorDecidir({
  aprendizaje,
  pista,
  decidir,
}: {
  aprendizaje: AprendizajeLeido
  pista: boolean
  decidir: AccionesDeAprendizajes["decidir"]
}) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(aprendizaje.texto)
  const { error, pendiente, ejecutar } = useAccion()
  const textoListo = texto.trim().length > 0
  return (
    <li className="tarjeta space-y-2 p-3 text-sm">
      {editando ? (
        <label className="block space-y-1">
          <span className="sr-only">Texto del aprendizaje</span>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={LARGO_MAXIMO_DEL_APRENDIZAJE}
            rows={4}
            aria-label="Texto del aprendizaje"
            className="campo w-full"
          />
        </label>
      ) : (
        <p className="font-medium">{aprendizaje.texto}</p>
      )}
      <p className="text-apagado">{aprendizaje.porque}</p>
      <p className="text-apagado">{respaldo(aprendizaje.respaldo)}</p>
      {pista && <p className="text-apagado">Con menos de 8 publicaciones: úsala con cuidado</p>}
      <div className="flex flex-wrap gap-2">
        {editando ? (
          <>
            <button
              type="button"
              disabled={pendiente || !textoListo}
              onClick={() => ejecutar(() => decidir(aprendizaje.id, "aprobado", texto.trim()))}
              className="boton-primario"
            >
              Aprobar con este texto
            </button>
            <button
              type="button"
              disabled={pendiente}
              onClick={() => {
                setEditando(false)
                setTexto(aprendizaje.texto)
              }}
              className="boton"
            >
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={pendiente}
              onClick={() => ejecutar(() => decidir(aprendizaje.id, "aprobado", undefined))}
              className="boton-primario"
            >
              Aprobar
            </button>
            <button type="button" disabled={pendiente} onClick={() => setEditando(true)} className="boton">
              Editar
            </button>
          </>
        )}
        <button
          type="button"
          disabled={pendiente}
          onClick={() => ejecutar(() => decidir(aprendizaje.id, "descartado", undefined))}
          className="boton"
        >
          Descartar
        </button>
      </div>
      <Alerta error={error} />
    </li>
  )
}

function Aprobado({
  aprendizaje,
  decidir,
}: {
  aprendizaje: AprendizajeLeido
  decidir: AccionesDeAprendizajes["decidir"]
}) {
  const { error, pendiente, ejecutar } = useAccion()
  return (
    <li className="tarjeta space-y-2 p-3 text-sm">
      <p>{aprendizaje.texto}</p>
      <button
        type="button"
        disabled={pendiente}
        onClick={() => ejecutar(() => decidir(aprendizaje.id, "descartado", undefined))}
        className="boton"
      >
        Quitar
      </button>
      <Alerta error={error} />
    </li>
  )
}

export function Aprendizajes({
  cuentaId,
  datos,
  acciones,
}: {
  cuentaId: string
  datos: AprendizajesDeCuenta
  acciones: AccionesDeAprendizajes
}) {
  const { error, pendiente, ejecutar } = useAccion()
  const { porDecidir, pistas, aprobados, leyendo, ultimoFallo } = datos
  const vacio = porDecidir.length + pistas.length + aprobados.length === 0
  return (
    <section aria-labelledby="titulo-aprendizajes" className="space-y-3">
      <h2 id="titulo-aprendizajes" className="text-lg font-semibold">
        Aprendizajes
      </h2>
      {leyendo && <output className="block tarjeta p-3 text-sm">Leyendo tus publicaciones…</output>}
      {!leyendo && ultimoFallo && <p className="text-sm text-peligro">La última lectura no salió: {ultimoFallo}</p>}
      {vacio && !leyendo && (
        <p className="text-sm text-apagado">
          Todavía no hay aprendizajes. PostIA los propone después de leer tus publicaciones con sus cifras.
        </p>
      )}
      {porDecidir.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium">Por decidir</h3>
          <ul aria-label="Por decidir" className="space-y-3">
            {porDecidir.map((a) => (
              <PorDecidir key={a.id} aprendizaje={a} pista={false} decidir={acciones.decidir} />
            ))}
          </ul>
        </div>
      )}
      {pistas.length > 0 && (
        <details className="space-y-2">
          <summary className="min-h-11 cursor-pointer py-2 font-medium">Pistas ({pistas.length})</summary>
          <ul aria-label="Pistas" className="space-y-3">
            {pistas.map((a) => (
              <PorDecidir key={a.id} aprendizaje={a} pista decidir={acciones.decidir} />
            ))}
          </ul>
        </details>
      )}
      {aprobados.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium">Aprobados</h3>
          <ul aria-label="Aprobados" className="space-y-3">
            {aprobados.map((a) => (
              <Aprobado key={a.id} aprendizaje={a} decidir={acciones.decidir} />
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-1">
        <button
          type="button"
          disabled={leyendo || pendiente}
          onClick={() => ejecutar(() => acciones.pedirLectura(cuentaId))}
          className="boton w-full py-3"
        >
          Leer de nuevo
        </button>
        <p className="text-sm text-apagado">{COSTO_DE_UNA_LECTURA}</p>
        <Alerta error={error} />
      </div>
    </section>
  )
}
