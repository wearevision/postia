import Link from "next/link"
import {
  cuentasParaIdeas,
  type EstadoDeIdea,
  type IdeaDeSerie,
  type IdeaSuelta,
  ideasYSeries,
  type SerieDeIdeas,
} from "@/lib/series/lectura"
import { RUTA_DE_IDEAS, RUTA_DE_INVESTIGAR, rutaDeInvestigacion } from "@/lib/sesion/rutas"
import { createClient } from "@/lib/supabase/server"
import { Refrescar } from "../piezas/refrescar"
import {
  aprobarIdeaAccion,
  aprobarSerieAccion,
  descartarIdeaAccion,
  editarIdeaAccion,
  moverAsignacionAccion,
  pedirOtraIdeaAccion,
} from "./acciones"
import { AprobarSerie, TarjetaDeIdea } from "./idea"

type Parametros = Record<string, string | string[] | undefined>

const FILTROS: { estado: EstadoDeIdea | null; nombre: string }[] = [
  { estado: null, nombre: "Todas" },
  { estado: "propuesta", nombre: "Por revisar" },
  { estado: "aprobada", nombre: "Aprobadas" },
  { estado: "descartada", nombre: "Descartadas" },
]

function primero(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor
}

function rutaConFiltro(serie: string | undefined, estado: EstadoDeIdea | null): string {
  const params = new URLSearchParams()
  if (serie) params.set("serie", serie)
  if (estado) params.set("estado", estado)
  const consulta = params.toString()
  return consulta ? `${RUTA_DE_IDEAS}?${consulta}` : RUTA_DE_IDEAS
}

type Cuentas = Awaited<ReturnType<typeof cuentasParaIdeas>>

function Tarjetas({ ideas, cuentas }: { ideas: readonly (IdeaDeSerie | IdeaSuelta)[]; cuentas: Cuentas }) {
  return (
    <div className="space-y-3">
      {ideas.map((idea) => (
        <TarjetaDeIdea
          key={idea.id}
          idea={idea}
          cuentas={cuentas}
          aprobar={aprobarIdeaAccion}
          descartar={descartarIdeaAccion}
          pedirOtra={pedirOtraIdeaAccion}
          editar={editarIdeaAccion}
          mover={moverAsignacionAccion}
        />
      ))}
    </div>
  )
}

/** Crosses or Sunday ideas: shown only once there is one. */
function Grupo({
  titulo,
  ideas,
  estado,
  cuentas,
}: {
  titulo: string
  ideas: readonly IdeaSuelta[]
  estado: EstadoDeIdea | null
  cuentas: Cuentas
}) {
  if (ideas.length === 0) return null
  const visibles = estado ? ideas.filter((i) => i.estado === estado) : ideas
  return (
    <section aria-label={titulo} className="space-y-3">
      <h2 className="text-lg font-medium">{titulo}</h2>
      {visibles.length > 0 ? (
        <Tarjetas ideas={visibles} cuentas={cuentas} />
      ) : (
        <p className="text-sm text-apagado">Nada con este filtro.</p>
      )}
    </section>
  )
}

function Serie({ serie, estado, cuentas }: { serie: SerieDeIdeas; estado: EstadoDeIdea | null; cuentas: Cuentas }) {
  const formatos = serie.ideas.filter((i) => i.estado === "propuesta").map((i) => i.formato)
  const visibles = estado ? serie.ideas.filter((i) => i.estado === estado) : serie.ideas
  const cortas = !serie.trabajando && serie.cantidad !== null && serie.ideas.length < serie.cantidad
  return (
    <section aria-label={serie.tema} className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-lg font-medium">{serie.tema}</h2>
        <Link
          href={rutaDeInvestigacion(serie.investigacionId)}
          className="inline-block min-h-11 py-3 text-sm underline"
        >
          Ver el informe
        </Link>
        {serie.trabajando && <p className="text-sm text-apagado">Se está armando…</p>}
        {serie.fallo && <p className="text-sm text-peligro">{serie.fallo}</p>}
        {cortas && serie.ideas.length > 0 && (
          <p className="text-sm text-apagado">
            Salieron {serie.ideas.length} de las {serie.cantidad} pedidas.
          </p>
        )}
      </div>
      {formatos.length > 0 && (
        <AprobarSerie investigacionId={serie.investigacionId} formatos={formatos} aprobar={aprobarSerieAccion} />
      )}
      {visibles.length > 0 ? (
        <Tarjetas ideas={visibles} cuentas={cuentas} />
      ) : (
        serie.ideas.length > 0 && <p className="text-sm text-apagado">Nada con este filtro.</p>
      )}
    </section>
  )
}

export default async function Ideas({ searchParams }: { searchParams: Promise<Parametros> }) {
  const params = await searchParams
  const serie = primero(params.serie)
  const estado = FILTROS.find((f) => f.estado !== null && f.estado === primero(params.estado))?.estado ?? null
  const db = await createClient()
  const [{ cruces, sueltas, series: lista }, cuentas] = await Promise.all([
    ideasYSeries(db, { investigacionId: serie, estado }),
    cuentasParaIdeas(db),
  ])
  const buscandoOtra = [...cruces, ...sueltas].some((i) => i.pidiendoOtra)

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">Ideas y series</h1>
      {serie && (
        <Link href={rutaConFiltro(undefined, estado)} className="inline-block min-h-11 py-3 text-sm underline">
          Ver todas las series
        </Link>
      )}
      <nav aria-label="Filtro" className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Link
            key={f.nombre}
            href={rutaConFiltro(serie, f.estado)}
            aria-current={f.estado === estado ? "page" : undefined}
            className={`boton rounded-full text-sm ${f.estado === estado ? "font-semibold shadow-hundido" : ""}`}
          >
            {f.nombre}
          </Link>
        ))}
      </nav>
      {lista.some((s) => s.trabajando) ? (
        <Refrescar mensaje="Se está armando la serie. Esta página se actualiza sola." />
      ) : (
        buscandoOtra && <Refrescar mensaje="Se está buscando otra idea. Esta página se actualiza sola." />
      )}
      <Grupo titulo="Cruces" ideas={cruces} estado={estado} cuentas={cuentas} />
      <Grupo titulo="Ideas sueltas del domingo" ideas={sueltas} estado={estado} cuentas={cuentas} />
      {lista.length === 0 ? (
        <div className="space-y-3">
          <p className="text-apagado">Todavía no hay series. Al aprobar un informe, PostIA arma la suya.</p>
          <Link href={RUTA_DE_INVESTIGAR} className="boton w-full py-3">
            Ir a Investigar
          </Link>
        </div>
      ) : (
        lista.map((s) => <Serie key={s.investigacionId} serie={s} estado={estado} cuentas={cuentas} />)
      )}
    </div>
  )
}
