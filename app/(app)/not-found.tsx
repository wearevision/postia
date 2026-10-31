import Link from "next/link"
import { RUTA_DE_INICIO } from "@/lib/sesion/rutas"

export default function NoEncontrada() {
  return (
    <section className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">No encontré esta página</h1>
      <p className="text-apagado">Puede que la pieza se haya descartado o que el enlace esté incompleto.</p>
      <Link href={RUTA_DE_INICIO} className="boton w-full py-3">
        Ir a Inicio
      </Link>
    </section>
  )
}
