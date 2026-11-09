import { cifra, porcentajeDeAudiencia } from "@/lib/rendimiento/formato"
import type { FilaDePublicoConCambio } from "@/lib/rendimiento/lectura"

const SECCIONES: { tipos: FilaDePublicoConCambio["tipo"][]; titulo: string }[] = [
  { tipos: ["publico", "seguidores"], titulo: "Quienes te siguen" },
  { tipos: ["contenido"], titulo: "Quienes vieron tus publicaciones" },
  { tipos: ["visitantes"], titulo: "Quienes visitaron la página" },
]

const PALABRA_DE_CAMBIO = { nuevo: "nuevo", sube: "sube", baja: "baja", igual: "igual" } as const

function agruparPorCategoria(filas: FilaDePublicoConCambio[]): [string, FilaDePublicoConCambio[]][] {
  const grupos = new Map<string, FilaDePublicoConCambio[]>()
  for (const f of filas) grupos.set(f.categoria, [...(grupos.get(f.categoria) ?? []), f])
  return [...grupos.entries()]
}

function Seccion({ titulo, filas }: { titulo: string; filas: FilaDePublicoConCambio[] }) {
  const id = `publico-${titulo.replaceAll(" ", "-")}`
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h3 id={id} className="font-semibold">
        {titulo}
      </h3>
      {agruparPorCategoria(filas).map(([categoria, items]) => (
        <div key={categoria} className="space-y-1">
          <p className="text-sm text-apagado">{categoria}</p>
          <ul aria-label={`${titulo}: ${categoria}`} className="space-y-1 text-sm">
            {items.map((f) => {
              const porcentaje = porcentajeDeAudiencia(f)
              return (
                <li key={f.valor} className="flex flex-wrap justify-between gap-x-3">
                  <span>{f.valor}</span>
                  <span className="text-apagado">
                    {[
                      porcentaje,
                      f.cantidad === null ? null : cifra(f.cantidad),
                      f.cambio && PALABRA_DE_CAMBIO[f.cambio],
                    ]
                      .filter((x) => x !== null)
                      .join(" · ")}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}

export function Publico({ filas }: { filas: FilaDePublicoConCambio[] }) {
  if (filas.length === 0) return null
  // A profile's followers come as «publico» and a page's as «seguidores»: both read as «Quienes te siguen».
  const secciones = SECCIONES.flatMap(({ tipos, titulo }) => {
    const delTipo = filas.filter((f) => tipos.includes(f.tipo))
    return delTipo.length === 0 ? [] : [{ titulo, filas: delTipo }]
  })
  return (
    <section aria-labelledby="titulo-publico" className="space-y-4">
      <h2 id="titulo-publico" className="text-lg font-semibold">
        Tu público
      </h2>
      {secciones.map((s) => (
        <Seccion key={s.titulo} titulo={s.titulo} filas={s.filas} />
      ))}
    </section>
  )
}
