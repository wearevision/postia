import { RUTA_DE_SALIR } from "@/lib/sesion/rutas"
import { guardarSuscripcionAccion, probarAvisoAccion } from "./acciones"
import { AvisosDelCelular } from "./avisos-del-celular"

export default function Ajustes() {
  return (
    <section className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">Ajustes</h1>
      <AvisosDelCelular
        claveVapid={process.env.VAPID_PUBLIC_KEY?.trim() || null}
        guardar={guardarSuscripcionAccion}
        probar={probarAvisoAccion}
      />
      <a href={RUTA_DE_SALIR} className="block min-h-11 py-3 text-sm text-apagado">
        Salir
      </a>
    </section>
  )
}
