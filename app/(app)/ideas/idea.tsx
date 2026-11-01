"use client"

import { ChevronDown } from "lucide-react"
import Link from "next/link"
import { createContext, useContext, useEffect, useState, useTransition } from "react"
import { enDolares } from "@/lib/gasto/precios"
import type { Resultado } from "@/lib/marcas/acciones"
import { fechaLarga, instanteDesdeValorLocal, valorLocal } from "@/lib/piezas/fechas"
import type { AsignacionAprobada } from "@/lib/series/acciones"
import { costoAproximado } from "@/lib/series/costo"
import { lineaDelPaso, textoDelEsqueleto } from "@/lib/series/esqueleto"
import type {
  AsignacionDeIdea,
  CuentaParaIdeas,
  EstadoDeAsignacion,
  FuenteConResumen,
  FuenteDeIdea,
  IdeaDeSerie,
  IdeaSuelta,
} from "@/lib/series/lectura"
import type { FormatoDeIdea } from "@/lib/series/propuestas"
import { rutaDePieza } from "@/lib/sesion/rutas"
import { useAccionDiferida } from "./aprobacion-diferida"
import { useAvisar } from "./confirmaciones"

interface ConteoDeSerie {
  /** Cards of the series whose single approval is counting down. */
  enCurso: number
  contar: (delta: number) => void
}

/** Cards outside a series (crosses, Sunday ideas) have nothing to block. */
const SIN_SERIE: ConteoDeSerie = { enCurso: 0, contar: () => {} }

const ConteoDeSerieContexto = createContext<ConteoDeSerie>(SIN_SERIE)

/** Lets «Aprobar la serie» know when a card of the series has an approval counting down. */
export function SerieEnCurso({ children }: { children: React.ReactNode }) {
  const [enCurso, setEnCurso] = useState(0)
  const [valor] = useState(() => ({ contar: (delta: number) => setEnCurso((n) => n + delta) }))
  return <ConteoDeSerieContexto.Provider value={{ enCurso, ...valor }}>{children}</ConteoDeSerieContexto.Provider>
}

const ESPERA_EN_CURSO = "Espera a que termine la aprobación en curso."

const BOTON = "boton w-full"
const PRIMARIO = "boton-primario w-full"
const CAMPO = "campo w-full"

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

function EnlaceDeFuente({ fuente }: { fuente: FuenteDeIdea }) {
  return (
    <a href={fuente.enlace} target="_blank" rel="noopener noreferrer" className="inline-block py-1 underline">
      {fuente.medio}
      {fuente.publicadoEn && ` · ${fechaDelHallazgo(fuente.publicadoEn)}`}
    </a>
  )
}

/** The two findings a cross was born from: side by side when the card is wide enough, stacked on a phone. */
function NaceDe({ fuentes }: { fuentes: readonly FuenteConResumen[] }) {
  return (
    <div className="@container space-y-1 text-sm">
      <p className="font-medium">Nace de:</p>
      <ul aria-label="Nace de:" className="grid gap-2 @sm:grid-cols-2">
        {fuentes.map((f) => (
          <li key={f.id} className="tarjeta space-y-1 p-3">
            <EnlaceDeFuente fuente={f} />
            <p className="text-apagado">{f.resumen}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

function useAccion() {
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  function ejecutar<T extends object>(
    accion: () => Promise<Resultado<T>>,
    alTerminar?: (resultado: { ok: true } & T) => void,
  ) {
    setError(null)
    iniciar(async () => {
      const resultado = await accion()
      if (resultado.ok) alTerminar?.(resultado)
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
  aprobar: (ideaId: string, cuentas: string[]) => Promise<Resultado<{ asignaciones: AsignacionAprobada[] }>>
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
    <li aria-label={a.cuenta} className="space-y-2 tarjeta p-3 text-sm">
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

function BotonDeDetalle({ abierta, alternar }: { abierta: boolean; alternar: () => void }) {
  return (
    <button type="button" aria-expanded={abierta} onClick={alternar} className="min-h-11 text-sm underline">
      {abierta ? "Ocultar detalle" : "Ver detalle"}
    </button>
  )
}

/** Everything the compact card folds away: summary, beats, sources and why that account. */
function Detalle({ idea }: { idea: IdeaDeSerie | IdeaSuelta }) {
  return (
    <div className="space-y-3">
      <p className="text-sm">{idea.resumen}</p>
      <ol aria-label="Esqueleto" className="list-decimal space-y-1 pl-5 text-sm">
        {idea.esqueleto.map((paso, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the beats have no id and only change by saving the whole list.
          <li key={i}>{lineaDelPaso(paso)}</li>
        ))}
      </ol>
      {"origen" in idea && idea.origen === "cruce" ? (
        <NaceDe fuentes={idea.fuentes} />
      ) : (
        idea.fuentes.length > 0 && (
          <ul aria-label="Fuentes" className="space-y-1 text-sm">
            {idea.fuentes.map((f) => (
              <li key={f.id}>
                <EnlaceDeFuente fuente={f} />
              </li>
            ))}
          </ul>
        )
      )}
      <div className="space-y-1 text-sm">
        <p>Sugerida para {idea.cuentaSugerida.nombre}</p>
        <p className="text-apagado">Por qué: {idea.razon}</p>
      </div>
    </div>
  )
}

function Revision({
  idea,
  cuentas,
  abierta,
  alternarDetalle,
  abrirDetalle,
  elegidas,
  alternar,
  detalle,
  ...a
}: {
  idea: IdeaDeSerie
  cuentas: readonly CuentaParaIdeas[]
  abierta: boolean
  alternarDetalle: () => void
  abrirDetalle: () => void
  elegidas: ReadonlySet<string>
  alternar: (id: string) => void
  detalle: React.ReactNode
} & Acciones) {
  const [editando, setEditando] = useState(false)
  const { error, setError, pendiente, ejecutar } = useAccion()
  const diferida = useAccionDiferida()
  const avisar = useAvisar()
  const { contar } = useContext(ConteoDeSerieContexto)
  useEffect(() => {
    if (!diferida.esperando) return
    contar(1)
    return () => contar(-1)
  }, [diferida.esperando, contar])
  // While an approval counts down nothing else may run: a discard would land before the approval it cannot undo.
  const ocupada = pendiente || diferida.esperando
  const opciones = opcionesDeCuenta(idea, cuentas)
  const nombres = opciones.filter((c) => elegidas.has(c.id)).map((c) => c.nombre)

  if (editando) return <Edicion idea={idea} editar={a.editar} alTerminar={() => setEditando(false)} />

  function aprobar() {
    const ids = opciones.filter((c) => elegidas.has(c.id)).map((c) => c.id)
    if (ids.length === 0) return setError("Elige al menos una cuenta.")
    diferida.programar(() =>
      ejecutar(
        () => a.aprobar(idea.id, ids),
        ({ asignaciones }) => {
          if (asignaciones.length === 0) return
          const porFecha = [...asignaciones].sort((x, y) => x.planeadaPara.localeCompare(y.planeadaPara))
          const cuentasAprobadas = opciones.filter((c) => ids.includes(c.id)).map((c) => c.nombre)
          avisar({ tipo: "idea", ideaId: idea.id, cuentas: cuentasAprobadas, primera: porFecha[0].planeadaPara })
        },
      ),
    )
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={ocupada}
        onClick={abrirDetalle}
        aria-expanded={abierta}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-borde px-4 text-sm disabled:opacity-60"
      >
        Para: {nombres.length > 0 ? nombres.join(", ") : "elegir cuenta"}
        <ChevronDown aria-hidden="true" strokeWidth={1.75} className="size-4 shrink-0" />
      </button>
      <div className="grid grid-cols-2 gap-2">
        {diferida.esperando ? (
          <button type="button" onClick={diferida.cancelar} className={BOTON}>
            Deshacer
          </button>
        ) : (
          <button type="button" disabled={pendiente} onClick={aprobar} className={PRIMARIO}>
            Aprobar
          </button>
        )}
        <button type="button" disabled={ocupada} onClick={() => ejecutar(() => a.descartar(idea.id))} className={BOTON}>
          Descartar
        </button>
      </div>
      {diferida.esperando && (
        <output className="block text-sm text-apagado">
          Se aprueba en {diferida.restante} s · si sales antes, no se aprueba
        </output>
      )}
      {idea.pidiendoOtra && <p className="text-sm text-apagado">Buscando otra idea…</p>}
      <BotonDeDetalle abierta={abierta} alternar={alternarDetalle} />
      {abierta && (
        <div className="space-y-3">
          {detalle}
          <fieldset disabled={ocupada} className="space-y-1">
            <legend className="text-sm">Cuentas</legend>
            {opciones.map((c) => (
              <label key={c.id} className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  checked={elegidas.has(c.id)}
                  onChange={() => alternar(c.id)}
                  className="size-5"
                />
                <span>{c.nombre}</span>
              </label>
            ))}
          </fieldset>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={ocupada} onClick={() => setEditando(true)} className={BOTON}>
              Editar
            </button>
            <button
              type="button"
              disabled={ocupada || idea.pidiendoOtra}
              onClick={() => ejecutar(() => a.pedirOtra(idea.id))}
              className={BOTON}
            >
              Pedir otra
            </button>
          </div>
        </div>
      )}
      <Alerta error={error} />
    </div>
  )
}

/** The suggested account always shows, even if it is not among the person's own. */
function opcionesDeCuenta(idea: IdeaDeSerie | IdeaSuelta, cuentas: readonly CuentaParaIdeas[]) {
  return cuentas.some((c) => c.id === idea.cuentaSugerida.id) ? cuentas : [idea.cuentaSugerida, ...cuentas]
}

export function TarjetaDeIdea({
  idea,
  cuentas,
  ...acciones
}: { idea: IdeaDeSerie | IdeaSuelta; cuentas: readonly CuentaParaIdeas[] } & Acciones) {
  const [abierta, setAbierta] = useState(false)
  const [elegidas, setElegidas] = useState<ReadonlySet<string>>(() => new Set([idea.cuentaSugerida.id]))
  const origen = "origen" in idea ? idea.origen : "serie"

  function alternar(id: string) {
    const nuevas = new Set(elegidas)
    if (nuevas.has(id)) nuevas.delete(id)
    else nuevas.add(id)
    setElegidas(nuevas)
  }

  return (
    <article
      id={`idea-${idea.id}`}
      aria-label={idea.gancho}
      className={`scroll-mt-4 space-y-3 tarjeta p-4 ${idea.estado === "descartada" ? "opacity-60" : ""}`}
    >
      <div className="space-y-1">
        <p className="text-sm text-apagado">
          {FORMATO[idea.formato]}
          {origen === "domingo" && " · "}
          {origen === "domingo" && <span>Idea del domingo</span>}
          {idea.estado === "descartada" && " · "}
          {idea.estado === "descartada" && <span>Descartada</span>}
        </p>
        <h3 className="text-lg font-medium">{idea.gancho}</h3>
      </div>
      {idea.estado === "propuesta" && (
        <Revision
          idea={idea}
          cuentas={cuentas}
          abierta={abierta}
          alternarDetalle={() => setAbierta(!abierta)}
          abrirDetalle={() => setAbierta(true)}
          elegidas={elegidas}
          alternar={alternar}
          detalle={<Detalle idea={idea} />}
          {...acciones}
        />
      )}
      {(idea.estado === "aprobada" || idea.estado === "descartada") && (
        <>
          <BotonDeDetalle abierta={abierta} alternar={() => setAbierta(!abierta)} />
          {abierta && <Detalle idea={idea} />}
        </>
      )}
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
  formatos,
  aprobar,
}: {
  investigacionId: string
  formatos: readonly FormatoDeIdea[]
  aprobar: (investigacionId: string) => Promise<Resultado<{ aprobadas: number }>>
}) {
  const { error, pendiente, ejecutar } = useAccion()
  const avisar = useAvisar()
  const { enCurso } = useContext(ConteoDeSerieContexto)
  const [confirmando, setConfirmando] = useState(false)
  const esperaAprobacion = enCurso > 0
  const piezas = formatos.length === 1 ? "1 pieza" : `${formatos.length} piezas`
  if (!confirmando)
    return (
      <div className="space-y-1">
        <button type="button" disabled={esperaAprobacion} onClick={() => setConfirmando(true)} className={PRIMARIO}>
          Aprobar la serie
        </button>
        <p className="text-sm text-apagado">
          {esperaAprobacion ? ESPERA_EN_CURSO : `Aprueba ${piezas} con su cuenta sugerida.`}
        </p>
      </div>
    )
  return (
    <fieldset className="min-w-0 space-y-2 tarjeta p-3">
      <legend className="sr-only">Confirmar la serie</legend>
      <p>
        Claude escribe {piezas} en unos minutos. Cuesta cerca de {enDolares(costoAproximado(formatos))}.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={pendiente || esperaAprobacion}
          onClick={() =>
            ejecutar(
              () => aprobar(investigacionId),
              ({ aprobadas }) => avisar({ tipo: "serie", aprobadas }),
            )
          }
          className={PRIMARIO}
        >
          Confirmar
        </button>
        <button type="button" disabled={pendiente} onClick={() => setConfirmando(false)} className={BOTON}>
          Cancelar
        </button>
      </div>
      {esperaAprobacion && <p className="text-sm text-apagado">{ESPERA_EN_CURSO}</p>}
      <Alerta error={error} />
    </fieldset>
  )
}
