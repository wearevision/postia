import Link from "next/link"
import { carruselParaEditar, type EstadoDePedidoDeDiseno, pedidosDeDisenoRecientes } from "@/lib/disenos/lectura"
import { fechaLarga } from "@/lib/piezas/fechas"
import { rutaDePieza } from "@/lib/sesion/rutas"
import { createClient } from "@/lib/supabase/server"
import { Refrescar } from "../refrescar"
import { pedirDisenoAccion } from "./acciones"
import { EditorDeCarrusel } from "./editor"

const NOMBRE: Record<EstadoDePedidoDeDiseno, string> = {
  pendiente: "En cola",
  trabajando: "Armando",
  hecho: "Listo",
  fallo: "No salió",
  obsoleto: "No se aplicó",
}

export default async function Carrusel({ searchParams }: { searchParams: Promise<{ pieza?: string | string[] }> }) {
  const { pieza } = await searchParams
  const piezaId = typeof pieza === "string" ? pieza : null
  const db = await createClient()
  // Only owners can ask; pedir_diseno enforces it, and a member gets its refusal message.
  const [cuentas, pedidos, inicial] = await Promise.all([
    db.from("cuentas").select("id, nombre, marcas(voz)").order("nombre"),
    piezaId ? Promise.resolve([]) : pedidosDeDisenoRecientes(db),
    piezaId ? carruselParaEditar(db, piezaId) : null,
  ])
  if (cuentas.error) throw new Error(`No pude leer las cuentas: ${cuentas.error.message}`, { cause: cuentas.error })
  const disponibles = cuentas.data.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    voz: c.marcas?.voz === "nosotros" ? ("nosotros" as const) : ("yo" as const),
  }))
  const abiertos = pedidos.some((p) => p.estado === "pendiente" || p.estado === "trabajando")

  if (piezaId && !inicial)
    return (
      <section className="mx-auto max-w-md space-y-4">
        <h1 className="text-2xl font-semibold">Editar carrusel</h1>
        <p>Este carrusel no se puede editar.</p>
        <Link href={rutaDePieza(piezaId)} className="underline">
          Volver a la pieza
        </Link>
      </section>
    )

  return (
    <section className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">{inicial ? "Editar carrusel" : "Nuevo carrusel"}</h1>
      {disponibles.length === 0 ? (
        <p className="text-apagado">Todavía no hay cuentas.</p>
      ) : (
        <EditorDeCarrusel cuentas={disponibles} inicial={inicial ?? undefined} pedir={pedirDisenoAccion} />
      )}
      {pedidos.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Carruseles recientes</h2>
          {abiertos && <Refrescar mensaje="Se está armando el carrusel. Esta página se actualiza sola." />}
          <ul className="space-y-2">
            {pedidos.map((p) => (
              <li key={p.id} className="space-y-1 rounded-lg border border-borde p-3 text-sm">
                <p className="text-apagado">
                  {p.cuenta} · {fechaLarga(p.creadoEn)} · {NOMBRE[p.estado]}
                </p>
                <p className="line-clamp-2">{p.titulo}</p>
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
