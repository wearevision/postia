import { readFile } from "node:fs/promises"
import { parseArgs } from "node:util"
import { z } from "zod"
import { excepcionesIniciales, leerCasos } from "@/lib/clientes/casos"
import { Falla } from "@/lib/dominio/falla"
import { createAdminClient } from "@/lib/supabase/admin"
import { buscarUsuario } from "./usuario"

const ARCHIVO_POR_DEFECTO = "data/casos/casos.json"

// Only what excepcionesIniciales reads; leerCasos has already validated every case in full.
const ExcepcionesDelArchivo = z.object({
  cases: z.array(z.object({ slug: z.string(), client: z.string(), exception: z.enum(["evento privado"]).nullable() })),
})

async function main() {
  const { values } = parseArgs({ options: { correo: { type: "string" }, archivo: { type: "string" } } })
  const correo = (values.correo ?? "federico@wearevision.cl").trim().toLowerCase()
  const ruta = values.archivo ?? ARCHIVO_POR_DEFECTO
  let json: unknown
  try {
    json = JSON.parse(await readFile(ruta, "utf8"))
  } catch (error) {
    throw new Falla(`No pude leer ${ruta}: ${error instanceof Error ? error.message : "sin detalle"}`)
  }
  const casos = leerCasos(json)
  const db = createAdminClient()
  const userId = await buscarUsuario(db, correo)

  // Upsert by slug: running it again after correcting the file updates the rows and creates nothing twice.
  const { error } = await db.from("casos").upsert(casos, { onConflict: "slug" })
  if (error) throw new Error(`No pude guardar los casos: ${error.message}`, { cause: error })
  console.log(`${casos.length} casos de ${new Set(casos.map((c) => c.cliente)).size} clientes`)

  for (const e of excepcionesIniciales(ExcepcionesDelArchivo.parse(json).cases)) {
    // Any row counts, removed ones too: a default Federico lifted in Clientes must not come back on the next load.
    const { data: previas, error: errorDeLectura } = await db
      .from("excepciones")
      .select("id")
      .eq("caso_slug", e.caso_slug)
      .eq("tipo", e.tipo)
      .limit(1)
    if (errorDeLectura) throw new Error(`No pude leer las excepciones: ${errorDeLectura.message}`)
    if (previas.length > 0) continue
    const { error: errorAlMarcar } = await db.from("excepciones").insert({ ...e, puesta_por: userId })
    if (errorAlMarcar) throw new Error(`No pude marcar ${e.cliente}: ${errorAlMarcar.message}`)
    console.log(`excepción  no se nombra  ${e.cliente} (${e.caso_slug})`)
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Falla ? error.message : error)
  process.exitCode = 1
})
