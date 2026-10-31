"use client"

import { CalendarDays, House, Lightbulb, type LucideIcon, Search, SlidersHorizontal } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  RUTA_DE_AJUSTES,
  RUTA_DE_CALENDARIO,
  RUTA_DE_CLIENTES,
  RUTA_DE_IDEAS,
  RUTA_DE_INICIO,
  RUTA_DE_INVESTIGAR,
  RUTA_DE_MARCAS,
  RUTA_DE_VOZ,
} from "@/lib/sesion/rutas"

type Enlace = { href: string; texto: string; icono: LucideIcon; activa: (ruta: string) => boolean }

const dentroDe = (base: string) => (ruta: string) => ruta === base || ruta.startsWith(`${base}/`)

const ENLACES: Enlace[] = [
  { href: RUTA_DE_INICIO, texto: "Inicio", icono: House, activa: (ruta) => ruta === RUTA_DE_INICIO },
  { href: RUTA_DE_IDEAS, texto: "Ideas", icono: Lightbulb, activa: dentroDe(RUTA_DE_IDEAS) },
  { href: RUTA_DE_INVESTIGAR, texto: "Investigar", icono: Search, activa: dentroDe(RUTA_DE_INVESTIGAR) },
  { href: RUTA_DE_CALENDARIO, texto: "Calendario", icono: CalendarDays, activa: dentroDe(RUTA_DE_CALENDARIO) },
  {
    href: RUTA_DE_AJUSTES,
    texto: "Ajustes",
    icono: SlidersHorizontal,
    // Accounts, voice and clients are settings screens reached from Ajustes.
    activa: (ruta) =>
      [RUTA_DE_AJUSTES, RUTA_DE_MARCAS, RUTA_DE_VOZ, RUTA_DE_CLIENTES].some((base) => dentroDe(base)(ruta)),
  },
]

export function Navegacion() {
  const ruta = usePathname()
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
