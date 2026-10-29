"use client"

import { useId, useState, useTransition } from "react"
import { esPalabraComun, variantesDelNombre } from "@/lib/clientes/alias"
import { type ClienteConCasos, TIPOS_DE_EXCEPCION } from "@/lib/clientes/lectura"
import type { TipoDeExcepcion } from "@/lib/clientes/revision"
import type { Resultado } from "@/lib/marcas/acciones"

type Marcar = (entrada: unknown) => Promise<Resultado<{ id: string }>>
type Quitar = (id: string) => Promise<Resultado>

const CAMPO = "w-full rounded-lg border border-borde bg-background px-3 py-3"

function esTipo(valor: string): valor is TipoDeExcepcion {
  return Object.hasOwn(TIPOS_DE_EXCEPCION, valor)
}

function fechaCorta(dia: string): string {
  return dia.split("-").reverse().join("-")
}

function aliasEscritos(alias: string): string[] {
  return alias
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)
}

interface FormularioProps {
  /** Null when the person types the client's name (a client without cases, such as a WR3 study). */
  cliente: string | null
  casos: ClienteConCasos["casos"]
  marcar: Marcar
}

function FormularioDeExcepcion({ cliente, casos, marcar }: FormularioProps) {
  const id = useId()
  const [nombreEscrito, setNombreEscrito] = useState("")
  const [tipo, setTipo] = useState<TipoDeExcepcion>("no_nombrar")
  const [casoSlug, setCasoSlug] = useState("")
  const [alias, setAlias] = useState("")
  const [hasta, setHasta] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [marcada, setMarcada] = useState(false)
  const [pendiente, iniciar] = useTransition()
  const nombre = (cliente ?? nombreEscrito).trim()
  const escritos = aliasEscritos(alias)
  const sugerencias = variantesDelNombre(nombre).filter((v) => !escritos.includes(v.toLowerCase()))
  const unaPalabra = nombre !== "" && !/\s/.test(nombre)

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setError(null)
    setMarcada(false)
    iniciar(async () => {
      const resultado = await marcar({ cliente: nombre, ...(casoSlug ? { casoSlug } : {}), tipo, alias, hasta })
      if (!resultado.ok) return setError(resultado.error)
      setMarcada(true)
      setCasoSlug("")
      setAlias("")
      setHasta("")
      if (cliente === null) setNombreEscrito("")
    })
  }

  return (
    <form className="mt-3 space-y-3" onSubmit={enviar}>
      {cliente === null && (
        <label className="block space-y-1">
          <span className="text-sm">Nombre del cliente</span>
          <input
            value={nombreEscrito}
            maxLength={120}
            onChange={(e) => setNombreEscrito(e.target.value)}
            className={CAMPO}
          />
        </label>
      )}
      <label className="block space-y-1">
        <span className="text-sm">Tipo de excepción</span>
        <select value={tipo} onChange={(e) => esTipo(e.target.value) && setTipo(e.target.value)} className={CAMPO}>
          {Object.entries(TIPOS_DE_EXCEPCION).map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </select>
      </label>
      {casos.length > 0 && (
        <label className="block space-y-1">
          <span className="text-sm">Solo este caso</span>
          <select value={casoSlug} onChange={(e) => setCasoSlug(e.target.value)} className={CAMPO}>
            <option value="">Todos sus casos</option>
            {casos.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.titulo}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="space-y-1">
        <label htmlFor={`${id}-alias`} className="block text-sm">
          Otros nombres, separados por coma
        </label>
        <input
          id={`${id}-alias`}
          value={alias}
          maxLength={600}
          onChange={(e) => setAlias(e.target.value)}
          aria-describedby={`${id}-ayuda`}
          className={CAMPO}
        />
        <div id={`${id}-ayuda`} className="space-y-2 text-sm text-apagado">
          <p>La revisión ya ignora mayúsculas, tildes y espacios de más.</p>
          {unaPalabra && (
            <p>
              Si el nombre también se escribe separado o de otra forma, agrega cada versión: por ejemplo, «Anglo
              American» para ANGLOAMERICAN.
            </p>
          )}
        </div>
        {sugerencias.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {sugerencias.map((v) => (
              <li key={v}>
                <button
                  type="button"
                  onClick={() => setAlias((actual) => (actual.trim() ? `${actual.trim()}, ${v}` : v))}
                  className="min-h-11 rounded-full border border-borde px-3 text-sm"
                >
                  Agregar «{v}»
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {esPalabraComun(nombre) && (
        <p className="rounded-lg border border-borde p-3 text-sm">
          Ojo: «{nombre}» también es una palabra común. Con «No se nombra» o «Confidencial», la revisión avisará cada
          vez que aparezca, aunque el texto no hable del cliente.
        </p>
      )}
      <label className="block space-y-1">
        <span className="text-sm">Hasta (opcional)</span>
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={CAMPO} />
      </label>
      <button
        type="submit"
        disabled={pendiente}
        className="min-h-11 w-full rounded-lg border border-borde px-4 font-medium disabled:opacity-60"
      >
        Marcar excepción
      </button>
      {error && (
        <p role="alert" className="text-sm text-peligro">
          {error}
        </p>
      )}
      <output className="block text-sm">{marcada && "Excepción marcada."}</output>
    </form>
  )
}

interface Props {
  cliente: ClienteConCasos
  marcar: Marcar
  quitar: Quitar
  abierto?: boolean
}

export function ExcepcionesDeCliente({ cliente, marcar, quitar, abierto = false }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const cuantas = cliente.excepciones.length

  function quitarExcepcion(id: string) {
    setError(null)
    iniciar(async () => {
      const resultado = await quitar(id)
      if (!resultado.ok) setError(resultado.error)
    })
  }

  return (
    <details open={abierto} className="rounded-lg border border-borde px-4 py-1">
      <summary className="flex min-h-11 cursor-pointer items-center py-2 font-medium">
        {cliente.cliente}
        {cuantas > 0 && (
          <span className="ml-1 font-normal text-apagado">
            · {cuantas} {cuantas === 1 ? "excepción" : "excepciones"}
          </span>
        )}
      </summary>
      <ul className="mt-1 space-y-1 text-sm">
        {cliente.casos.map((c) => (
          <li key={c.slug}>
            {c.titulo} · {c.anio ?? "sin año"} · {c.era === "wav" ? "WAV" : "trayectoria"}
          </li>
        ))}
      </ul>
      {cuantas > 0 && (
        <ul className="mt-3 space-y-1">
          {cliente.excepciones.map((e) => {
            const caso = e.casoSlug ? (cliente.casos.find((c) => c.slug === e.casoSlug)?.titulo ?? e.casoSlug) : null
            return (
              <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  <strong className="font-medium">{TIPOS_DE_EXCEPCION[e.tipo]}</strong>
                  {caso && <span className="text-apagado"> · solo {caso}</span>}
                  {e.alias.length > 0 && <span className="text-apagado"> · también {e.alias.join(", ")}</span>}
                  {e.hasta && <span className="text-apagado"> · hasta el {fechaCorta(e.hasta)}</span>}
                </span>
                <button
                  type="button"
                  disabled={pendiente}
                  aria-label={`Quitar ${TIPOS_DE_EXCEPCION[e.tipo]}`}
                  onClick={() => quitarExcepcion(e.id)}
                  className="min-h-11 shrink-0 px-2 text-apagado underline disabled:opacity-60"
                >
                  Quitar
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-peligro">
          {error}
        </p>
      )}
      <FormularioDeExcepcion cliente={cliente.cliente} casos={cliente.casos} marcar={marcar} />
    </details>
  )
}

export function ClienteFueraDeLaLista({ marcar }: { marcar: Marcar }) {
  return (
    <details className="rounded-lg border border-borde px-4 py-1">
      <summary className="flex min-h-11 cursor-pointer items-center py-2 font-medium">
        Cliente que no está en la lista
      </summary>
      <p className="text-sm text-apagado">Por ejemplo, un estudio confidencial de WR3.</p>
      <FormularioDeExcepcion cliente={null} casos={[]} marcar={marcar} />
    </details>
  )
}
