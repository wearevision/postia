import {
  analiticasDeCuenta,
  aprendizajesDeCuenta,
  cuentasConRendimiento,
  rendimientoDeCuenta,
} from "@/lib/rendimiento/lectura"
import { createClient } from "@/lib/supabase/server"
import { actualizarDesdeLinkedinAccion, decidirAprendizajeAccion, pedirLecturaAccion } from "./acciones"
import { VistaDeRendimiento } from "./vista"

function primero(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor
}

export default async function Rendimiento({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const pedida = primero((await searchParams).cuenta)
  const db = await createClient()
  const cuentas = await cuentasConRendimiento(db)
  const cuenta = cuentas.find((c) => c.id === pedida) ?? cuentas.find((c) => c.tieneDatos) ?? cuentas[0]
  if (!cuenta) return <p className="mx-auto max-w-md text-apagado">Todavía no hay cuentas conectadas.</p>
  const [datos, aprendizajes, analiticas] = await Promise.all([
    rendimientoDeCuenta(db, cuenta.id),
    aprendizajesDeCuenta(db, cuenta.id),
    analiticasDeCuenta(db, cuenta.id),
  ])
  return (
    <VistaDeRendimiento
      cuentas={cuentas}
      cuentaId={cuenta.id}
      datos={datos}
      aprendizajes={aprendizajes}
      analiticas={analiticas}
      acciones={{
        decidir: decidirAprendizajeAccion,
        pedirLectura: pedirLecturaAccion,
        actualizarDesdeLinkedin: actualizarDesdeLinkedinAccion,
      }}
      ahora={Date.now()}
    />
  )
}
