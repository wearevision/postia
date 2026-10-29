import Link from "next/link"
import { leerVista, limitesDelMes, mesDe, semanaDe } from "@/lib/piezas/calendario"
import { calendario } from "@/lib/piezas/lectura"
import { rutaDeCalendario } from "@/lib/sesion/rutas"
import { createClient } from "@/lib/supabase/server"
import { VistaDelMes } from "./mes"
import { VistaDeSemana } from "./semana"

type Parametros = Record<string, string | string[] | undefined>

function primero(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor
}

const PESTANA = "flex min-h-11 flex-1 items-center justify-center rounded-lg border border-borde px-4 font-medium"

export default async function Calendario({ searchParams }: { searchParams: Promise<Parametros> }) {
  const params = await searchParams
  const ahora = Date.now()
  const vista = leerVista(
    { vista: primero(params.vista), semana: primero(params.semana), mes: primero(params.mes) },
    ahora,
  )
  const { desde, hasta } = vista.vista === "semana" ? vista.semana : limitesDelMes(vista.mes)
  const { cuentas, piezas } = await calendario(await createClient(), desde, hasta)
  const enSemana = vista.vista === "semana"
  const aSemana = rutaDeCalendario({ semana: semanaDe(ahora).lunes })
  const aMes = rutaDeCalendario({ mes: vista.vista === "semana" ? mesDe(Date.parse(vista.semana.desde)) : vista.mes })

  return (
    <div className="mx-auto max-w-md space-y-5">
      <h1 className="text-2xl font-semibold">Calendario</h1>
      <nav aria-label="Vista" className="flex gap-2">
        <Link
          href={aSemana}
          aria-current={enSemana ? "page" : undefined}
          className={`${PESTANA} ${enSemana ? "bg-primario text-primario-texto" : ""}`}
        >
          Semana
        </Link>
        <Link
          href={aMes}
          aria-current={enSemana ? undefined : "page"}
          className={`${PESTANA} ${enSemana ? "" : "bg-primario text-primario-texto"}`}
        >
          Mes
        </Link>
      </nav>
      {vista.vista === "semana" ? (
        <VistaDeSemana lunes={vista.semana.lunes} cuentas={cuentas} piezas={piezas} />
      ) : (
        <VistaDelMes mes={vista.mes} piezas={piezas} />
      )}
    </div>
  )
}
