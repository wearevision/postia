import { cuentasConRendimiento, rendimientoDeCuenta } from "@/lib/rendimiento/lectura"
import { createClient } from "@/lib/supabase/server"
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
  const datos = await rendimientoDeCuenta(db, cuenta.id)
  return <VistaDeRendimiento cuentas={cuentas} cuentaId={cuenta.id} datos={datos} />
}
