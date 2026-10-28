import { createClient } from "@/lib/supabase/server"
import { FormularioDePieza } from "./formulario"

export default async function NuevaPieza() {
  const { data: cuentas, error } = await (await createClient())
    .from("cuentas")
    .select("id, nombre, marca_id, marcas(nombre)")
    .order("creada_en")
  if (error) throw new Error(`No pude leer las cuentas: ${error.message}`, { cause: error })
  return (
    <section className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">Nueva pieza</h1>
      <FormularioDePieza
        cuentas={cuentas.map((c) => ({
          id: c.id,
          marcaId: c.marca_id,
          nombre: c.nombre,
          marca: c.marcas?.nombre ?? "",
        }))}
      />
    </section>
  )
}
