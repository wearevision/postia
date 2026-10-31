import Link from "next/link"
import { notFound } from "next/navigation"
import { carruselParaEditar } from "@/lib/disenos/lectura"
import { rutaDePieza } from "@/lib/sesion/rutas"
import { createClient } from "@/lib/supabase/server"
import { pedirDisenoAccion } from "./acciones"
import { EditorDeCarrusel } from "./editor"

export default async function Carrusel({ searchParams }: { searchParams: Promise<{ pieza?: string | string[] }> }) {
  const { pieza: piezaId } = await searchParams
  // Carousels are written from approved ideas; this screen only edits the one of an existing piece.
  if (typeof piezaId !== "string") notFound()
  const db = await createClient()
  // Only owners can ask; pedir_diseno enforces it, and a member gets its refusal message.
  const [cuentas, inicial] = await Promise.all([
    db.from("cuentas").select("id, nombre, marcas(voz)").order("nombre"),
    carruselParaEditar(db, piezaId),
  ])
  if (cuentas.error) throw new Error(`No pude leer las cuentas: ${cuentas.error.message}`, { cause: cuentas.error })
  const disponibles = cuentas.data.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    voz: c.marcas?.voz === "nosotros" ? ("nosotros" as const) : ("yo" as const),
  }))

  if (!inicial)
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
      <h1 className="text-2xl font-semibold">Editar carrusel</h1>
      {disponibles.length === 0 ? (
        <p className="text-apagado">Todavía no hay cuentas.</p>
      ) : (
        <EditorDeCarrusel cuentas={disponibles} inicial={inicial} pedir={pedirDisenoAccion} />
      )}
    </section>
  )
}
