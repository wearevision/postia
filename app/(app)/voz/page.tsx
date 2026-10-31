import Link from "next/link"
import { rutaDeVoz } from "@/lib/sesion/rutas"
import { createClient } from "@/lib/supabase/server"
import { marcasConLinea } from "@/lib/voz/lectura"

export default async function Voz() {
  const marcas = await marcasConLinea(await createClient())
  return (
    <section className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">Voz y línea editorial</h1>
      <p className="text-apagado">
        Cada vez que guardas se crea una versión nueva. Las anteriores quedan para consultar.
      </p>
      {marcas.length === 0 ? (
        <p>Todavía no tienes marcas.</p>
      ) : (
        <ul className="space-y-2">
          {marcas.map((m) => (
            <li key={m.id}>
              <Link href={rutaDeVoz(m.id)} className="boton w-full justify-start py-3">
                <span className="font-medium">{m.nombre}</span>
                <span className="text-apagado"> · {m.version ? `versión ${m.version}` : "sin línea todavía"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
