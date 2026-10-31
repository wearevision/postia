"use client"

import { CalendarDays, CirclePlus, House, Layers, type LucideIcon, SlidersHorizontal } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  RUTA_DE_AJUSTES,
  RUTA_DE_CALENDARIO,
  RUTA_DE_CARRUSEL,
  RUTA_DE_INICIO,
  RUTA_DE_INVESTIGAR,
  RUTA_DE_MARCAS,
  RUTA_DE_NUEVA_PIEZA,
  RUTA_DE_PEDIR_TEXTO,
  RUTA_DE_VOZ,
} from "@/lib/sesion/rutas"

type Enlace = { href: string; texto: string; icono: LucideIcon; activa: (ruta: string) => boolean }

const dentroDe = (base: string) => (ruta: string) => ruta === base || ruta.startsWith(`${base}/`)

const ENLACES: Enlace[] = [
  { href: RUTA_DE_INICIO, texto: "Inicio", icono: House, activa: (ruta) => ruta === RUTA_DE_INICIO },
  {
    href: RUTA_DE_NUEVA_PIEZA,
    texto: "Nueva",
    icono: CirclePlus,
    activa: (ruta) =>
      [RUTA_DE_NUEVA_PIEZA, RUTA_DE_PEDIR_TEXTO, RUTA_DE_CARRUSEL].includes(ruta) || dentroDe(RUTA_DE_INVESTIGAR)(ruta),
  },
  { href: RUTA_DE_CALENDARIO, texto: "Calendario", icono: CalendarDays, activa: dentroDe(RUTA_DE_CALENDARIO) },
  {
    href: RUTA_DE_MARCAS,
    texto: "Marcas",
    icono: Layers,
    activa: (ruta) => dentroDe(RUTA_DE_MARCAS)(ruta) || dentroDe(RUTA_DE_VOZ)(ruta),
  },
  { href: RUTA_DE_AJUSTES, texto: "Ajustes", icono: SlidersHorizontal, activa: dentroDe(RUTA_DE_AJUSTES) },
]

const CREACION = new Set([RUTA_DE_NUEVA_PIEZA, RUTA_DE_PEDIR_TEXTO, RUTA_DE_CARRUSEL])

/** `/piezas/<id>`: the signing flow, where the bar steps aside and only «Volver» stays. */
const esDetalleDePieza = (ruta: string) => /^\/piezas\/[^/]+$/.test(ruta) && !CREACION.has(ruta)

export function Navegacion() {
  const ruta = usePathname()
  if (esDetalleDePieza(ruta)) return null
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-3.5 bottom-[calc(1rem+env(safe-area-inset-bottom))] mx-auto max-w-[402px] rounded-[28px] border border-control bg-background p-1.5 shadow-relieve"
    >
      <ul className="flex gap-1">
        {ENLACES.map(({ href, texto, icono: Icono, activa }) => (
          <li key={href} className="flex-1">
            <Link
              href={href}
              aria-current={activa(ruta) ? "page" : undefined}
              className="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[22px] text-xs font-medium text-apagado aria-[current=page]:font-semibold aria-[current=page]:text-primario aria-[current=page]:shadow-hundido"
            >
              <Icono aria-hidden="true" strokeWidth={1.75} className="size-[18px]" />
              {texto}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
