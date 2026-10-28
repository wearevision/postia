import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { Falla } from "@/lib/dominio/falla"
import { leerPdf } from "@/lib/fase0/pdf-de-prueba"
import { huellaDe, sha256 } from "@/lib/piezas/huella"
import { type EntradaDeCopy, leerCopy } from "@/lib/piezas/importar"
import { BYTES_MAXIMOS_DEL_CARRUSEL } from "@/lib/piezas/limites"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Db } from "@/lib/supabase/database"

const CARPETA_POR_DEFECTO = join(homedir(), "Projects/wr3-web/social/linkedin/out")
const MARCA = "WAV"
const CUENTA = "Página de WAV"

interface Cuenta {
  id: string
  marcaId: string
}

async function main() {
  const { values } = parseArgs({
    options: { correo: { type: "string" }, carpeta: { type: "string" } },
  })
  const correo = (values.correo ?? "federico@wearevision.cl").trim().toLowerCase()
  const carpeta = values.carpeta ?? CARPETA_POR_DEFECTO
  const db = createAdminClient()

  const entradas = leerCopy(await leer(join(carpeta, "copy.md")))
  const cuenta = await buscarCuenta(db)
  const userId = await buscarUsuario(db, correo)

  for (const entrada of entradas) {
    const resultado = await cargar(db, cuenta, userId, entrada, carpeta)
    console.log(`${resultado === "nueva" ? "nueva    " : "ya estaba"}  ${entrada.titulo}`)
  }
}

async function leer(ruta: string): Promise<string> {
  try {
    return await readFile(ruta, "utf8")
  } catch (error) {
    throw new Falla(`No pude leer ${ruta}: ${error instanceof Error ? error.message : "sin detalle"}`)
  }
}

async function buscarCuenta(db: Db): Promise<Cuenta> {
  const { data: marca, error } = await db.from("marcas").select("id").eq("nombre", MARCA).maybeSingle()
  if (error) throw new Error(`No pude buscar la marca ${MARCA}: ${error.message}`, { cause: error })
  if (!marca) throw new Falla(`No existe la marca «${MARCA}». Créala con pnpm invitar antes de cargar.`)
  const { data: cuenta, error: errorDeCuenta } = await db
    .from("cuentas")
    .select("id")
    .eq("marca_id", marca.id)
    .eq("nombre", CUENTA)
    .maybeSingle()
  if (errorDeCuenta)
    throw new Error(`No pude buscar la cuenta ${CUENTA}: ${errorDeCuenta.message}`, { cause: errorDeCuenta })
  if (!cuenta) throw new Falla(`La marca «${MARCA}» no tiene la cuenta «${CUENTA}».`)
  return { id: cuenta.id, marcaId: marca.id }
}

async function buscarUsuario(db: Db, correo: string): Promise<string> {
  // The admin API has no lookup by email; the team is a handful of people, so one page holds everyone.
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw new Error(`No pude listar usuarios: ${error.message}`, { cause: error })
  const usuario = data.users.find((u) => u.email?.toLowerCase() === correo)
  if (!usuario) throw new Falla(`No existe un usuario con el correo ${correo}.`)
  return usuario.id
}

async function yaEstaba(db: Db, cuentaId: string, hash: string): Promise<boolean> {
  const { data: piezas, error } = await db.from("piezas").select("id").eq("cuenta_id", cuentaId)
  if (error) throw new Error(`No pude leer las piezas: ${error.message}`, { cause: error })
  if (piezas.length === 0) return false
  const { data, error: errorDeVersiones } = await db
    .from("versiones")
    .select("id")
    .eq("archivo_sha256", hash)
    .in(
      "pieza_id",
      piezas.map((p) => p.id),
    )
    .limit(1)
  if (errorDeVersiones)
    throw new Error(`No pude leer las versiones: ${errorDeVersiones.message}`, { cause: errorDeVersiones })
  return data.length > 0
}

async function cargar(
  db: Db,
  cuenta: Cuenta,
  userId: string,
  entrada: EntradaDeCopy,
  carpeta: string,
): Promise<"nueva" | "ya estaba"> {
  let datos: Uint8Array
  try {
    datos = new Uint8Array(await readFile(join(carpeta, entrada.pdf)))
  } catch (error) {
    throw new Falla(
      `«${entrada.titulo}»: no pude leer ${entrada.pdf} (${error instanceof Error ? error.message : "sin detalle"}).`,
    )
  }
  if (datos.byteLength > BYTES_MAXIMOS_DEL_CARRUSEL) {
    throw new Falla(
      `«${entrada.titulo}»: ${entrada.pdf} pasa el tope de ${BYTES_MAXIMOS_DEL_CARRUSEL / 1024 / 1024} MB.`,
    )
  }
  await leerPdf(datos)
  const hash = sha256(datos)
  if (await yaEstaba(db, cuenta.id, hash)) return "ya estaba"

  const ruta = `${cuenta.marcaId}/${randomUUID()}.pdf`
  const { error: errorDeSubida } = await db.storage
    .from("piezas")
    .upload(ruta, datos, { contentType: "application/pdf" })
  if (errorDeSubida)
    throw new Error(`«${entrada.titulo}»: no pude subir el PDF: ${errorDeSubida.message}`, { cause: errorDeSubida })

  try {
    await crearPieza(db, cuenta.id, userId, entrada, ruta, hash)
  } catch (error) {
    const { error: errorAlBorrar } = await db.storage.from("piezas").remove([ruta])
    console.error(
      errorAlBorrar
        ? `No pude borrar el PDF subido ${ruta}: ${errorAlBorrar.message}`
        : `Borré el PDF subido ${ruta} porque la pieza no se creó.`,
    )
    throw error
  }
  return "nueva"
}

async function crearPieza(
  db: Db,
  cuentaId: string,
  userId: string,
  entrada: EntradaDeCopy,
  ruta: string,
  hash: string,
): Promise<void> {
  const { data: pieza, error } = await db
    .from("piezas")
    .insert({ cuenta_id: cuentaId, formato: "carrusel_pdf", creada_por: userId })
    .select("id")
    .single()
  if (error) throw new Error(`«${entrada.titulo}»: no pude crear la pieza: ${error.message}`, { cause: error })
  const { error: errorDeVersion } = await db.from("versiones").insert({
    pieza_id: pieza.id,
    numero: 1,
    texto: entrada.texto,
    titulo: entrada.titulo,
    archivo_ruta: ruta,
    archivo_sha256: hash,
    // The trigger recomputes it; the generated insert type just requires the column.
    huella: huellaDe({ formato: "carrusel_pdf", titulo: entrada.titulo, archivoSha256: hash, texto: entrada.texto }),
    creada_por: userId,
  })
  if (errorDeVersion) {
    // Without its version the piece is an empty shell: remove it so a retry starts clean.
    const { error: errorAlBorrar } = await db.from("piezas").delete().eq("id", pieza.id)
    if (errorAlBorrar) console.error(`No pude borrar la pieza ${pieza.id} sin versión: ${errorAlBorrar.message}`)
    throw new Error(`«${entrada.titulo}»: no pude crear la versión: ${errorDeVersion.message}`, {
      cause: errorDeVersion,
    })
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Falla ? error.message : error)
  process.exitCode = 1
})
