import Link from "next/link"
import { RUTA_DE_AJUSTES, RUTA_DE_INICIO, RUTA_DE_MARCAS, RUTA_DE_NUEVA_PIEZA } from "@/lib/sesion/rutas"

const ENLACES = [
  { href: RUTA_DE_INICIO, texto: "Inicio" },
  { href: RUTA_DE_NUEVA_PIEZA, texto: "Nueva" },
  { href: RUTA_DE_MARCAS, texto: "Marcas" },
  { href: RUTA_DE_AJUSTES, texto: "Ajustes" },
]

export function Navegacion() {
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 border-t border-borde bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-md justify-around">
        {ENLACES.map((enlace) => (
          <li key={enlace.href}>
            <Link href={enlace.href} className="block min-h-11 px-6 py-3 text-sm font-medium">
              {enlace.texto}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
