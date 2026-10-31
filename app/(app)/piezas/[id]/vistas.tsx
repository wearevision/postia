"use client"

import { useEffect, useRef } from "react"
import { useLectura } from "./lectura"

/** A slide counts as seen once at least this share of it is on screen. */
const PROPORCION_VISTA = 0.9

export function VistasDelCarrusel({ vistas }: { vistas: string[] }) {
  const lectura = useLectura()
  const { marcarLamina } = lectura
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
