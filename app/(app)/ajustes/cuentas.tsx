import Link from "next/link"
import { cambiarRutaAccion, desconectarCuentaAccion } from "@/app/(app)/marcas/acciones"
import { ConectarLinkedin } from "@/app/(app)/marcas/conectar-linkedin"
import { Desconectar } from "@/app/(app)/marcas/desconectar"
import { EstadoDeConexionChip } from "@/app/(app)/marcas/estado-de-conexion"
import { estadoDeCuenta } from "@/app/(app)/marcas/estado-de-cuenta"
import { RutaDeCuenta } from "@/app/(app)/marcas/ruta-de-cuenta"
import { piezasProgramadas } from "@/lib/marcas/programadas"
import { RUTA_DE_MARCAS } from "@/lib/sesion/rutas"
import { createClient } from "@/lib/supabase/server"

const RUTAS: Record<string, string> = { api: "sale sola", a_mano: "a mano", metricool: "por Metricool" }

export async function CuentasDeLinkedin() {
  const db = await createClient()
  const { data: marcas, error } = await db
    .from("marcas")
    .select(
      "id, nombre, voz, cuentas(id, nombre, tipo, ruta, ritmo_semanal, conexiones(nombre, expira_en, renovacion_expira_en))",
    )
    .order("creada_en")
  if (error) throw new Error(`No pude leer las marcas: ${error.message}`, { cause: error })
  const programadas = await piezasProgramadas(
    db,
    marcas.flatMap((marca) => marca.cuentas.map((cuenta) => cuenta.id)),
  )
  const ahora = Date.now()

  return (
    <section aria-labelledby="cuentas-de-linkedin" className="space-y-4">
      <h2 id="cuentas-de-linkedin" className="text-lg font-semibold">
        Cuentas de LinkedIn
      </h2>
      {marcas.map((marca) => (
        <article key={marca.id} className="space-y-3 tarjeta p-4">
          <header>
            <h3 className="text-base font-medium">{marca.nombre}</h3>
            <p className="text-sm text-apagado">Habla como «{marca.voz}»</p>
          </header>
          <ul className="space-y-3">
            {marca.cuentas.map((cuenta) => (
              <li key={cuenta.id} className="space-y-2">
                <p className="font-medium">{cuenta.nombre}</p>
                <p className="text-sm text-apagado">
                  {cuenta.tipo === "persona" ? "Perfil" : "Página"} de LinkedIn · {RUTAS[cuenta.ruta]} ·{" "}
                  {cuenta.ritmo_semanal} por semana
                </p>
                <RutaDeCuenta
                  cuentaId={cuenta.id}
                  nombre={cuenta.nombre}
                  ruta={cuenta.ruta}
                  conectada={cuenta.conexiones !== null}
                  programadas={programadas.get(cuenta.id) ?? 0}
                  cambiar={cambiarRutaAccion}
                />
                {/* A paused account («a mano» with its connection) keeps its chip and its disconnect button. */}
                {(cuenta.ruta === "api" || cuenta.conexiones) && (
                  <div className="flex flex-wrap items-center gap-2">
                    <EstadoDeConexionChip estado={estadoDeCuenta(cuenta.conexiones, ahora)} />
                    {cuenta.ruta === "api" && (
                      <ConectarLinkedin
                        cuentaId={cuenta.id}
                        tipo={cuenta.tipo}
                        conectada={cuenta.conexiones !== null}
                      />
                    )}
                    {cuenta.conexiones && <Desconectar cuentaId={cuenta.id} desconectar={desconectarCuentaAccion} />}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </article>
      ))}
      <Link href={RUTA_DE_MARCAS} className="inline-block min-h-11 py-3 text-sm underline">
        Agregar cuenta o marca
      </Link>
    </section>
  )
}
