"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  RUTA_DE_AJUSTES,
  RUTA_DE_CALENDARIO,
  RUTA_DE_INICIO,
  RUTA_DE_MARCAS,
  RUTA_DE_NUEVA_PIEZA,
} from "@/lib/sesion/rutas"

const ENLACES = [
  { href: RUTA_DE_INICIO, texto: "Inicio" },
  { href: RUTA_DE_NUEVA_PIEZA, texto: "Nueva" },
  { href: RUTA_DE_CALENDARIO, texto: "Calendario" },
  { href: RUTA_DE_MARCAS, texto: "Marcas" },
  { href: RUTA_DE_AJUSTES, texto: "Ajustes" },
]

export function Navegacion() {
  const ruta = usePathname()
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 border-t border-borde bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-md">
        {ENLACES.map((enlace) => (
          <li key={enlace.href} className="flex-1">
            <Link
              href={enlace.href}
              aria-current={ruta === enlace.href ? "page" : undefined}
              className="block min-h-11 px-1 py-3 text-center text-sm font-medium aria-[current=page]:underline"
            >
              {enlace.texto}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
