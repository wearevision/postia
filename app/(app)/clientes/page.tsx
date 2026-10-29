import { clientes } from "@/lib/clientes/lectura"
import { createClient } from "@/lib/supabase/server"
import { marcarExcepcionAccion, quitarExcepcionAccion } from "./acciones"
import { ClienteFueraDeLaLista, ExcepcionesDeCliente } from "./excepciones"

export default async function Clientes() {
  const lista = await clientes(await createClient())
  return (
    <section className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">Clientes</h1>
      <p className="text-apagado">
        Todos se pueden nombrar salvo los que marques aquí. Nunca se publican precios ni presupuestos.
      </p>
      <ClienteFueraDeLaLista marcar={marcarExcepcionAccion} />
      {lista.length === 0 ? (
        <p>Todavía no hay casos cargados.</p>
      ) : (
        <ul className="space-y-2">
          {lista.map((c) => (
            <li key={c.cliente}>
              <ExcepcionesDeCliente cliente={c} marcar={marcarExcepcionAccion} quitar={quitarExcepcionAccion} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
