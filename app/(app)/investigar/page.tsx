import Link from "next/link"
import {
  estaAbierta,
  investigacionesRecientes,
  NOMBRE_DEL_ESTADO_DE_INVESTIGACION,
  sugerencias,
} from "@/lib/investigacion/lectura"
import { fechaLarga } from "@/lib/piezas/fechas"
import { rutaDeInvestigacion } from "@/lib/sesion/rutas"
import { createClient } from "@/lib/supabase/server"
import { Refrescar } from "../piezas/refrescar"
import { pedirInvestigacionAccion } from "./acciones"
import { FormularioDeInvestigacion } from "./formulario"

function cuantos(n: number): string {
  return n === 1 ? "1 hallazgo" : `${n} hallazgos`
}

export default async function Investigar() {
  const db = await createClient()
  const [recientes, sugeridas] = await Promise.all([investigacionesRecientes(db, 20), sugerencias(db)])
  const abiertas = recientes.some((i) => estaAbierta(i.estado))

  return (
    <section className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">Investigar</h1>
      <FormularioDeInvestigacion sugerencias={sugeridas} pedir={pedirInvestigacionAccion} />
      {recientes.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Investigaciones</h2>
          {abiertas && <Refrescar mensaje="Se está investigando. Esta página se actualiza sola." />}
          <ul className="space-y-2">
            {recientes.map((i) => (
              <li key={i.id}>
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
            ))}
          </ul>
        </section>
      )}
    </section>
  )
}
