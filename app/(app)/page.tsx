import { leerSesion } from "@/lib/sesion/sesion"
import { createClient } from "@/lib/supabase/server"

export default async function Inicio() {
  const sesion = await leerSesion(await createClient())
  const marcas = sesion.estado === "miembro" ? sesion.marcas : []
  return (
    <section className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">Inicio</h1>
      <p className="text-apagado">Aquí vas a firmar lo que sale. Por ahora, tus marcas:</p>
      <ul className="space-y-2">
        {marcas.map((marca) => (
          <li key={marca.id} className="rounded-lg border border-borde p-3">
            {marca.nombre}
          </li>
        ))}
      </ul>
    </section>
  )
}
