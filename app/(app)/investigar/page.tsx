import Link from "next/link"
import {
  type InvestigacionReciente,
  investigacionesRecientes,
  NOMBRE_DEL_ESTADO_DE_INVESTIGACION,
  sugerencias,
} from "@/lib/investigacion/lectura"
import { notaDeUltimaVigilancia, ordenarInvestigaciones } from "@/lib/investigacion/orden"
import { fechaLarga } from "@/lib/piezas/fechas"
import { rutaDeInvestigacion } from "@/lib/sesion/rutas"
import { createClient } from "@/lib/supabase/server"
import { Refrescar } from "../piezas/refrescar"
import { pedirInvestigacionAccion } from "./acciones"
import { TarjetaEnCurso } from "./en-curso"
import { NuevaInvestigacion } from "./nueva"

function cuantos(n: number): string {
  return n === 1 ? "1 hallazgo" : `${n} hallazgos`
}

function Tarjeta({ i }: { i: InvestigacionReciente }) {
  return (
    <li>
      <Link href={rutaDeInvestigacion(i.id)} className="block min-h-11 space-y-1 tarjeta p-3 text-sm">
        <span className="block text-apagado">
          {i.origen === "vigilancia" ? "Vigilancia · " : ""}
          {fechaLarga(i.creadaEn)} · {NOMBRE_DEL_ESTADO_DE_INVESTIGACION[i.estado]}
        </span>
        <span className="line-clamp-2 block text-base">{i.tema}</span>
        <span className="block text-apagado">{cuantos(i.hallazgos)}</span>
        {i.motivo && <span className="block text-peligro">{i.motivo}</span>}
      </Link>
    </li>
  )
}

export default async function Investigar() {
  const db = await createClient()
  const [recientes, sugeridas] = await Promise.all([investigacionesRecientes(db, 20), sugerencias(db)])
  const { enCurso, porAprobar, resto, ultimaVigilanciaVacia } = ordenarInvestigaciones(recientes)

  return (
    <section className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">Investigar</h1>
      {enCurso.length > 0 && (
        <section aria-label="En curso" className="space-y-2">
          <h2 className="font-medium">En curso</h2>
          <Refrescar mensaje="" />
          <ul className="space-y-2">
            {enCurso.map((i) => (
              <TarjetaEnCurso key={i.id} i={i} />
            ))}
          </ul>
        </section>
      )}
      {porAprobar.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Por aprobar</h2>
          <ul className="space-y-2">
            {porAprobar.map((i) => (
              <Tarjeta key={i.id} i={i} />
            ))}
          </ul>
        </section>
      )}
      <NuevaInvestigacion
        abierta={enCurso.length + porAprobar.length + resto.length === 0}
        sugerencias={sugeridas}
        pedir={pedirInvestigacionAccion}
      />
      {resto.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Investigaciones</h2>
          <ul className="space-y-2">
            {resto.map((i) => (
              <Tarjeta key={i.id} i={i} />
            ))}
          </ul>
        </section>
      )}
      {ultimaVigilanciaVacia && <p className="text-sm text-apagado">{notaDeUltimaVigilancia(ultimaVigilanciaVacia)}</p>}
    </section>
  )
}
