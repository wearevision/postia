import Link from "next/link"
import { leerVista, limitesDelMes, mesDe, semanaDe } from "@/lib/piezas/calendario"
import { calendario } from "@/lib/piezas/lectura"
import { rutaDeCalendario } from "@/lib/sesion/rutas"
import { createClient } from "@/lib/supabase/server"
import { balancePorCuenta } from "@/lib/voz/lectura"
import { VistaDelMes } from "./mes"
import { PilaresDelCalendario } from "./pilares"
import { VistaDeSemana } from "./semana"

type Parametros = Record<string, string | string[] | undefined>

function primero(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor
}

const PESTANA = "boton flex-1"

export default async function Calendario({ searchParams }: { searchParams: Promise<Parametros> }) {
  const params = await searchParams
  const ahora = Date.now()
  const vista = leerVista(
    { vista: primero(params.vista), semana: primero(params.semana), mes: primero(params.mes) },
    ahora,
  )
  const { desde, hasta } = vista.vista === "semana" ? vista.semana : limitesDelMes(vista.mes)
  const db = await createClient()
  const [{ cuentas, piezas }, balances] = await Promise.all([calendario(db, desde, hasta), balancePorCuenta(db, ahora)])
  const enSemana = vista.vista === "semana"
  // From another month, «Semana» opens the week that holds that month's first day.
  const semanaDelMes =
    vista.vista === "mes" && vista.mes !== mesDe(ahora)
      ? semanaDe(Date.parse(limitesDelMes(vista.mes).desde))
      : semanaDe(ahora)
  const aSemana = rutaDeCalendario({ semana: semanaDelMes.lunes })
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
        <VistaDeSemana
          lunes={vista.semana.lunes}
          cuentas={cuentas}
          piezas={piezas}
          terminada={Date.parse(vista.semana.hasta) <= ahora}
        />
      ) : (
        <VistaDelMes mes={vista.mes} piezas={piezas} />
      )}
      <PilaresDelCalendario balances={balances} />
    </div>
  )
}
