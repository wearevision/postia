"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import type { Resultado } from "@/lib/marcas/acciones"
import { aBorrador, type Borrador, CAMPOS, deBorrador, NOMBRE_DEL_TIPO } from "@/lib/plantillas/campos"
import type { Familia } from "@/lib/plantillas/estilos"
import { carruselInicial } from "@/lib/plantillas/iniciales"
import { type Carrusel, TIPOS_DE_LAMINA, type TipoDeLamina } from "@/lib/plantillas/laminas"
import { familiaDe, type IdDeTema, TEMAS, temasDeLaVoz } from "@/lib/plantillas/temas"
import { RUTA_DE_CARRUSEL, rutaDePieza } from "@/lib/sesion/rutas"

type Voz = "yo" | "nosotros"

interface Props {
  cuentas: { id: string; nombre: string; voz: Voz }[]
  /** Edit mode: the piece's latest version. */
  inicial?: { piezaId: string; cuentaId: string; tema: IdDeTema; titulo: string; texto: string; diseno: Carrusel }
  pedir: (entrada: unknown) => Promise<Resultado<{ pedidoId: string }>>
}

interface LaminaEnEdicion {
  id: string
  tipo: TipoDeLamina
  borrador: Borrador
}

const CAMPO = "w-full rounded-lg border border-borde bg-background px-3 py-3"
const BOTON = "min-h-11 flex-1 rounded-lg border border-borde px-3 disabled:opacity-40"
// The WAV page posts as WAV more often than as WR3, so its default is WAV's first theme.
const TEMA_INICIAL: Record<Voz, IdDeTema> = { nosotros: "wav-noche", yo: "personal-claro" }
const MAXIMO_DE_LAMINAS = 10
const MINIMO_DE_LAMINAS = 3
const AGREGABLES = TIPOS_DE_LAMINA.filter((t) => t !== "portada" && t !== "cierre")

const enEdicion = (c: Carrusel): LaminaEnEdicion[] =>
  c.laminas.map((l) => ({ id: crypto.randomUUID(), tipo: l.tipo, borrador: aBorrador(l) }))

function ejemploDe(tipo: TipoDeLamina, familia: Familia): Borrador {
  const lamina = carruselInicial(familia).laminas.find((l) => l.tipo === tipo)
  return lamina ? aBorrador(lamina) : {}
}

/** The family's defaults move with the family; whatever Federico wrote over them stays. */
function cambiarDeFamilia(laminas: LaminaEnEdicion[], antes: Familia, despues: Familia): LaminaEnEdicion[] {
  const viejo = ejemploDe("cierre", antes)
  const nuevo = ejemploDe("cierre", despues)
  return laminas.map((l) => {
    if (l.tipo !== "cierre") return l
    const borrador = { ...l.borrador }
    for (const clave of Object.keys(nuevo)) if (borrador[clave] === viejo[clave]) borrador[clave] = nuevo[clave] ?? ""
    return { ...l, borrador }
  })
}

const tituloDePortada = (laminas: LaminaEnEdicion[]) =>
  laminas[0]?.tipo === "portada" ? (laminas[0].borrador.titulo ?? "") : ""

export function EditorDeCarrusel({ cuentas, inicial, pedir }: Props) {
  const router = useRouter()
  const vozDe = (id: string): Voz => cuentas.find((c) => c.id === id)?.voz ?? "yo"
  const primera = inicial?.cuentaId ?? cuentas[0]?.id ?? ""
  const [cuentaId, setCuentaId] = useState(primera)
  const [tema, setTema] = useState<IdDeTema>(inicial?.tema ?? TEMA_INICIAL[vozDe(primera)])
  const familia = familiaDe(tema)
  const [laminas, setLaminas] = useState<LaminaEnEdicion[]>(() =>
    enEdicion(inicial?.diseno ?? carruselInicial(familiaDe(tema))),
  )
  const [antetitulo, setAntetitulo] = useState(inicial?.diseno.antetitulo ?? carruselInicial(familia).antetitulo)
  // A new carousel's document title follows the cover's until Federico writes his own.
  const [titulo, setTitulo] = useState<string | null>(inicial?.titulo ?? null)
  const [texto, setTexto] = useState(inicial?.texto ?? "")
  const [nuevoTipo, setNuevoTipo] = useState<TipoDeLamina>("punto")
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const tituloMostrado = titulo ?? tituloDePortada(laminas)

  function elegirTema(siguiente: IdDeTema) {
    const antes = familiaDe(tema)
    const despues = familiaDe(siguiente)
    if (antes !== despues) {
      setLaminas((ls) => cambiarDeFamilia(ls, antes, despues))
      if (antetitulo === carruselInicial(antes).antetitulo) setAntetitulo(carruselInicial(despues).antetitulo)
    }
    setTema(siguiente)
  }

  function elegirCuenta(id: string) {
    setCuentaId(id)
    const voz = vozDe(id)
    if (!temasDeLaVoz(voz).includes(tema)) elegirTema(TEMA_INICIAL[voz])
  }

  function cambiarCampo(id: string, clave: string, valor: string) {
    setLaminas((ls) => ls.map((l) => (l.id === id ? { ...l, borrador: { ...l.borrador, [clave]: valor } } : l)))
  }

  function mover(indice: number, paso: -1 | 1) {
    setLaminas((ls) => {
      const copia = [...ls]
      const [lamina] = copia.splice(indice, 1)
      if (lamina) copia.splice(indice + paso, 0, lamina)
      return copia
    })
  }

  function quitar(id: string) {
    setLaminas((ls) => ls.filter((l) => l.id !== id))
  }

  function agregar() {
    setLaminas((ls) => [
      ...ls.slice(0, -1),
      { id: crypto.randomUUID(), tipo: nuevoTipo, borrador: ejemploDe(nuevoTipo, familia) },
      ...ls.slice(-1),
    ])
  }

  /** After a queued new carousel: the account and theme stay, everything written goes back to the family's defaults. */
  function empezarDeNuevo() {
    const ejemplo = carruselInicial(familia)
    setLaminas(enEdicion(ejemplo))
    setAntetitulo(ejemplo.antetitulo)
    setTitulo(null)
    setTexto("")
    setNuevoTipo("punto")
  }

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setError(null)
    iniciar(async () => {
      const resultado = await pedir({
        cuentaId,
        piezaId: inicial?.piezaId ?? null,
        tema,
        titulo: tituloMostrado,
        texto,
        diseno: { antetitulo, laminas: laminas.map((l) => deBorrador(l.tipo, l.borrador)) },
      })
      if (!resultado.ok) return setError(resultado.error)
      if (inicial) return router.push(rutaDePieza(inicial.piezaId))
      empezarDeNuevo()
      router.push(RUTA_DE_CARRUSEL)
      router.refresh()
    })
  }

  return (
    <form onSubmit={enviar} noValidate className="space-y-5">
      <label className="block space-y-1">
        <span className="text-sm">Cuenta</span>
        <select
          value={cuentaId}
          onChange={(evento) => elegirCuenta(evento.target.value)}
          disabled={Boolean(inicial)}
          className={CAMPO}
        >
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm">Diseño</legend>
        {temasDeLaVoz(vozDe(cuentaId)).map((t) => (
          <label key={t} className="flex min-h-11 items-center gap-3 rounded-lg border border-borde px-3">
            <input type="radio" name="tema" value={t} checked={tema === t} onChange={() => elegirTema(t)} />
            {TEMAS[t].nombre}
          </label>
        ))}
      </fieldset>

      <label className="block space-y-1">
        <span className="text-sm">Título del documento</span>
        <input
          value={tituloMostrado}
          onChange={(evento) => setTitulo(evento.target.value)}
          maxLength={100}
          className={CAMPO}
        />
      </label>

      <div className="space-y-1">
        <label htmlFor="texto-del-post" className="block text-sm">
          Texto del post
        </label>
        <textarea
          id="texto-del-post"
          aria-describedby="texto-del-post-cuenta"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          rows={6}
          maxLength={3000}
          className={CAMPO}
        />
        <p id="texto-del-post-cuenta" className="text-right text-sm text-apagado">
          {[...texto].length} / 3000
        </p>
      </div>

      <label className="block space-y-1">
        <span className="text-sm">Antetítulo</span>
        <input value={antetitulo} onChange={(evento) => setAntetitulo(evento.target.value)} className={CAMPO} />
      </label>

      {laminas.map((l, i) => {
        const fija = l.tipo === "portada" || l.tipo === "cierre"
        return (
          <fieldset key={l.id} className="space-y-3 rounded-lg border border-borde p-3">
            <legend className="px-1 font-medium">
              Lámina {i + 1} · {NOMBRE_DEL_TIPO[l.tipo]}
            </legend>
            {CAMPOS[l.tipo].map((campo) => {
              const id = `lamina-${l.id}-${campo.clave}`
              const ayuda = campo.ayuda ? `${id}-ayuda` : undefined
              const comun = {
                id,
                "aria-describedby": ayuda,
                value: l.borrador[campo.clave] ?? "",
                onChange: (evento: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                  cambiarCampo(l.id, campo.clave, evento.target.value),
                className: CAMPO,
              }
              return (
                <div key={campo.clave} className="space-y-1">
                  <label htmlFor={id} className="block text-sm">
                    {campo.etiqueta}
                  </label>
                  {campo.forma === "linea" ? <input {...comun} /> : <textarea {...comun} rows={3} />}
                  {campo.ayuda && (
                    <p id={ayuda} className="text-sm text-apagado">
                      {campo.ayuda}
                    </p>
                  )}
                </div>
              )
            })}
            <div className="flex gap-2">
              <button type="button" onClick={() => mover(i, -1)} disabled={fija || i <= 1} className={BOTON}>
                Subir
              </button>
              <button
                type="button"
                onClick={() => mover(i, 1)}
                disabled={fija || i >= laminas.length - 2}
                className={BOTON}
              >
                Bajar
              </button>
              <button
                type="button"
                onClick={() => quitar(l.id)}
                disabled={fija || laminas.length <= MINIMO_DE_LAMINAS}
                className={BOTON}
              >
                Quitar
              </button>
            </div>
          </fieldset>
        )
      })}

      <div className="flex items-end gap-2">
        <label className="block flex-1 space-y-1">
          <span className="text-sm">Tipo de lámina</span>
          <select
            value={nuevoTipo}
            onChange={(evento) => setNuevoTipo(evento.target.value as TipoDeLamina)}
            className={CAMPO}
          >
            {AGREGABLES.map((t) => (
              <option key={t} value={t}>
                {NOMBRE_DEL_TIPO[t]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={agregar}
          disabled={laminas.length >= MAXIMO_DE_LAMINAS}
          className="min-h-11 rounded-lg border border-borde px-3 py-3 disabled:opacity-40"
        >
          Agregar lámina
        </button>
      </div>

      <button
        type="submit"
        disabled={pendiente}
        className="min-h-11 w-full rounded-lg bg-primario px-4 font-medium text-primario-texto disabled:opacity-60"
      >
        Armar carrusel
      </button>
      {inicial && (
        <p className="text-sm text-apagado">
          Al armarlo de nuevo, la firma se cae y la pieza vuelve a esperar tu firma.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-peligro">
          {error}
        </p>
      )}
    </form>
  )
}
