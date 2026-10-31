import Link from "next/link"
import { z } from "zod"
import { esUuid } from "@/lib/linkedin/estado-oauth"
import { RUTA_DE_MARCAS } from "@/lib/sesion/rutas"
import { createClient } from "@/lib/supabase/server"
import { elegirPaginaAccion } from "./acciones"

const Paginas = z.array(z.object({ urn: z.string(), nombre: z.string() }))

// RLS shows a choice only to the person who started it, and only for 10 minutes.
async function leerEleccion(eleccion: string | undefined) {
  if (!esUuid(eleccion)) return null
  const db = await createClient()
  const { data, error } = await db.from("elecciones_de_pagina").select("id, paginas").eq("id", eleccion).maybeSingle()
  if (error) throw new Error(`No pude leer la elección de página: ${error.message}`, { cause: error })
  const paginas = Paginas.safeParse(data?.paginas)
  return data && paginas.success ? { id: data.id, paginas: paginas.data } : null
}

export default async function ElegirPagina({ searchParams }: { searchParams: Promise<{ eleccion?: string }> }) {
  const eleccion = await leerEleccion((await searchParams).eleccion)

  return (
    <section className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">¿Qué página conecto?</h1>
      {eleccion ? (
        <>
          <p className="text-sm text-apagado">
            Toca la página que publica esta cuenta. Hasta que la elijas, no queda conectada.
          </p>
          <ul className="space-y-2">
            {eleccion.paginas.map((pagina) => (
              <li key={pagina.urn}>
                <form action={elegirPaginaAccion}>
                  <input type="hidden" name="eleccion" value={eleccion.id} />
                  <input type="hidden" name="organizacion" value={pagina.urn} />
                  <button type="submit" className="boton w-full justify-start py-3">
                    {pagina.nombre}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="tarjeta p-3 text-sm">
          Esta elección venció o no es tuya. Vuelve a conectar la página desde Marcas.
        </p>
      )}
      <Link href={RUTA_DE_MARCAS} className="inline-block min-h-11 py-2 text-sm text-apagado">
        Volver a Marcas
      </Link>
    </section>
  )
}
