"use client"

import { LayoutGrid } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { botonDeLaHoja as nombreDelBoton, useLectura } from "./lectura"

/** A slide counts as seen once at least this share of it is on screen. */
const PROPORCION_VISTA = 0.9

export function VistasDelCarrusel({ vistas }: { vistas: string[] }) {
  const lectura = useLectura()
  const { marcarLamina, hojaAbierta, abrirHoja, cerrarHoja } = lectura
  const lista = useRef<HTMLOListElement>(null)

  useEffect(() => {
    const raiz = lista.current
    if (!raiz || typeof IntersectionObserver === "undefined") return
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.intersectionRatio >= PROPORCION_VISTA)
            marcarLamina(Number((entrada.target as HTMLElement).dataset.i))
        }
      },
      { root: raiz, threshold: [PROPORCION_VISTA, 1] },
    )
    for (const lamina of raiz.querySelectorAll("li")) observador.observe(lamina)
    return () => observador.disconnect()
  }, [marcarLamina])

  return (
    <>
      <ol
        ref={lista}
        aria-label="Láminas del carrusel"
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"
      >
        {vistas.map((src, i) => (
          <li key={src} data-i={i} className="w-[85%] flex-none snap-center">
            {/* biome-ignore lint/performance/noImgElement: signed Supabase URLs of the exact published images; no Next image optimizer on Cloudflare */}
            <img
              src={src}
              alt={`Lámina ${i + 1} de ${vistas.length}`}
              width={1080}
              height={1350}
              className="h-auto w-full rounded-lg border border-borde"
            />
          </li>
        ))}
      </ol>
      {vistas.length > 1 && (
        <button
          type="button"
          onClick={(evento) => abrirHoja(evento.currentTarget)}
          className="flex min-h-11 items-center gap-2 px-1 font-medium underline"
        >
          <LayoutGrid aria-hidden="true" strokeWidth={1.75} className="size-4" />
          {nombreDelBoton(vistas.length)}
        </button>
      )}
      {hojaAbierta && vistas.length > 1 && <HojaDeLaminas vistas={vistas} alCerrar={cerrarHoja} />}
      {lectura.laminas > 0 && (
        <div role="img" aria-label={`Viste ${lectura.vistas} de ${lectura.laminas} láminas`} className="flex gap-2">
          {vistas.map((src, i) => (
            <span
              key={src}
              aria-hidden="true"
              className={`size-2.5 rounded-full border border-control ${lectura.fueVista(i) ? "bg-foreground" : "shadow-hundido"}`}
            />
          ))}
        </div>
      )}
    </>
  )
}

/** Every slide in a grid. Only slides really shown here count as seen; confirming needs the end of the sheet. */
function HojaDeLaminas({ vistas, alCerrar }: { vistas: string[]; alCerrar: () => void }) {
  const { marcarLamina } = useLectura()
  const raiz = useRef<HTMLDivElement>(null)
  const lista = useRef<HTMLOListElement>(null)
  const desplazable = useRef<HTMLDivElement>(null)
  const fin = useRef<HTMLSpanElement>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const [alFinal, setAlFinal] = useState(false)
  // The parent passes a new function each render; the effect must run once or it would steal the focus back.
  const cerrar = useRef(alCerrar)
  cerrar.current = alCerrar

  useEffect(() => {
    titulo.current?.focus()
    const cerrarConEscape = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") cerrar.current()
    }
    document.addEventListener("keydown", cerrarConEscape)
    const inertes = Array.from(document.body.children).filter(
      (hijo) => hijo !== raiz.current && !hijo.hasAttribute("inert"),
    )
    for (const hijo of inertes) hijo.setAttribute("inert", "")
    return () => {
      document.removeEventListener("keydown", cerrarConEscape)
      for (const hijo of inertes) hijo.removeAttribute("inert")
    }
  }, [])

  useEffect(() => {
    const zona = desplazable.current
    const laminas = lista.current
    if (!zona || !laminas || typeof IntersectionObserver === "undefined") {
      setAlFinal(true)
      return
    }
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.intersectionRatio >= PROPORCION_VISTA || pasoEntera(entrada))
            marcarLamina(Number((entrada.target as HTMLElement).dataset.i))
        }
      },
      // 0 too, to hear a slide leave: a fast scroll can carry it past without any frame at 90 %.
      { root: zona, threshold: [0, PROPORCION_VISTA, 1] },
    )
    // Its own observer at threshold 0: the 1 px marker can sit at a fractional position where only part of it ever
    // shows at full scroll, so a 90 % threshold never fired and «Listo» stayed disabled on shorter screens.
    const alLlegar = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((entrada) => entrada.isIntersecting)) setAlFinal(true)
      },
      { root: zona, threshold: 0 },
    )
    for (const lamina of laminas.querySelectorAll("li")) observador.observe(lamina)
    if (fin.current) alLlegar.observe(fin.current)
    return () => {
      observador.disconnect()
      alLlegar.disconnect()
    }
  }, [marcarLamina])

  return createPortal(
    <div
      ref={raiz}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-de-la-hoja"
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      <div className="flex items-center justify-between gap-3 p-4">
        <h2 id="titulo-de-la-hoja" ref={titulo} tabIndex={-1} className="font-medium">
          Las {vistas.length} láminas
        </h2>
        <button type="button" onClick={alCerrar} className="min-h-11 px-3 font-medium underline">
          Cerrar
        </button>
      </div>
      <div ref={desplazable} className="flex-1 overflow-y-auto overscroll-contain px-4">
        <ol ref={lista} className="grid grid-cols-2 gap-3">
          {vistas.map((src, i) => (
            <li key={src} data-i={i}>
              {/* biome-ignore lint/performance/noImgElement: signed Supabase URLs of the exact published images; no Next image optimizer on Cloudflare */}
              <img
                src={src}
                alt={`Lámina ${i + 1} de ${vistas.length}`}
                width={1080}
                height={1350}
                className="h-auto w-full rounded-lg border border-borde"
              />
            </li>
          ))}
        </ol>
        <span ref={fin} data-testid="fin-de-la-hoja" aria-hidden="true" className="block h-px" />
      </div>
      <div className="p-4">
        <button
          type="button"
          disabled={!alFinal}
          onClick={alCerrar}
          className="min-h-11 w-full rounded-lg bg-primario px-4 font-medium text-primario-texto disabled:cursor-not-allowed disabled:border disabled:border-dashed disabled:border-control disabled:bg-borde disabled:text-foreground disabled:shadow-hundido"
        >
          {alFinal ? "Listo" : `Baja hasta ver las ${vistas.length}`}
        </button>
      </div>
    </div>,
    document.body,
  )
}

/**
 * A slide that left through the top of the sheet crossed all of it; if it is shorter than the sheet it was whole on
 * screen at some point, even when the scroll was too fast for the observer to catch that frame.
 */
function pasoEntera(entrada: IntersectionObserverEntry): boolean {
  const caja = entrada.rootBounds
  if (entrada.isIntersecting || !caja) return false
  const lamina = entrada.boundingClientRect
  return lamina.bottom <= caja.top && lamina.height <= caja.height
}
