import { readFile } from "node:fs/promises"
import { parseArgs } from "node:util"
import { Falla } from "@/lib/dominio/falla"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Db } from "@/lib/supabase/database"
import { leerLinea } from "@/lib/voz/importar"
import { NOMBRE_DE_SECCION, SECCIONES } from "@/lib/voz/linea"
import { buscarUsuario } from "./usuario"

// One-time import of a brand's Claude Doc (exported to markdown) as version 1. After it, the line is edited in the
// app (Voz y línea editorial). The exported file is never committed: pass its path.
async function main() {
  const { values } = parseArgs({
    options: {
      marca: { type: "string" },
      archivo: { type: "string" },
      correo: { type: "string" },
      probar: { type: "boolean", default: false },
    },
  })
  if (!values.marca || !values.archivo) {
    throw new Falla("Uso: pnpm cargar:linea --marca <nombre> --archivo <ruta.md> [--probar]")
  }
  const correo = (values.correo ?? "federico@wearevision.cl").trim().toLowerCase()
  let markdown: string
  try {
    markdown = await readFile(values.archivo, "utf8")
  } catch (error) {
    throw new Falla(`No pude leer ${values.archivo}: ${error instanceof Error ? error.message : "sin detalle"}`)
  }
  const linea = leerLinea(markdown)
  for (const seccion of SECCIONES) {
    console.log(`${NOMBRE_DE_SECCION[seccion].padEnd(20)} ${[...linea.secciones[seccion]].length} caracteres`)
  }
  for (const p of linea.pilares) console.log(`pilar  ${p.porSemana} por semana  ${p.nombre}`)
  if (linea.ignoradas.length) console.log(`no se importan: ${linea.ignoradas.join(", ")}`)
  if (values.probar) return

  const db = createAdminClient()
  const marcaId = await buscarMarca(db, values.marca)
  const { count, error: errorDeConteo } = await db
    .from("lineas_editoriales")
    .select("id", { count: "exact", head: true })
    .eq("marca_id", marcaId)
  if (errorDeConteo) throw new Error(`No pude leer la línea actual: ${errorDeConteo.message}`)
  if ((count ?? 0) > 0) {
    throw new Falla(`«${values.marca}» ya tiene línea editorial: edítala en la app, en Voz y línea editorial.`)
  }
  // Base 0: if another load lands in between, the RPC answers linea_cambio instead of writing a second version 1.
  const { data, error } = await db.rpc("guardar_linea", {
    p_marca: marcaId,
    p_base: 0,
    p_secciones: linea.secciones,
    // A plain object per pillar: an interface is not assignable to the Json type of the RPC.
    p_pilares: linea.pilares.map((p) => ({ ...p })),
    p_autor: await buscarUsuario(db, correo),
  })
  if (error) throw new Error(`No pude guardar la línea: ${error.message}`, { cause: error })
  console.log(`«${values.marca}»: versión ${data}`)
}

async function buscarMarca(db: Db, nombre: string): Promise<string> {
  const { data, error } = await db.from("marcas").select("id").eq("nombre", nombre).maybeSingle()
  if (error) throw new Error(`No pude buscar la marca: ${error.message}`, { cause: error })
  if (!data) throw new Falla(`No existe la marca «${nombre}».`)
  return data.id
}

main().catch((error: unknown) => {
  console.error(error instanceof Falla ? error.message : error)
  process.exitCode = 1
})
