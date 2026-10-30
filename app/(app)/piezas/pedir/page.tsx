import Link from "next/link"
import { fechaLarga } from "@/lib/piezas/fechas"
import { type EstadoDePedido, pedidosRecientes } from "@/lib/redaccion/lectura"
import { rutaDePieza } from "@/lib/sesion/rutas"
import { createClient } from "@/lib/supabase/server"
import { marcasConLinea, pilaresActivos } from "@/lib/voz/lectura"
import { Refrescar } from "../refrescar"
import { pedirTextoAccion } from "./acciones"
import { FormularioDePedido } from "./formulario"

const NOMBRE: Record<EstadoDePedido, string> = {
  pendiente: "En cola",
  trabajando: "Claude escribiendo",
  hecho: "Listo",
  fallo: "No salió",
  obsoleto: "No se aplicó",
}

export default async function PedirTexto() {
  const db = await createClient()
  const [cuentas, marcas, pilares, pedidos] = await Promise.all([
    db.from("cuentas").select("id, nombre, marca_id").order("nombre"),
    marcasConLinea(db),
    pilaresActivos(db),
    pedidosRecientes(db),
  ])
  if (cuentas.error) throw new Error(`No pude leer las cuentas: ${cuentas.error.message}`, { cause: cuentas.error })
  const conLinea = new Set(marcas.filter((m) => m.version > 0).map((m) => m.id))
  const disponibles = cuentas.data
    .filter((c) => conLinea.has(c.marca_id))
    .map((c) => ({ id: c.id, nombre: c.nombre, marcaId: c.marca_id }))
  const abiertos = pedidos.some((p) => p.estado === "pendiente" || p.estado === "trabajando")

  return (
    <section className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">Pedir texto</h1>
      {disponibles.length === 0 ? (
        <p className="text-apagado">Ninguna marca tiene línea editorial todavía. Escríbela en Voz.</p>
      ) : (
        <FormularioDePedido cuentas={disponibles} pilares={pilares} pedir={pedirTextoAccion} />
      )}
      {pedidos.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Pedidos recientes</h2>
          {abiertos && <Refrescar />}
          <ul className="space-y-2">
            {pedidos.map((p) => (
              <li key={p.id} className="space-y-1 rounded-lg border border-borde p-3 text-sm">
                <p className="text-apagado">
                  {p.cuenta} · {fechaLarga(p.creadoEn)} · {NOMBRE[p.estado]}
                </p>
                <p className="line-clamp-2">{p.encargo}</p>
                {p.motivo && <p>{p.motivo}</p>}
                {p.piezaId && (
                  <Link href={rutaDePieza(p.piezaId)} className="underline">
                    Ver la pieza
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  )
}
