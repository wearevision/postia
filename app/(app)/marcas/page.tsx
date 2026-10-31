import { piezasProgramadas } from "@/lib/marcas/programadas"
import { createClient } from "@/lib/supabase/server"
import { cambiarRutaAccion, desconectarCuentaAccion } from "./acciones"
import { ConectarLinkedin } from "./conectar-linkedin"
import { EstadoDeConexionChip } from "./estado-de-conexion"
import { estadoDeCuenta } from "./estado-de-cuenta"
import { FormularioCuenta } from "./formulario-cuenta"
import { FormularioMarca } from "./formulario-marca"
import { mensajeDeLinkedin } from "./mensajes"
import { RutaDeCuenta } from "./ruta-de-cuenta"

const RUTAS: Record<string, string> = { api: "sale sola", a_mano: "a mano", metricool: "por Metricool" }

export default async function Marcas({ searchParams }: { searchParams: Promise<{ linkedin?: string }> }) {
  const { linkedin } = await searchParams
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
  const mensaje = mensajeDeLinkedin(linkedin)

  return (
    <section className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">Marcas y cuentas</h1>
      {mensaje && <output className="block rounded-lg border border-borde p-3 text-sm">{mensaje}</output>}
      {marcas.map((marca) => (
        <article key={marca.id} className="space-y-3 rounded-lg border border-borde p-4">
          <header>
            <h2 className="text-lg font-medium">{marca.nombre}</h2>
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
                    {cuenta.conexiones && (
                      <form action={desconectarCuentaAccion}>
                        <input type="hidden" name="cuentaId" value={cuenta.id} />
                        <button type="submit" className="min-h-11 px-3 text-sm text-apagado">
                          Desconectar
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <FormularioCuenta marcaId={marca.id} />
        </article>
      ))}
      <FormularioMarca />
    </section>
  )
}
