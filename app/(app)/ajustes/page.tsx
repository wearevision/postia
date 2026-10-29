import Link from "next/link"
import { RUTA_DE_CLIENTES, RUTA_DE_SALIR, RUTA_DE_VOZ } from "@/lib/sesion/rutas"
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
      <nav aria-label="Más" className="space-y-2">
        <Link href={RUTA_DE_VOZ} className="block min-h-11 rounded-lg border border-borde px-4 py-3">
          Voz y línea editorial
        </Link>
        <Link href={RUTA_DE_CLIENTES} className="block min-h-11 rounded-lg border border-borde px-4 py-3">
          Clientes
        </Link>
      </nav>
      <a href={RUTA_DE_SALIR} className="block min-h-11 py-3 text-sm text-apagado">
        Salir
      </a>
    </section>
  )
}
