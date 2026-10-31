"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"

interface Lectura {
  puedeFirmar: boolean
  /** Why signing is blocked, in the words shown next to the button; null when nothing blocks it. */
  motivo: string | null
  laminas: number
  vistas: number
  fueVista: (indice: number) => boolean
  marcarLamina: (indice: number) => void
  marcarTexto: () => void
}

/** Outside a reading gate nothing blocks signing. */
const ABIERTA: Lectura = {
  puedeFirmar: true,
  motivo: null,
  laminas: 0,
  vistas: 0,
  fueVista: () => false,
  marcarLamina: () => {},
  marcarTexto: () => {},
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

  const valor = useMemo<Lectura>(() => {
    const faltan = Math.max(0, laminas - vistas.size)
    const motivo =
      faltan > 0
        ? `Viste ${vistas.size} de ${laminas} láminas. Faltan ${faltan} por ver.`
        : textoLeido
          ? null
          : "Falta leer el texto hasta el final."
    const comun = {
      laminas,
      vistas: vistas.size,
      fueVista: (indice: number) => vistas.has(indice),
      marcarLamina,
      marcarTexto,
    }
    if (bloqueo) return { puedeFirmar: false, motivo: bloqueo, ...comun }
    if (!observable) return { ...ABIERTA, ...comun }
    return { puedeFirmar: motivo === null, motivo, ...comun }
  }, [laminas, bloqueo, vistas, textoLeido, observable, marcarLamina, marcarTexto])

  return (
    <Contexto.Provider value={valor}>
      <section className={className}>{children}</section>
    </Contexto.Provider>
  )
}

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
