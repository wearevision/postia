import Link from "next/link"
import { RUTA_DE_AJUSTES } from "@/lib/sesion/rutas"
import { createClient } from "@/lib/supabase/server"
import { FormularioCuenta } from "./formulario-cuenta"
import { FormularioMarca } from "./formulario-marca"

export default async function Marcas() {
  const db = await createClient()
  const { data: marcas, error } = await db.from("marcas").select("id, nombre, voz").order("creada_en")
  if (error) throw new Error(`No pude leer las marcas: ${error.message}`, { cause: error })

  return (
    <section className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">Agregar cuenta o marca</h1>
      <Link href={RUTA_DE_AJUSTES} className="inline-block min-h-11 py-2 text-sm text-apagado">
        Volver a Ajustes
      </Link>
      {marcas.map((marca) => (
        <article key={marca.id} className="space-y-3 tarjeta p-4">
          <header>
            <h2 className="text-lg font-medium">{marca.nombre}</h2>
            <p className="text-sm text-apagado">Habla como «{marca.voz}»</p>
          </header>
          <FormularioCuenta marcaId={marca.id} />
        </article>
      ))}
      <FormularioMarca />
    </section>
  )
}
