import Link from "next/link"
import { type ConteoDeIdeas, rutaConFiltro } from "@/lib/series/filtro"
import type { EstadoDeIdea } from "@/lib/series/lectura"

const FILTROS: { estado: EstadoDeIdea | null; nombre: string }[] = [
  { estado: null, nombre: "Todas" },
  { estado: "propuesta", nombre: "Por revisar" },
  { estado: "aprobada", nombre: "Aprobadas" },
  { estado: "descartada", nombre: "Descartadas" },
]

/** The state chips: the active one wears the same accent as the active tab of the bottom bar. */
export function Filtros({
  serie,
  estado,
  conteos,
}: {
  serie: string | undefined
  estado: EstadoDeIdea | null
  conteos: ConteoDeIdeas
}) {
  const total = conteos.propuesta + conteos.aprobada + conteos.descartada
  return (
    <nav aria-label="Filtro" className="flex flex-wrap gap-2">
      {FILTROS.map((f) => (
        <Link
          key={f.nombre}
          href={rutaConFiltro(serie, f.estado)}
          aria-current={f.estado === estado ? "page" : undefined}
          className="boton rounded-full text-sm text-apagado aria-[current=page]:font-semibold aria-[current=page]:text-primario aria-[current=page]:shadow-hundido"
        >
          {f.nombre} ({f.estado ? conteos[f.estado] : total})
        </Link>
      ))}
    </nav>
  )
}
