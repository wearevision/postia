import Link from "next/link"
import { estadoDeConexion } from "@/lib/marcas/estado-conexion"
import { createClient } from "@/lib/supabase/server"
import { desconectarCuentaAccion } from "./acciones"
import { EstadoDeConexionChip } from "./estado-de-conexion"
import { FormularioCuenta } from "./formulario-cuenta"
import { FormularioMarca } from "./formulario-marca"

const MENSAJES: Record<string, string> = {
  conectada: "LinkedIn quedó conectado.",
  cancelada: "Cancelaste la conexión en LinkedIn.",
  estado: "La conexión expiró o se abrió en otra pestaña. Vuelve a intentarlo.",
  permisos: "LinkedIn no dio permiso para publicar. Vuelve a conectar y acepta todos los permisos.",
  rechazada: "LinkedIn no aceptó la conexión. Vuelve a intentarlo.",
  sin_app: "Falta configurar la app de LinkedIn en el servidor.",
  fallo: "No pude conectar LinkedIn. Inténtalo de nuevo en un rato.",
}

const RUTAS: Record<string, string> = { api: "sale sola", a_mano: "a mano", metricool: "por Metricool" }

export default async function Marcas({ searchParams }: { searchParams: Promise<{ linkedin?: string }> }) {
  const { linkedin } = await searchParams
  const db = await createClient()
  const { data: marcas, error } = await db
    .from("marcas")
    .select("id, nombre, voz, cuentas(id, nombre, tipo, ruta, ritmo_semanal, conexiones(nombre, expira_en))")
    .order("creada_en")
  if (error) throw new Error(`No pude leer las marcas: ${error.message}`, { cause: error })
  const ahora = Date.now()

  return (
    <section className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">Marcas y cuentas</h1>
      {linkedin && MENSAJES[linkedin] && (
        <output className="block rounded-lg border border-borde p-3 text-sm">{MENSAJES[linkedin]}</output>
      )}
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
                {cuenta.ruta === "api" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <EstadoDeConexionChip estado={estadoDeConexion(cuenta.conexiones?.expira_en ?? null, ahora)} />
                    <Link
                      href={`/api/linkedin/conectar?cuenta=${cuenta.id}`}
                      className="min-h-11 rounded-lg border border-borde px-3 py-2 text-sm"
                    >
                      {cuenta.conexiones ? "Renovar LinkedIn" : "Conectar LinkedIn"}
                    </Link>
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
