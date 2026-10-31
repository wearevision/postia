"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import type { Resultado } from "@/lib/marcas/acciones"
import { fechaLarga, instanteDesdeValorLocal, valorLocal } from "@/lib/piezas/fechas"
import { lineaDelPaso, textoDelEsqueleto } from "@/lib/series/esqueleto"
import type { AsignacionDeIdea, CuentaParaIdeas, EstadoDeAsignacion, IdeaDeSerie } from "@/lib/series/lectura"
import { rutaDePieza } from "@/lib/sesion/rutas"

const BOTON = "min-h-11 w-full rounded-lg border border-borde px-4 font-medium disabled:opacity-60"
const PRIMARIO = "min-h-11 w-full rounded-lg bg-primario px-4 font-medium text-primario-texto disabled:opacity-60"
const CAMPO = "w-full rounded-lg border border-borde bg-background px-3 py-3"

const FORMATO = { texto: "Post de texto", carrusel_pdf: "Carrusel PDF" } as const

const NOMBRE_DE_ASIGNACION: Record<EstadoDeAsignacion, string> = {
  por_escribir: "Por escribir",
  escribiendo: "Escribiendo",
  escrita: "Escrita",
  fallo: "No salió",
  descartada: "Descartada",
}

const DIA = new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })

/** A finding's date is a calendar day (YYYY-MM-DD): read in UTC so it never shifts a day. */
function fechaDelHallazgo(dia: string): string {
  return DIA.format(new Date(`${dia}T00:00:00Z`))
}

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
  return { error, setError, pendiente, ejecutar }
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

interface Acciones {
  aprobar: (ideaId: string, cuentas: string[]) => Promise<Resultado>
  descartar: (ideaId: string) => Promise<Resultado>
  pedirOtra: (ideaId: string) => Promise<Resultado>
  editar: (ideaId: string, gancho: string, esqueleto: string) => Promise<Resultado>
  mover: (asignacionId: string, planeadaPara: string) => Promise<Resultado>
}

function Asignacion({ a, mover }: { a: AsignacionDeIdea; mover: Acciones["mover"] }) {
  const [moviendo, setMoviendo] = useState(false)
  const [fecha, setFecha] = useState(() => valorLocal(a.planeadaPara))
  const { error, setError, pendiente, ejecutar } = useAccion()

  function guardar(evento: React.FormEvent) {
    evento.preventDefault()
    const instante = instanteDesdeValorLocal(fecha)
    if (!instante) return setError("Elige la fecha y la hora.")
    ejecutar(
      () => mover(a.id, instante),
      () => setMoviendo(false),
    )
  }

  return (
    <li aria-label={a.cuenta} className="space-y-2 rounded-lg border border-borde p-3 text-sm">
      <p className="font-medium">{a.cuenta}</p>
      <p>{fechaLarga(a.planeadaPara)}</p>
      <p className={a.estado === "fallo" ? "text-peligro" : "text-apagado"}>{NOMBRE_DE_ASIGNACION[a.estado]}</p>
      {a.estado === "fallo" && a.motivo && <p>{a.motivo}</p>}
      {a.piezaId && (
        <Link href={rutaDePieza(a.piezaId)} className="inline-block min-h-11 py-3 underline">
          Ver la pieza
        </Link>
      )}
      {a.estado === "por_escribir" &&
        (moviendo ? (
          <form onSubmit={guardar} className="space-y-2">
            <label className="block space-y-1">
              <span>Nueva fecha</span>
              <input
                type="datetime-local"
                value={fecha}
                onChange={(evento) => setFecha(evento.target.value)}
                className={CAMPO}
              />
            </label>
            <button type="submit" disabled={pendiente} className={PRIMARIO}>
              Guardar fecha
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setMoviendo(true)} className={BOTON}>
            Mover fecha
          </button>
        ))}
      <Alerta error={error} />
    </li>
  )
}

function Edicion({
  idea,
  editar,
  alTerminar,
}: {
  idea: IdeaDeSerie
  editar: Acciones["editar"]
  alTerminar: () => void
}) {
  const [gancho, setGancho] = useState(idea.gancho)
  const [esqueleto, setEsqueleto] = useState(() => textoDelEsqueleto(idea.esqueleto))
  const { error, pendiente, ejecutar } = useAccion()
  const etiqueta = idea.formato === "carrusel_pdf" ? "Esqueleto, una línea por lámina" : "Esqueleto, una línea por paso"
  return (
    <form
      onSubmit={(evento) => {
        evento.preventDefault()
        ejecutar(() => editar(idea.id, gancho, esqueleto), alTerminar)
      }}
      className="space-y-3"
    >
      <label className="block space-y-1 text-sm">
        <span>Gancho</span>
        <input value={gancho} onChange={(e) => setGancho(e.target.value)} maxLength={140} className={CAMPO} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>{etiqueta}</span>
        <textarea value={esqueleto} onChange={(e) => setEsqueleto(e.target.value)} rows={8} className={CAMPO} />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={alTerminar} className={BOTON}>
          Cancelar
        </button>
        <button type="submit" disabled={pendiente} className={PRIMARIO}>
          Guardar cambios
        </button>
      </div>
      <Alerta error={error} />
    </form>
  )
}

function Revision({ idea, cuentas, ...a }: { idea: IdeaDeSerie; cuentas: readonly CuentaParaIdeas[] } & Acciones) {
  const [elegidas, setElegidas] = useState<ReadonlySet<string>>(() => new Set([idea.cuentaSugerida.id]))
  const [editando, setEditando] = useState(false)
  const { error, setError, pendiente, ejecutar } = useAccion()
  // The suggested account always shows, even if it is not among the person's own.
  const opciones = cuentas.some((c) => c.id === idea.cuentaSugerida.id) ? cuentas : [idea.cuentaSugerida, ...cuentas]

  if (editando) return <Edicion idea={idea} editar={a.editar} alTerminar={() => setEditando(false)} />

  function alternar(id: string) {
    const nuevas = new Set(elegidas)
    if (nuevas.has(id)) nuevas.delete(id)
    else nuevas.add(id)
    setElegidas(nuevas)
  }

  function aprobar() {
    const ids = opciones.filter((c) => elegidas.has(c.id)).map((c) => c.id)
    if (ids.length === 0) return setError("Elige al menos una cuenta.")
    ejecutar(() => a.aprobar(idea.id, ids))
  }

  return (
    <div className="space-y-3">
      <fieldset className="space-y-1">
        <legend className="text-sm">Cuentas</legend>
        {opciones.map((c) => (
          <label key={c.id} className="flex min-h-11 items-center gap-3">
            <input type="checkbox" checked={elegidas.has(c.id)} onChange={() => alternar(c.id)} className="size-5" />
            <span>{c.nombre}</span>
          </label>
        ))}
      </fieldset>
      <button type="button" disabled={pendiente} onClick={aprobar} className={PRIMARIO}>
        Aprobar
      </button>
      <div className="grid grid-cols-3 gap-2">
        <button type="button" disabled={pendiente} onClick={() => setEditando(true)} className={BOTON}>
          Editar
        </button>
        <button
          type="button"
          disabled={pendiente || idea.pidiendoOtra}
          onClick={() => ejecutar(() => a.pedirOtra(idea.id))}
          className={BOTON}
        >
          Pedir otra
        </button>
        <button
          type="button"
          disabled={pendiente}
          onClick={() => ejecutar(() => a.descartar(idea.id))}
          className={BOTON}
        >
          Descartar
        </button>
      </div>
      {idea.pidiendoOtra && <p className="text-sm text-apagado">Buscando otra idea…</p>}
      <Alerta error={error} />
    </div>
  )
}

export function TarjetaDeIdea({
  idea,
  cuentas,
  ...acciones
}: { idea: IdeaDeSerie; cuentas: readonly CuentaParaIdeas[] } & Acciones) {
  return (
    <article
      id={`idea-${idea.id}`}
      aria-label={idea.gancho}
      className={`scroll-mt-4 space-y-3 rounded-lg border border-borde p-4 ${idea.estado === "descartada" ? "opacity-60" : ""}`}
    >
      <div className="space-y-1">
        <p className="text-sm text-apagado">
          {FORMATO[idea.formato]}
          {idea.estado === "descartada" && " · "}
          {idea.estado === "descartada" && <span>Descartada</span>}
        </p>
        <h3 className="text-lg font-medium">{idea.gancho}</h3>
      </div>
      <p className="text-sm">{idea.resumen}</p>
      <ol aria-label="Esqueleto" className="list-decimal space-y-1 pl-5 text-sm">
        {idea.esqueleto.map((paso, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the beats have no id and only change by saving the whole list.
          <li key={i}>{lineaDelPaso(paso)}</li>
        ))}
      </ol>
      {idea.fuentes.length > 0 && (
        <ul aria-label="Fuentes" className="space-y-1 text-sm">
          {idea.fuentes.map((f) => (
            <li key={f.id}>
              <a href={f.enlace} target="_blank" rel="noopener noreferrer" className="inline-block py-1 underline">
                {f.medio}
                {f.publicadoEn && ` · ${fechaDelHallazgo(f.publicadoEn)}`}
              </a>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-1 text-sm">
        <p>Sugerida para {idea.cuentaSugerida.nombre}</p>
        <p className="text-apagado">Por qué: {idea.razon}</p>
      </div>
      {idea.estado === "propuesta" && <Revision idea={idea} cuentas={cuentas} {...acciones} />}
      {idea.asignaciones.length > 0 && (
        <ul aria-label="Piezas" className="space-y-2">
          {idea.asignaciones.map((a) => (
            <Asignacion key={a.id} a={a} mover={acciones.mover} />
          ))}
        </ul>
      )}
    </article>
  )
}

/** Every proposal of the series with its suggested account, dates spread in the series' order. */
export function AprobarSerie({
  investigacionId,
  propuestas,
  aprobar,
}: {
  investigacionId: string
  propuestas: number
  aprobar: (investigacionId: string) => Promise<Resultado>
}) {
  const { error, pendiente, ejecutar } = useAccion()
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pendiente}
        onClick={() => ejecutar(() => aprobar(investigacionId))}
        className={PRIMARIO}
      >
        Aprobar la serie
      </button>
      <p className="text-sm text-apagado">
        {propuestas === 1 ? "Aprueba la propuesta" : `Aprueba las ${propuestas} propuestas`} con su cuenta sugerida.
      </p>
      <Alerta error={error} />
    </div>
  )
}
