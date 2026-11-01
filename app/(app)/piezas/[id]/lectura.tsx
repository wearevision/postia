"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"

interface Lectura {
  puedeFirmar: boolean
  /** Why signing is blocked, in the words shown next to the button; null when nothing blocks it. */
  motivo: string | null
  laminas: number
  vistas: number
  /** Slides still to see when they are what blocks signing; 0 otherwise. */
  laminasPorVer: number
  fueVista: (indice: number) => boolean
  marcarLamina: (indice: number) => void
  marcarTexto: () => void
  /** The sheet with every slide together, opened from the carousel or from the lock reason. */
  hojaAbierta: boolean
  /** `origen`: the control that opened it, which gets the focus back on close. */
  abrirHoja: (origen: HTMLElement | null) => void
  /** Closes the sheet and gives the focus back to the control that opened it. */
  cerrarHoja: () => void
}

/** Outside a reading gate nothing blocks signing. */
const ABIERTA: Lectura = {
  puedeFirmar: true,
  motivo: null,
  laminas: 0,
  vistas: 0,
  laminasPorVer: 0,
  fueVista: () => false,
  marcarLamina: () => {},
  marcarTexto: () => {},
  hojaAbierta: false,
  abrirHoja: () => {},
  cerrarHoja: () => {},
}

const Contexto = createContext<Lectura>(ABIERTA)

export const useLectura = () => useContext(Contexto)

/**
 * Signing needs the whole piece seen: every slide at least 90% visible and the end of the text reached.
 * Mount it with `key` set to the version's fingerprint so a new version starts unread.
 * A browser that cannot observe visibility is never locked out by reading, but a `bloqueo` always holds.
 */
export function LecturaDePieza({
  laminas,
  bloqueo = null,
  className,
  children,
}: {
  laminas: number
  /** A reason signing stays blocked whatever is read (slides that could not be shown); null when none. */
  bloqueo?: string | null
  className?: string
  children: React.ReactNode
}) {
  const [vistas, setVistas] = useState<ReadonlySet<number>>(() => new Set())
  const [textoLeido, setTextoLeido] = useState(false)
  // Assume the gate until proven otherwise, so the server markup and the first client render agree.
  const [observable, setObservable] = useState(true)
  useEffect(() => setObservable(typeof IntersectionObserver !== "undefined"), [])

  const marcarLamina = useCallback((indice: number) => {
    setVistas((antes) => (antes.has(indice) ? antes : new Set(antes).add(indice)))
  }, [])
  const marcarTexto = useCallback(() => setTextoLeido(true), [])
  const [hojaAbierta, setHojaAbierta] = useState(false)
  const abiertaDesde = useRef<HTMLElement | null>(null)
  const abrirHoja = useCallback((origen: HTMLElement | null) => {
    abiertaDesde.current = origen
    setHojaAbierta(true)
  }, [])
  const cerrarHoja = useCallback(() => {
    setHojaAbierta(false)
    abiertaDesde.current?.focus()
  }, [])

  const valor = useMemo<Lectura>(() => {
    const faltan = Math.max(0, laminas - vistas.size)
    const motivo =
      faltan > 0 ? faltanLaminas(faltan, laminas) : textoLeido ? null : "Falta leer el texto hasta el final."
    const comun = {
      laminas,
      vistas: vistas.size,
      laminasPorVer: 0,
      fueVista: (indice: number) => vistas.has(indice),
      marcarLamina,
      marcarTexto,
      hojaAbierta,
      abrirHoja,
      cerrarHoja,
    }
    if (bloqueo) return { ...comun, puedeFirmar: false, motivo: bloqueo }
    if (!observable) return { ...ABIERTA, ...comun }
    return { ...comun, puedeFirmar: motivo === null, motivo, laminasPorVer: faltan }
  }, [laminas, bloqueo, vistas, textoLeido, observable, marcarLamina, marcarTexto, hojaAbierta, abrirHoja, cerrarHoja])

  return (
    <Contexto.Provider value={valor}>
      <section className={className}>{children}</section>
    </Contexto.Provider>
  )
}

/** The lock reason for unseen slides, saying how to see them; the sheet is offered only with more than one slide. */
export function faltanLaminas(faltan: number, laminas: number): string {
  if (laminas === 1) return "Te falta ver la lámina entera."
  const cuantas = faltan === 1 ? "Te falta 1 lámina" : `Te faltan ${faltan} láminas`
  return `${cuantas}: desliza o toca «${botonDeLaHoja(laminas)}».`
}

export const botonDeLaHoja = (laminas: number) => `Ver las ${laminas} juntas`

/** A hairline after the text: when it scrolls into view the person has reached the end. */
export function FinDelTexto() {
  const { marcarTexto } = useLectura()
  const marca = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const elemento = marca.current
    if (!elemento || typeof IntersectionObserver === "undefined") return
    // The bottom bar covers the last ~120 px of the page: the end only counts as read once it is above the bar.
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((entrada) => entrada.isIntersecting)) marcarTexto()
      },
      { rootMargin: "0px 0px -120px 0px" },
    )
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [marcarTexto])
  return <span ref={marca} data-testid="fin-del-texto" aria-hidden="true" className="block h-px" />
}
