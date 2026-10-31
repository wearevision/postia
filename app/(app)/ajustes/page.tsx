import Link from "next/link"
import { resumenDeGasto } from "@/lib/gasto/lectura"
import { RUTA_DE_CLIENTES, RUTA_DE_SALIR, RUTA_DE_VOZ } from "@/lib/sesion/rutas"
import { createClient } from "@/lib/supabase/server"
import { mensajeDeLinkedin } from "../marcas/mensajes"
import { guardarSuscripcionAccion, guardarTopeAccion, probarAvisoAccion } from "./acciones"
import { AvisosDelCelular } from "./avisos-del-celular"
import { CuentasDeLinkedin } from "./cuentas"
import { GastoDelMes } from "./gasto"

export default async function Ajustes({ searchParams }: { searchParams: Promise<{ linkedin?: string }> }) {
  const mensaje = mensajeDeLinkedin((await searchParams).linkedin)
  // A person without a brand never reaches the app shell, so a failing read is a real error and should surface.
  const resumen = await resumenDeGasto(await createClient())
  return (
    <section className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">Ajustes</h1>
      {mensaje && <output className="block tarjeta p-3 text-sm">{mensaje}</output>}
      <CuentasDeLinkedin />
      <AvisosDelCelular
        claveVapid={process.env.VAPID_PUBLIC_KEY?.trim() || null}
        guardar={guardarSuscripcionAccion}
        probar={probarAvisoAccion}
      />
      <GastoDelMes resumen={resumen} guardar={guardarTopeAccion} />
      <nav aria-label="Más" className="space-y-2">
        <Link href={RUTA_DE_VOZ} className="boton w-full justify-start py-3">
          Voz y línea editorial
        </Link>
        <Link href={RUTA_DE_CLIENTES} className="boton w-full justify-start py-3">
          Clientes
        </Link>
      </nav>
      <a href={RUTA_DE_SALIR} className="block min-h-11 py-3 text-sm text-apagado">
        Salir
      </a>
    </section>
  )
}
